// Vercel Serverless Function — Envoi SMS en masse via SMS Factor
// POST /api/bulk-sms
const { setCorsHeaders, handlePreflight, verifyApiKey, safeError, isValidPhone, normalizePhone } = require('./_shared');

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (handlePreflight(req, res)) return;
  if (!verifyApiKey(req)) return safeError(res, 401, 'Unauthorized');

  if (process.env.SMS_ENABLED !== 'true') return res.status(200).json({ ok: false, reason: 'SMS disabled' });

  const { recipients, message, shortLinks, pushtype, delay } = req.body || {};
  if (!Array.isArray(recipients) || !recipients.length) return safeError(res, 400, 'Missing recipients');
  if (!message || typeof message !== 'string') return safeError(res, 400, 'Missing message');
  if (recipients.length > 500) return safeError(res, 400, 'Max 500 recipients per batch');

  const smsType = pushtype === 'marketing' ? 'marketing' : 'alert';

  const token = process.env.SMS_FACTOR_TOKEN;
  if (!token) return safeError(res, 500, 'SMS service not configured');

  // Filter valid phone numbers
  const validRecipients = recipients.filter(r => r.tel && isValidPhone(r.tel));
  const invalidCount = recipients.length - validRecipients.length;

  if (validRecipients.length === 0) {
    return res.status(200).json({ ok: true, results: { sent: 0, failed: invalidCount, errors: ['No valid phone numbers'] } });
  }

  const hasPersonalization = message.includes('{prenom}') || message.includes('{PRENOM}');

  try {
    if (!hasPersonalization) {
      // === BULK MODE: 1 single API call with all numbers ===
      const gsmList = validRecipients.map(r => ({ value: normalizePhone(r.tel) }));

      const resp = await fetch('https://api.smsfactor.com/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          sms: {
            message: { text: message, pushtype: smsType, sender: 'Edumove', ...(shortLinks ? { shortlink: 1 } : {}), ...(delay ? { delay } : {}) },
            recipients: { gsm: gsmList }
          }
        })
      });
      const data = await resp.json().catch(() => ({}));

      if (resp.ok && data.status !== 0) {
        return res.status(200).json({ ok: true, results: { sent: validRecipients.length, failed: invalidCount, errors: [] } });
      } else {
        return res.status(200).json({ ok: true, results: { sent: 0, failed: recipients.length, errors: [data.message || 'SMS Factor error'] } });
      }

    } else {
      // === PERSONALIZED MODE: individual calls with small delay ===
      const results = { sent: 0, failed: invalidCount, errors: [] };

      for (let i = 0; i < validRecipients.length; i++) {
        const r = validRecipients[i];
        const phone = normalizePhone(r.tel);
        const prenom = r.prenom ? r.prenom.charAt(0).toUpperCase() + r.prenom.slice(1).toLowerCase() : '';
        const personalizedMsg = message.replace(/\{prenom\}/gi, prenom);

        try {
          const resp = await fetch('https://api.smsfactor.com/send', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              sms: {
                message: { text: personalizedMsg, pushtype: smsType, sender: 'Edumove', ...(shortLinks ? { shortlink: 1 } : {}) },
                recipients: { gsm: [{ value: phone }] }
              }
            })
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok && data.status !== 0) { results.sent++; }
          else { results.failed++; }
        } catch (err) {
          results.failed++;
        }

        // Small delay every 10 SMS to avoid rate limiting
        if (i > 0 && i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      return res.status(200).json({ ok: true, results });
    }
  } catch (err) {
    return res.status(200).json({ ok: true, results: { sent: 0, failed: recipients.length, errors: [err.message] } });
  }
};
