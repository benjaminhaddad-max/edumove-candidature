// Vercel Serverless Function — Sync candidature data to HubSpot CRM
// POST /api/hubspot
const { setCorsHeaders, handlePreflight, verifyApiKey, safeError, isValidEmail } = require('./_shared');

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (handlePreflight(req, res)) return;
  if (!verifyApiKey(req)) return safeError(res, 401, 'Unauthorized');

  const { nom, prenom, email, tel, departement, profil, score, destination, universite, niveau, langues, classementDestinations, moyennePremiere, moyenneTerminale, candidatureId } = req.body;
  if (!email || !isValidEmail(email)) return safeError(res, 400, 'Valid email is required');

  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!hubspotToken) return safeError(res, 500, 'HubSpot not configured');

  const properties = {
    firstname: prenom || '', lastname: nom || '', email,
    phone: tel || '', edumove_departement: departement || '', edumove_profil: profil || '',
    edumove_score: score != null ? String(score) : '', edumove_destination: destination || '',
    edumove_universite: universite || '', edumove_niveau: niveau || '',
    edumove_espagnol: langues?.espagnol || '', edumove_anglais: langues?.anglais || '',
    edumove_italien: langues?.italien || '', edumove_portugais: langues?.portugais || '',
    edumove_classement: Array.isArray(classementDestinations) ? classementDestinations.join(' > ') : '',
    edumove_moyenne_premiere: moyennePremiere || '', edumove_moyenne_terminale: moyenneTerminale || '',
    edumove_candidature_id: candidatureId || ''
  };

  Object.keys(properties).forEach(key => { if (!properties[key]) delete properties[key]; });
  properties.email = email;

  try {
    const createRes = await hubspotRequest(hubspotToken, 'POST', '/crm/v3/objects/contacts', { properties });
    if (createRes.status === 201) {
      const body = await createRes.json().catch(() => ({}));
      return res.status(200).json({ success: true, action: 'created' });
    }
    if (createRes.status === 409) {
      const updateRes = await hubspotRequest(hubspotToken, 'PATCH', `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`, { properties });
      if (updateRes.ok) return res.status(200).json({ success: true, action: 'updated' });
      return safeError(res, 502, 'HubSpot update failed');
    }
    return safeError(res, 502, 'HubSpot create failed');
  } catch (err) {
    console.error('HubSpot sync error:', err.message);
    return safeError(res, 500, 'HubSpot sync failed');
  }
};

async function hubspotRequest(token, method, path, body) {
  return fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
}
