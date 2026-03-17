// Vercel Serverless Function — Sync candidature data to HubSpot CRM
// POST /api/hubspot

module.exports = async function handler(req, res) {
  // CORS headers for same-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vérification du secret partagé
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.HUBSPOT_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    nom, prenom, email, tel, departement,
    profil, score, destination, universite, niveau,
    langues, classementDestinations,
    moyennePremiere, moyenneTerminale,
    candidatureId
  } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Mapping candidature → propriétés HubSpot
  const properties = {
    firstname: prenom || '',
    lastname: nom || '',
    email: email,
    phone: tel || '',
    edumove_departement: departement || '',
    edumove_profil: profil || '',
    edumove_score: score != null ? String(score) : '',
    edumove_destination: destination || '',
    edumove_universite: universite || '',
    edumove_niveau: niveau || '',
    edumove_espagnol: langues?.espagnol || '',
    edumove_anglais: langues?.anglais || '',
    edumove_italien: langues?.italien || '',
    edumove_portugais: langues?.portugais || '',
    edumove_classement: Array.isArray(classementDestinations)
      ? classementDestinations.join(' > ')
      : '',
    edumove_moyenne_premiere: moyennePremiere || '',
    edumove_moyenne_terminale: moyenneTerminale || '',
    edumove_candidature_id: candidatureId || ''
  };

  // Supprimer les valeurs vides
  Object.keys(properties).forEach(key => {
    if (properties[key] === '' || properties[key] === null || properties[key] === undefined) {
      delete properties[key];
    }
  });

  // Toujours garder email (clé de dédup)
  properties.email = email;

  try {
    // 1. Tenter de créer le contact
    const createRes = await hubspotRequest('POST', '/crm/v3/objects/contacts', { properties });
    const createBody = await createRes.json().catch(() => ({}));

    if (createRes.status === 201) {
      return res.status(200).json({
        success: true,
        hubspotId: createBody.id,
        action: 'created'
      });
    }

    // 2. Si 409 (contact existe déjà) → mise à jour par email
    if (createRes.status === 409) {
      const updateRes = await hubspotRequest(
        'PATCH',
        `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
        { properties }
      );
      const updateBody = await updateRes.json().catch(() => ({}));

      if (updateRes.ok) {
        return res.status(200).json({
          success: true,
          hubspotId: updateBody.id,
          action: 'updated'
        });
      }

      console.error('HubSpot update error:', updateRes.status, JSON.stringify(updateBody));
      return res.status(502).json({ error: 'HubSpot update failed', status: updateRes.status });
    }

    // 3. Autre erreur
    console.error('HubSpot create error:', createRes.status, JSON.stringify(createBody));
    return res.status(502).json({ error: 'HubSpot create failed', status: createRes.status });

  } catch (err) {
    console.error('HubSpot sync exception:', err.message || err);
    return res.status(500).json({ error: 'Internal error during HubSpot sync' });
  }
};

// Helper : requête authentifiée vers l'API HubSpot
async function hubspotRequest(method, path, body) {
  const url = `https://api.hubapi.com${path}`;
  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
}
