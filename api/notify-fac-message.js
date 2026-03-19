// Vercel Serverless Function — Notifications email messagerie faculté
// POST /api/notify-fac-message
const { setCorsHeaders, handlePreflight, verifyApiKey, safeError, escapeHtml } = require('./_shared');

const FAC_EMAILS = {
  LINK: ['d.elfadli@unilink.it'],
  UE:   ['jessica.simi@universidadeuropea.es'],
  UCJC: ['eva.munoza@ucjc.edu', 'antonio.carrera@ucjc.edu']
};
const FAC_NAMES = { LINK: 'LINK Campus University', UE: 'Universidad Europea', UCJC: 'UCJC Madrid' };

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (handlePreflight(req, res)) return;
  if (!verifyApiKey(req)) return safeError(res, 401, 'Unauthorized');

  const { direction, facKey, senderEmail, content, studentName } = req.body || {};
  if (!direction || !facKey || !content) return safeError(res, 400, 'Missing required fields');
  if (!['admin_to_fac', 'fac_to_admin'].includes(direction)) return safeError(res, 400, 'Invalid direction');
  if (!FAC_NAMES[facKey]) return safeError(res, 400, 'Unknown facKey');

  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) return safeError(res, 500, 'Email service not configured');

  const siteUrl = process.env.SITE_URL || 'https://candidature.edumove.fr';
  const facName = FAC_NAMES[facKey];
  let to, subject, intro, replyTo, ctaLink, ctaLabel;

  if (direction === 'admin_to_fac') {
    const facEmails = FAC_EMAILS[facKey];
    if (!facEmails) return safeError(res, 400, 'Unknown facKey');
    to = facEmails.map(e => ({ email: e }));
    subject = studentName ? `Nouveau message Edumove — ${escapeHtml(studentName)}` : 'Nouveau message Edumove';
    intro = studentName ? `L'équipe Edumove vous a envoyé un message concernant l'étudiant(e) <strong>${escapeHtml(studentName)}</strong>.` : `L'équipe Edumove vous a envoyé un message.`;
    replyTo = 'admissions@edumove.fr';
    ctaLink = `${siteUrl}/fac-admin.html`;
    ctaLabel = 'Voir dans mon espace';
  } else {
    to = [{ email: 'admissions@edumove.fr', name: 'Equipe Edumove' }];
    subject = studentName ? `Réponse ${facName} — ${escapeHtml(studentName)}` : `Nouveau message de ${facName}`;
    intro = studentName ? `<strong>${facName}</strong> vous a répondu concernant l'étudiant(e) <strong>${escapeHtml(studentName)}</strong>.` : `<strong>${facName}</strong> vous a envoyé un message.`;
    replyTo = null;
    ctaLink = `${siteUrl}/admin.html`;
    ctaLabel = 'Ouvrir la messagerie';
  }

  const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>body{font-family:'Poppins',Arial,sans-serif;background:#f5f6fb;margin:0;padding:0}.wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(27,29,58,.1)}.header{background:#1b1d3a;padding:24px 32px;display:flex;align-items:center;gap:12px}.badge{background:#615ca5;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.05em}.body{padding:32px}.intro{font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 20px}.msg-box{background:#f5f6fb;border-left:3px solid #615ca5;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:28px}.msg-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px}.msg-text{font-size:14px;color:#1b1d3a;line-height:1.6;white-space:pre-wrap}.footer{background:#f5f6fb;padding:18px 32px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e2e4f0}</style></head><body>
<div class="wrap"><div class="header"><img src="https://edumove.fr/wp-content/uploads/2025/12/EDUMOVE-LOGO-2-1.svg" width="150" alt="Edumove" style="display:block;height:auto"/><div class="badge">💬 Message</div></div>
<div class="body"><p class="intro">${intro}</p><div class="msg-box"><div class="msg-label">Message</div><div class="msg-text">${escapeHtml(content)}</div></div>
<a href="${ctaLink}" style="display:block;background:#ec680a;color:#fff!important;text-decoration:none!important;text-align:center;padding:13px 24px;border-radius:10px;font-size:14px;font-weight:600;font-family:'Poppins',Arial,sans-serif">${ctaLabel}</a></div>
<div class="footer">Notification automatique — Plateforme Edumove · candidature.edumove.fr</div></div></body></html>`;

  const payload = {
    sender: { name: 'Edumove Admissions', email: 'admissions@edumove.fr' },
    to, subject, htmlContent
  };
  if (replyTo) payload.replyTo = { email: replyTo };

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return safeError(res, 502, 'Email send failed');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify-fac-message failed:', err.message);
    return safeError(res, 500, 'Email send failed');
  }
};
