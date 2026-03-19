// Vercel Serverless Function — Notifie un étudiant par email + SMS quand il reçoit un message
// POST /api/notify-student-chat
const { setCorsHeaders, handlePreflight, verifyApiKey, safeError, isValidEmail, isValidPhone, normalizePhone, capitalize, escapeHtml } = require('./_shared');

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (handlePreflight(req, res)) return;
  if (!verifyApiKey(req)) return safeError(res, 401, 'Unauthorized');

  const { email, tel, prenom, senderName, content } = req.body || {};
  if (!content) return safeError(res, 400, 'Missing content');

  const brevoApiKey = process.env.BREVO_API_KEY;
  const smsToken = process.env.SMS_FACTOR_TOKEN;
  const smsEnabled = process.env.SMS_ENABLED === 'true';
  const siteUrl = process.env.SITE_URL || 'https://candidature.edumove.fr';

  const firstName = capitalize(prenom);
  const sender = senderName || 'Edumove';
  const preview = content.length > 120 ? content.slice(0, 120) + '…' : content;
  const results = { email: null, sms: null };

  if (email && isValidEmail(email) && brevoApiKey) {
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>body{font-family:'Poppins',Arial,sans-serif;background:#f5f6fb;margin:0;padding:0}.wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(27,29,58,.1)}.header{background:#1b1d3a;padding:24px 32px;display:flex;align-items:center;gap:12px}.badge{background:#ec680a;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.05em}.body{padding:32px}.intro{font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 20px}.msg-box{background:#f5f6fb;border-left:3px solid #615ca5;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px}.msg-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px}.msg-text{font-size:14px;color:#1b1d3a;line-height:1.6;white-space:pre-wrap}.footer{background:#f5f6fb;padding:18px 32px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e2e4f0}</style></head><body>
<div class="wrap"><div class="header"><img src="https://edumove.fr/wp-content/uploads/2025/12/EDUMOVE-LOGO-2-1.svg" width="150" alt="Edumove" style="display:block;height:auto"/><div class="badge">💬 Nouveau message</div></div>
<div class="body"><p class="intro">Bonjour <strong>${escapeHtml(firstName)}</strong>,<br>Vous avez reçu un nouveau message de <strong>${escapeHtml(sender)}</strong> sur votre espace candidat Edumove.</p>
<div class="msg-box"><div class="msg-label">Aperçu du message</div><div class="msg-text">${escapeHtml(preview)}</div></div>
<a href="${siteUrl}/espace.html" style="display:block;background:#ec680a;color:#fff!important;text-decoration:none!important;text-align:center;padding:13px 24px;border-radius:10px;font-size:14px;font-weight:600;font-family:'Poppins',Arial,sans-serif">Consulter mes messages</a></div>
<div class="footer">Notification automatique — Plateforme Edumove · candidature.edumove.fr</div></div></body></html>`;

    try {
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Edumove Admissions', email: 'admissions@edumove.fr' },
          to: [{ email }],
          subject: `💬 ${escapeHtml(sender)} vous a envoyé un message — Edumove`,
          htmlContent
        })
      });
      results.email = resp.ok ? 'sent' : 'error';
    } catch (err) {
      results.email = 'error';
      console.error('Student chat email failed:', err.message);
    }
  }

  if (tel && isValidPhone(tel) && smsEnabled && smsToken) {
    const phone = normalizePhone(tel);
    const smsText = `Bonjour ${firstName}, vous avez un nouveau message de ${sender} sur votre espace Edumove. Consultez-le ici : ${siteUrl}/espace.html`;
    try {
      const resp = await fetch('https://api.smsfactor.com/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${smsToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ sms: { message: { text: smsText, pushtype: 'marketing', sender: 'Edumove' }, recipients: { gsm: [{ value: phone }] } } })
      });
      const data = await resp.json();
      results.sms = (resp.ok && data.status !== 0) ? 'sent' : 'error';
    } catch (err) {
      results.sms = 'error';
      console.error('Student chat SMS failed:', err.message);
    }
  } else {
    results.sms = !tel ? 'no_phone' : !smsEnabled ? 'disabled' : 'no_token';
  }

  return res.status(200).json({ ok: true, results });
};
