// Vercel Serverless Function — Réinitialisation mot de passe via Brevo
// POST /api/reset-password  (public endpoint — no API key, but rate-limited by design)
const { setCorsHeaders, handlePreflight, safeError, isValidEmail, escapeHtml } = require('./_shared');

const ALLOWED_REDIRECTS = ['https://candidature.edumove.fr'];

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (handlePreflight(req, res)) return;

  const { email, redirectTo: customRedirect } = req.body || {};
  if (!email || !isValidEmail(email)) return safeError(res, 400, 'Invalid email');

  // Validate redirectTo to prevent open redirect
  const siteUrl = process.env.SITE_URL || 'https://candidature.edumove.fr';
  let redirectTo = `${siteUrl}/index.html`;
  if (customRedirect && ALLOWED_REDIRECTS.some(u => customRedirect.startsWith(u))) {
    redirectTo = customRedirect;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const brevoApiKey = process.env.BREVO_API_KEY;

  if (!supabaseUrl || !serviceKey || !brevoApiKey) return safeError(res, 500, 'Service not configured');

  try {
    const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'recovery', email, options: { redirect_to: redirectTo } })
    });
    const linkData = await linkRes.json();

    // Don't leak whether the email exists — always return success
    if (!linkRes.ok) return res.status(200).json({ ok: true });

    const actionLink = linkData.action_link || linkData.properties?.action_link;
    if (!actionLink) return res.status(200).json({ ok: true });

    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>body{font-family:'Poppins',Arial,sans-serif;background:#f5f6fb;margin:0;padding:0}.wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(27,29,58,.1)}.header{background:#1b1d3a;padding:28px 32px}.body{padding:36px 32px}.title{font-size:20px;font-weight:700;color:#1b1d3a;margin:0 0 10px}.text{font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 28px}.note{font-size:12px;color:#9ca3af;margin-top:24px}.footer{background:#f5f6fb;padding:18px 32px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e2e4f0}</style></head><body>
<div class="wrap"><div class="header"><img src="https://edumove.fr/wp-content/uploads/2025/12/EDUMOVE-LOGO-2-1.svg" width="150" alt="Edumove" style="display:block;height:auto"/></div>
<div class="body"><div class="title">Réinitialisation de votre mot de passe</div>
<div class="text">Vous avez demandé à réinitialiser le mot de passe de votre compte Edumove.<br/><br/>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable <strong>1 heure</strong>.</div>
<a href="${actionLink}" style="display:inline-block;background:#ec680a;color:#fff!important;text-decoration:none!important;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:600;font-family:'Poppins',Arial,sans-serif">Définir un nouveau mot de passe</a>
<div class="note">Si vous n'avez pas fait cette demande, ignorez cet email.</div></div>
<div class="footer">Notification automatique — Plateforme Edumove · candidature.edumove.fr</div></div></body></html>`;

    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Edumove Admissions', email: 'admissions@edumove.fr' },
        to: [{ email }],
        subject: 'Réinitialisation de votre mot de passe Edumove',
        htmlContent
      })
    });

    if (!emailRes.ok) return safeError(res, 502, 'Email send failed');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('reset-password failed:', err.message);
    return safeError(res, 500, 'Password reset failed');
  }
};
