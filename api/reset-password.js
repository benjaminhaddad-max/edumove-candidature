// Vercel Serverless Function — Réinitialisation mot de passe admin via Brevo
// POST /api/reset-password
// Body: { email }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, redirectTo: customRedirect } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });

  const supabaseUrl = process.env.SUPABASE_URL || 'https://zhvwjonvebmvjcdxkdmo.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const brevoApiKey = process.env.BREVO_API_KEY;

  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
  if (!brevoApiKey) return res.status(500).json({ error: 'BREVO_API_KEY not configured' });

  const siteUrl = process.env.SITE_URL || 'https://candidature.edumove.fr';
  const redirectTo = customRedirect || `${siteUrl}/index.html`;

  try {
    // Generate recovery link via Supabase Admin API
    const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'recovery',
        email,
        options: { redirect_to: redirectTo }
      })
    });

    const linkData = await linkRes.json();

    if (!linkRes.ok) {
      // Don't leak whether the email exists or not — return success anyway
      console.warn('Supabase generate_link error (may be unknown email):', linkData);
      return res.status(200).json({ ok: true });
    }

    const actionLink = linkData.action_link || linkData.properties?.action_link;
    if (!actionLink) {
      console.error('No action_link in Supabase response:', linkData);
      return res.status(200).json({ ok: true });
    }

    // Send branded email via Brevo
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: 'Poppins', Arial, sans-serif; background: #f5f6fb; margin: 0; padding: 0; }
    .wrap { max-width: 560px; margin: 32px auto; background: white; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(27,29,58,0.1); }
    .header { background: #1b1d3a; padding: 28px 32px; }
    .header-logo { font-size: 20px; color: white; font-weight: 800; letter-spacing: -0.02em; }
    .header-logo span { font-weight: 300; }
    .body { padding: 36px 32px; }
    .title { font-size: 20px; font-weight: 700; color: #1b1d3a; margin: 0 0 10px; }
    .text { font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 28px; }
    .cta { display: inline-block; background: #615ca5; color: white; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 14px; font-weight: 600; }
    .note { font-size: 12px; color: #9ca3af; margin-top: 24px; }
    .footer { background: #f5f6fb; padding: 18px 32px; font-size: 11px; color: #9ca3af; text-align: center; border-top: 1px solid #e2e4f0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="header-logo">Edu<span>move</span></div>
    </div>
    <div class="body">
      <div class="title">Réinitialisation de votre mot de passe</div>
      <div class="text">
        Vous avez demandé à réinitialiser le mot de passe de votre compte Edumove.<br/><br/>
        Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable <strong>1 heure</strong>.
      </div>
      <a href="${actionLink}" class="cta">Définir un nouveau mot de passe</a>
      <div class="note">Si vous n'avez pas fait cette demande, ignorez cet email — votre mot de passe reste inchangé.</div>
    </div>
    <div class="footer">
      Notification automatique — Plateforme Edumove &nbsp;·&nbsp; candidature.edumove.fr
    </div>
  </div>
</body>
</html>`;

    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Edumove Admissions', email: 'admissions@edumove.fr' },
        to: [{ email }],
        subject: 'Réinitialisation de votre mot de passe Edumove',
        htmlContent
      })
    });

    const emailData = await emailRes.json().catch(() => ({}));
    if (!emailRes.ok) {
      console.error('Brevo error:', emailData);
      return res.status(502).json({ error: 'Erreur lors de l\'envoi de l\'email' });
    }

    console.log(`Password reset email sent to ${email}`);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('reset-password failed:', err);
    return res.status(500).json({ error: err.message });
  }
};
