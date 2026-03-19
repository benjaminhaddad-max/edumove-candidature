// Vercel Serverless Function — Envoi SMS en masse via SMS Factor
// POST /api/bulk-sms
const { setCorsHeaders, handlePreflight, verifyApiKey, safeError, isValidPhone, normalizePhone } = require('./_shared');

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (handlePreflight(req, res)) return;
  if (!verifyApiKey(req)) return safeError(res, 401, 'Unauthorized');

  if (process.env.SMS_ENABLED !== 'true') return res.status(200).json({ ok: false, reason: 'SMS disabled' });

  const { recipients, message, shortLinks, pushtype } = req.body || {};
  if (!Array.isArray(recipients) || !recipients.length) return safeError(res, 400, 'Missing recipients');
  if (!message || typeof message !== 'string') return safeError(res, 400, 'Missing message');
  if (recipients.length > 200) return safeError(res, 400, 'Max 200 recipients per batch');

  const smsType = pushtype === 'marketing' ? 'marketing' : 'alert'; // default to transactionnel

  const token = process.env.SMS_FACTOR_TOKEN;
  if (!token) return safeError(res, 500, 'SMS service not configured');

  const results = { sent: 0, failed: 0, errors: [] };

  for (const r of recipients) {
    if (!r.tel || !isValidPhone(r.tel)) { results.failed++; continue; }
    const phone = normalizePhone(r.tel);
    const prenom = r.prenom ? r.prenom.charAt(0).toUpperCase() + r.prenom.slice(1).toLowerCase() : '';
    const personalizedMsg = message.replace(/\{prenom\}/gi, prenom);

    try {
      const resp = await fetch('https://api.smsfactor.com/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ sms: { message: { text: personalizedMsg, pushtype: smsType, sender: 'Edumove', ...(shortLinks ? { shortlink: 1 } : {}) }, recipients: { gsm: [{ value: phone }] } } })
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.status !== 0) { results.sent++; }
      else { results.failed++; }
    } catch (err) {
      results.failed++;
    }
  }

  return res.status(200).json({ ok: true, results });
};
