// Vercel Serverless Function — HubSpot Webhook: auto-sync new Edumove contacts
// Called by HubSpot when a contact submits an Edumove form
// Auto-sends welcome SMS (SMS Factor) + welcome email (Brevo template) to NEW leads
const { createClient } = require('@supabase/supabase-js');
const { isValidPhone, normalizePhone, isValidEmail } = require('./_shared');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Welcome SMS message
const WELCOME_SMS = `La plateforme de candidature Edumove est ouverte !\nMédecine, Dentaire, Pharmacie, Kiné en Europe. Accompagnement de A à Z\nCandidatez : candidature.edumove.fr`;

// Default Brevo template for welcome email (configurable via env)
const WELCOME_TEMPLATE_ID = parseInt(process.env.WELCOME_BREVO_TEMPLATE_ID || '116');

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
    let welcomed = 0;
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

      // Check if contact already exists in Supabase (to determine if it's a NEW lead)
      const { data: existing } = await sb.from('crm_contacts').select('id,last_sms_at,last_email_at').eq('id', contact.id).single();
      const isNewLead = !existing;

      const now = new Date().toISOString();
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
        synced_at: now
      };

      const { error } = await sb.from('crm_contacts').upsert(row, { onConflict: 'id' });
      if (error) { console.error('Upsert error:', error.message); continue; }
      processed++;
      console.log('Upserted contact', contactId);

      // ── AUTO-WELCOME: Send SMS + Email to NEW leads only ──
      // Exclude specific forms from welcome SMS/email (still synced to DB above)
      const EXCLUDED_FORMS = ['webinaire du 15/04'];
      const isExcludedForm = EXCLUDED_FORMS.some(ex => formName.toLowerCase().includes(ex));
      if (isExcludedForm) {
        console.log('Skipping welcome for excluded form', contactId, formName);
      } else if (isNewLead) {
        const welcomeResults = await sendWelcome(sb, contact.id, p.phone, p.email, p.firstname);
        if (welcomeResults.smsSent || welcomeResults.emailSent) welcomed++;
        console.log('Welcome sent to', contactId, welcomeResults);
      }
    }

    return res.status(200).json({ ok: true, processed, welcomed });
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(200).json({ ok: false, error: err.message }); // 200 so HubSpot doesn't retry
  }
};

// ── Send welcome SMS + Brevo email to a new lead ──
async function sendWelcome(sb, contactId, phone, email, firstname) {
  const results = { smsSent: false, emailSent: false };
  const now = new Date().toISOString();
  const prenom = firstname ? firstname.charAt(0).toUpperCase() + firstname.slice(1).toLowerCase() : '';

  // 1) Send welcome SMS via SMS Factor
  if (phone && isValidPhone(phone) && process.env.SMS_ENABLED === 'true') {
    const smsToken = process.env.SMS_FACTOR_TOKEN;
    if (smsToken) {
      try {
        const normalizedPhone = normalizePhone(phone);
        const resp = await fetch('https://api.smsfactor.com/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${smsToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            sms: {
              message: { text: WELCOME_SMS, pushtype: 'marketing', sender: 'Edumove' },
              recipients: { gsm: [{ value: normalizedPhone }] }
            }
          })
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data.status !== 0) {
          results.smsSent = true;
          await sb.from('crm_contacts').update({ last_sms_at: now }).eq('id', contactId);
          console.log('Welcome SMS sent to', normalizedPhone);
        } else {
          console.error('Welcome SMS failed:', data.message || resp.status);
        }
      } catch (err) {
        console.error('Welcome SMS error:', err.message);
      }
    }
  }

  // 2) Send welcome email via Brevo template
  if (email && isValidEmail(email)) {
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (brevoApiKey) {
      try {
        const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            templateId: WELCOME_TEMPLATE_ID,
            to: [{ email, name: prenom || 'Bonjour' }],
            params: { PRENOM: prenom || 'Bonjour', prenom: prenom || 'Bonjour', FIRSTNAME: prenom || 'Bonjour' }
          })
        });
        if (resp.ok) {
          results.emailSent = true;
          await sb.from('crm_contacts').update({ last_email_at: now, email_status: 'sent' }).eq('id', contactId);
          console.log('Welcome email sent to', email, 'template:', WELCOME_TEMPLATE_ID);
        } else {
          const errText = await resp.text();
          console.error('Welcome email failed:', errText);
        }
      } catch (err) {
        console.error('Welcome email error:', err.message);
      }
    }
  }

  return results;
}

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
