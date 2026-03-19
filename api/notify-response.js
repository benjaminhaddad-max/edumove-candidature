// Vercel Serverless Function — Email étudiant "Réponse Edumove disponible" via Brevo template
// POST /api/notify-response
const { setCorsHeaders, handlePreflight, verifyApiKey, safeError, isValidEmail, capitalize } = require('./_shared');

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (handlePreflight(req, res)) return;
  if (!verifyApiKey(req)) return safeError(res, 401, 'Unauthorized');

  const { email, prenom } = req.body || {};
  if (!email || !isValidEmail(email)) return safeError(res, 400, 'Invalid email');

  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) return safeError(res, 500, 'Email service not configured');

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Edumove Admissions', email: 'admissions@edumove.fr' },
        to: [{ email }],
        templateId: 114,
        params: { PRENOM: capitalize(prenom) }
      })
    });

    if (!response.ok) {
      console.error('Brevo notify-response error');
      return safeError(res, 502, 'Email send failed');
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify-response failed:', err.message);
    return safeError(res, 500, 'Email send failed');
  }
};
