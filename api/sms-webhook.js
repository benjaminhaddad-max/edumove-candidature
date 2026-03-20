// Vercel Serverless Function — SMS Factor Webhook: track SMS delivery & link clicks
// Configure in SMS Factor > Settings > Webhooks > URL: https://candidature.edumove.fr/api/sms-webhook
const { createClient } = require('@supabase/supabase-js');
const { normalizePhone } = require('./_shared');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // SMS Factor sends: { to, status, date, ... } or for clicks: { to, url, date }
    const data = req.body || req.query || {};
    const phone = data.to || data.phone || data.numero || '';
    if (!phone) return res.status(200).json({ ok: true, skipped: 'no phone' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const normalized = normalizePhone(phone);

    // Determine event type
    const status = (data.status || data.event || '').toLowerCase();
    const isClick = !!(data.url || status === 'click' || status === 'clicked');
    const isDelivered = status === 'delivered' || status === '1' || status === 'dlvrd';

    const updateObj = {};
    if (isClick) {
      updateObj.sms_clicked = true;
    }
    if (isDelivered) {
      updateObj.sms_delivered = true;
    }

    if (Object.keys(updateObj).length === 0) {
      return res.status(200).json({ ok: true, skipped: 'no actionable event' });
    }

    // Find contact by normalized phone (try multiple formats)
    // crm_contacts.tel can be stored in various formats
    const { data: contacts } = await sb.from('crm_contacts')
      .select('id,tel')
      .limit(100);

    // Find matching contact by normalizing both sides
    const matched = (contacts || []).filter(c => {
      if (!c.tel) return false;
      return normalizePhone(c.tel) === normalized;
    });

    if (matched.length > 0) {
      const ids = matched.map(c => c.id);
      await sb.from('crm_contacts').update(updateObj).in('id', ids);
    }

    return res.status(200).json({ ok: true, matched: matched.length });
  } catch (err) {
    console.error('SMS webhook error:', err.message);
    return res.status(200).json({ ok: true });
  }
};
