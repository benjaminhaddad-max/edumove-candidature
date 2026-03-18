// Vercel Serverless Function — Envoi SMS via SMS Factor
// POST /api/send-sms
// Body: { tel, prenom }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ⚠️ SMS désactivé — mettre SMS_ENABLED=true dans Vercel pour activer
  if (process.env.SMS_ENABLED !== 'true') {
    return res.status(200).json({ ok: false, reason: 'SMS disabled' });
  }

  const { tel, prenom } = req.body || {};
  if (!tel) return res.status(400).json({ error: 'Missing tel' });

  // Normalisation du numéro en format international (33XXXXXXXXX)
  let phone = String(tel).replace(/[\s.\-()]/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  else if (phone.startsWith('+')) phone = phone.slice(1);
  else if (phone.startsWith('0')) phone = '33' + phone.slice(1);

  const token = process.env.SMS_FACTOR_TOKEN;
  if (!token) return res.status(500).json({ error: 'SMS_FACTOR_TOKEN not configured' });

  const siteUrl = process.env.SITE_URL || 'https://edumove.fr';
  const nom = prenom ? prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase() : 'Candidat';
  const message = `Bonjour ${nom}, votre réponse Edumove est disponible ! Connectez-vous à votre espace candidat pour la consulter : ${siteUrl}`;

  try {
    const response = await fetch('https://www.smsfactor.com/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        messages: {
          message: [{ text: message, to: phone }]
        },
        sender: 'Edumove'
      })
    });

    const data = await response.json();

    if (!response.ok || data.status === 0) {
      console.error('SMS Factor error:', data);
      return res.status(502).json({ error: 'SMS Factor error', details: data });
    }

    console.log(`SMS sent to ${phone} (${nom}):`, data);
    return res.status(200).json({ ok: true, phone, data });

  } catch (err) {
    console.error('SMS send failed:', err);
    return res.status(500).json({ error: err.message });
  }
};
