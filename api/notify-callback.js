// Vercel Serverless Function — Notification rappel téléphonique via Brevo
// POST /api/notify-callback
const { setCorsHeaders, handlePreflight, verifyApiKey, safeError, escapeHtml } = require('./_shared');

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (handlePreflight(req, res)) return;
  if (!verifyApiKey(req)) return safeError(res, 401, 'Unauthorized');

  const { nom, prenom, tel, email, candidatureId } = req.body || {};
  if (!nom || !prenom) return safeError(res, 400, 'Missing student data');

  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) return safeError(res, 500, 'Email service not configured');

  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || 'admissions@edumove.fr';
  const siteUrl = process.env.SITE_URL || 'https://candidature.edumove.fr';
  const adminUrl = `${siteUrl}/admin.html`;
  const studentFullName = escapeHtml(`${prenom} ${nom}`.trim());
  const directLink = candidatureId ? `${adminUrl}?open=${encodeURIComponent(candidatureId)}` : adminUrl;

  const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>body{font-family:'Poppins',Arial,sans-serif;background:#f5f6fb;margin:0;padding:0}.wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(27,29,58,.1)}.header{background:#1b1d3a;padding:28px 32px;display:flex;align-items:center;gap:12px}.badge{background:#ec680a;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.05em}.body{padding:32px}.title{font-size:18px;font-weight:700;color:#1b1d3a;margin:0 0 6px}.subtitle{font-size:13px;color:#6b7280;margin:0 0 28px}.info-card{background:#f5f6fb;border-radius:10px;padding:20px 22px;margin-bottom:24px}.info-row{display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:14px}.info-row:last-child{margin-bottom:0}.info-label{color:#6b7280;min-width:80px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}.info-value{color:#1b1d3a;font-weight:600}.footer{background:#f5f6fb;padding:18px 32px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e2e4f0}</style></head><body>
<div class="wrap"><div class="header"><img src="https://edumove.fr/wp-content/uploads/2025/12/EDUMOVE-LOGO-2-1.svg" width="150" alt="Edumove" style="display:block;height:auto"/><div class="badge">📞 Rappel demandé</div></div>
<div class="body"><div class="title">Un étudiant demande à être rappelé</div><div class="subtitle">Demande reçue le ${new Date().toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'full',timeStyle:'short'})}</div>
<div class="info-card"><div class="info-row"><span class="info-label">Étudiant</span><span class="info-value">${studentFullName}</span></div>
<div class="info-row"><span class="info-label">Téléphone</span><span class="info-value">${escapeHtml(tel||'—')}</span></div>
<div class="info-row"><span class="info-label">Email</span><span class="info-value">${escapeHtml(email||'—')}</span></div>
${candidatureId?`<div class="info-row"><span class="info-label">Dossier</span><span class="info-value"><a href="${directLink}">Voir →</a></span></div>`:''}</div>
<a href="${directLink}" style="display:block;background:#ec680a;color:#fff!important;text-decoration:none!important;text-align:center;padding:14px 24px;border-radius:10px;font-size:14px;font-weight:600;font-family:'Poppins',Arial,sans-serif">👁️ Ouvrir le dossier</a></div>
<div class="footer">Notification automatique — Plateforme Edumove · candidature.edumove.fr</div></div></body></html>`;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Edumove Admissions', email: 'admissions@edumove.fr' },
        to: [{ email: adminEmail, name: 'Équipe Edumove' }],
        subject: `📞 Rappel demandé — ${studentFullName}`,
        htmlContent
      })
    });
    if (!response.ok) return safeError(res, 502, 'Email send failed');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify-callback failed:', err.message);
    return safeError(res, 500, 'Email send failed');
  }
};
