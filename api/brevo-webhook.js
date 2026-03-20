// Vercel Serverless Function — Brevo Webhook: track email delivery, opens, clicks, bounces
// Configure in Brevo > Settings > Webhooks > URL: https://candidature.edumove.fr/api/brevo-webhook
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const event = req.body;
    if (!event || !event.email) return res.status(200).json({ ok: true, skipped: 'no email' });

    const email = event.email.toLowerCase().trim();
    const eventType = event.event; // delivered, opened, click, hard_bounce, soft_bounce, spam, unsubscribed

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const now = new Date().toISOString();
    const updateObj = {};

    switch (eventType) {
      case 'delivered':
      case 'deferred':
        updateObj.email_status = 'delivered';
        break;
      case 'opened':
      case 'unique_opened':
        updateObj.email_status = 'opened';
        updateObj.email_opened_at = now;
        break;
      case 'click':
        updateObj.email_status = 'clicked';
        updateObj.email_clicked_at = now;
        break;
      case 'hard_bounce':
      case 'soft_bounce':
      case 'invalid_email':
        updateObj.email_status = 'bounced';
        break;
      case 'spam':
      case 'blocked':
        updateObj.email_status = 'spam';
        break;
      case 'unsubscribed':
        updateObj.email_status = 'unsub';
        break;
      default:
        return res.status(200).json({ ok: true, skipped: 'unknown event: ' + eventType });
    }

    // Update contact by email
    const { error } = await sb.from('crm_contacts').update(updateObj).eq('email', email);
    if (error) console.error('Brevo webhook update error:', error.message);

    return res.status(200).json({ ok: true, event: eventType, email });
  } catch (err) {
    console.error('Brevo webhook error:', err.message);
    return res.status(200).json({ ok: true }); // Always 200 to avoid Brevo retries
  }
};
