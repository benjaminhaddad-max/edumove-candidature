// Vercel Serverless Function — HubSpot Webhook: auto-sync new Edumove contacts
// Called by HubSpot when a contact submits an Edumove form
const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

module.exports = async function handler(req, res) {
  // Allow HubSpot webhook calls (no CORS needed, no API key — HubSpot sends POST)
  if (req.method === 'GET') {
    // Health check
    return res.status(200).json({ ok: true, service: 'hubspot-webhook' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!hubspotToken) return res.status(500).json({ error: 'Not configured' });

  const sb = getSupabase();

  try {
    // HubSpot sends an array of subscription events
    const events = Array.isArray(req.body) ? req.body : [req.body];
    console.log('HubSpot webhook received', events.length, 'events');

    let processed = 0;
    for (const event of events) {
      const contactId = String(event.objectId || event.primaryObjectId || '');
      if (!contactId) { console.log('No contactId in event, skipping'); continue; }
      console.log('Processing contact', contactId);

      // Wait 3s for HubSpot to finish processing form data (recent_conversion_event_name may not be set yet)
      await new Promise(r => setTimeout(r, 3000));

      // Fetch full contact details from HubSpot
      const props = 'firstname,lastname,email,phone,edumove_lead_status,hs_lead_status,recent_conversion_event_name,hs_analytics_source,createdate,edumove_departement,departement';
      const contactRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=${props}`, {
        headers: { 'Authorization': `Bearer ${hubspotToken}` }
      });

      if (!contactRes.ok) {
        console.error('Failed to fetch contact', contactId, contactRes.status);
        continue;
      }

      const contact = await contactRes.json();
      const p = contact.properties || {};
      const formName = p.recent_conversion_event_name || '';
      console.log('Contact fetched:', contactId, 'form:', formName, 'email:', p.email);

      // Accept all contacts from webhook — even if form name not yet populated
      // (HubSpot sometimes delays setting recent_conversion_event_name)
      // If form name is set and NOT edumove, skip it
      if (formName && !formName.toLowerCase().includes('edumove')) {
        console.log('Skipping non-Edumove contact', contactId, formName);
        continue;
      }

      const row = {
        id: contact.id,
        nom: p.lastname || '',
        prenom: p.firstname || '',
        email: p.email || '',
        tel: p.phone || '',
        lead_status: p.edumove_lead_status || mapHsToEdumove(p.hs_lead_status || ''),
        hs_lead_status: p.hs_lead_status || '',
        form_name: cleanFormName(formName),
        source: p.hs_analytics_source || '',
        departement: p.edumove_departement || p.departement || '',
        created_at: p.createdate || null,
        synced_at: new Date().toISOString()
      };

      const { error } = await sb.from('crm_contacts').upsert(row, { onConflict: 'id' });
      if (error) console.error('Upsert error:', error.message);
      else { processed++; console.log('Upserted contact', contactId); }
    }

    return res.status(200).json({ ok: true, processed });
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(200).json({ ok: false, error: err.message }); // 200 so HubSpot doesn't retry
  }
};

function mapHsToEdumove(hsStatus) {
  const map = {
    'Nouveau': 'Nouveau', 'Nouveau - Chaud': 'Nouveau',
    'Disqualifié': 'Disqualifié', 'Mauvais numéro': 'Disqualifié',
    'Raccroche au nez': 'Disqualifié', 'Doublon': 'Disqualifié',
    'Autre prépa concurrente': 'Disqualifié', 'Inscrit': 'Disqualifié',
    'Pré-inscrit 2025/2026': 'Disqualifié', 'Pré-inscrit 2026/2027': 'Disqualifié',
    'En cours': 'Nouveau', 'Rdv pris': 'Va candidater',
    'NRP1': 'Nouveau', 'NRP2': 'Nouveau', 'NRP3': 'Nouveau', 'NRP4': 'Nouveau'
  };
  return map[hsStatus] || 'Nouveau';
}

function cleanFormName(raw) {
  if (!raw) return '';
  if (raw.includes('EDUMOVE - CONTACT')) return 'Edumove Contact';
  if (raw.includes('EDUMOVE - QUALIFICATION')) return 'Edumove Qualification';
  if (raw.includes('EDUMOVE - Form LGF')) return 'Meta Lead Gen (LGF V2)';
  if (raw.includes('EDUMOVE')) return raw.replace(/^(Form:|Facebook Lead Ads:)\s*/i, '').trim();
  return raw;
}
