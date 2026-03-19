// Vercel Serverless Function — Envoi SMS via SMS Factor
// POST /api/send-sms
const { setCorsHeaders, handlePreflight, verifyApiKey, safeError, isValidPhone, normalizePhone, capitalize } = require('./_shared');

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (handlePreflight(req, res)) return;
  if (!verifyApiKey(req)) return safeError(res, 401, 'Unauthorized');

  if (process.env.SMS_ENABLED !== 'true') {
    return res.status(200).json({ ok: false, reason: 'SMS disabled' });
  }

  const { tel, prenom } = req.body || {};
  if (!tel || !isValidPhone(tel)) return safeError(res, 400, 'Invalid phone number');

  const token = process.env.SMS_FACTOR_TOKEN;
  if (!token) return safeError(res, 500, 'SMS service not configured');

  const phone = normalizePhone(tel);
  const nom = capitalize(prenom);
  const siteUrl = process.env.SITE_URL || 'https://candidature.edumove.fr';
  const message = `Bonjour ${nom}, votre réponse Edumove est disponible ! Connectez-vous à votre espace candidat pour la consulter : ${siteUrl}`;

  try {
    const response = await fetch('https://api.smsfactor.com/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ sms: { message: { text: message, pushtype: 'marketing', sender: 'Edumove' }, recipients: { gsm: [{ value: phone }] } } })
    });

    const data = await response.json();
    if (!response.ok || data.status === 0) return safeError(res, 502, 'SMS send failed');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('SMS send failed:', err.message);
    return safeError(res, 500, 'SMS send failed');
  }
};
