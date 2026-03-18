// Vercel Serverless Function — Email étudiant "Réponse Edumove disponible" via Brevo template
// POST /api/notify-response
// Body: { email, prenom }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, prenom } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });

  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) return res.status(500).json({ error: 'BREVO_API_KEY not configured' });

  const firstName = prenom
    ? prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase()
    : 'Candidat';

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        to: [{ email }],
        templateId: 114,
        params: { PRENOM: firstName }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Brevo notify-response error:', data);
      return res.status(502).json({ error: 'Brevo error', details: data });
    }

    console.log(`Response notification sent to ${email} (${firstName})`);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('notify-response failed:', err);
    return res.status(500).json({ error: err.message });
  }
};
