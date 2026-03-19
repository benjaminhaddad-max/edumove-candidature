// Vercel Serverless Function — Notification @mention dans messagerie
// POST /api/notify-mention
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

  const { mentionedParty, facKey, senderName, studentName, content, candidatureId } = req.body || {};
  if (!mentionedParty || !content) return safeError(res, 400, 'Missing required fields');
  if (!['edumove', 'fac'].includes(mentionedParty)) return safeError(res, 400, 'Invalid mentionedParty');

  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) return safeError(res, 500, 'Email service not configured');

  const siteUrl = process.env.SITE_URL || 'https://candidature.edumove.fr';
  let to, subject, intro, ctaLink, ctaLabel, replyTo;

  if (mentionedParty === 'edumove') {
    to = [{ email: 'admissions@edumove.fr', name: 'Équipe Edumove' }];
    const facLabel = FAC_NAMES[facKey] || facKey || 'Une faculté';
    subject = studentName ? `🔔 ${facLabel} vous a tagué — ${escapeHtml(studentName)}` : `🔔 ${facLabel} vous a tagué`;
    intro = studentName ? `<strong>${facLabel}</strong> vous a mentionné dans la conversation concernant <strong>${escapeHtml(studentName)}</strong>.` : `<strong>${facLabel}</strong> vous a mentionné.`;
    ctaLink = candidatureId ? `${siteUrl}/admin.html?open=${encodeURIComponent(candidatureId)}` : `${siteUrl}/admin.html`;
    ctaLabel = 'Voir la conversation';
    replyTo = null;
  } else {
    const facEmails = FAC_EMAILS[facKey];
    if (!facEmails) return safeError(res, 400, 'Unknown facKey');
    to = facEmails.map(e => ({ email: e }));
    subject = studentName ? `🔔 Edumove vous a tagué — ${escapeHtml(studentName)}` : `🔔 Edumove vous a tagué`;
    intro = studentName ? `L'équipe Edumove vous a mentionné dans la conversation concernant <strong>${escapeHtml(studentName)}</strong>.` : `L'équipe Edumove vous a mentionné.`;
    ctaLink = `${siteUrl}/fac-admin.html`;
    ctaLabel = 'Voir dans mon espace';
    replyTo = 'admissions@edumove.fr';
  }

  const preview = content.length > 120 ? content.slice(0, 120) + '…' : content;

  const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>body{font-family:'Poppins',Arial,sans-serif;background:#f5f6fb;margin:0;padding:0}.wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(27,29,58,.1)}.header{background:#1b1d3a;padding:24px 32px;display:flex;align-items:center;gap:12px}.badge{background:#615ca5;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.05em}.body{padding:32px}.tag-pill{display:inline-block;background:#ede9fe;color:#5b21b6;font-size:13px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:16px}.intro{font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 20px}.msg-box{background:#f5f6fb;border-left:3px solid #615ca5;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:28px;font-size:13px;color:#1b1d3a;line-height:1.6;white-space:pre-wrap}.msg-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px}.footer{background:#f5f6fb;padding:18px 32px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e2e4f0}</style></head><body>
<div class="wrap"><div class="header"><img src="https://edumove.fr/wp-content/uploads/2025/12/EDUMOVE-LOGO-2-1.svg" width="150" alt="Edumove" style="display:block;height:auto"/><div class="badge">🔔 Mention</div></div>
<div class="body"><div class="tag-pill">@${mentionedParty==='edumove'?'Edumove':escapeHtml(facKey)} — vous avez été tagué</div>
<p class="intro">${intro}</p>
<div class="msg-box"><div class="msg-label">Message</div>${escapeHtml(preview)}</div>
<a href="${ctaLink}" style="display:block;background:#ec680a;color:#fff!important;text-decoration:none!important;text-align:center;padding:13px 24px;border-radius:10px;font-size:14px;font-weight:600;font-family:'Poppins',Arial,sans-serif">${ctaLabel}</a></div>
<div class="footer">Notification automatique — Plateforme Edumove · candidature.edumove.fr</div></div></body></html>`;

  const payload = { sender: { name: 'Edumove Admissions', email: 'admissions@edumove.fr' }, to, subject, htmlContent };
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
    console.error('notify-mention failed:', err.message);
    return safeError(res, 500, 'Email send failed');
  }
};
