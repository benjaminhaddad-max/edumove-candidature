// Vercel Serverless Function — CRM: List from Supabase cache, Sync from HubSpot
// POST /api/hubspot-contacts { action: "list" | "sync" | "update" }
const { setCorsHeaders, safeError } = require('./_shared');
const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGINS = [
  'https://candidature.edumove.fr',
  'https://edumove-candidature-main.vercel.app'
];

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.some(o => origin.startsWith(o)) || origin.includes('edumove-candidature')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.API_SHARED_SECRET) return safeError(res, 401, 'Unauthorized');

  const { action } = req.body;

  try {
    if (action === 'list') return await listFromCache(req, res);
    if (action === 'sync') return await syncFromHubSpot(req, res);
    if (action === 'update') return await updateContact(req, res);
    return safeError(res, 400, 'Invalid action. Use: list, sync, update');
  } catch (err) {
    console.error('CRM error:', err.message);
    return safeError(res, 500, 'CRM request failed');
  }
};

// ── LIST: Read from Supabase cache (instant) ──
async function listFromCache(req, res) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('crm_contacts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase read error:', error);
    return safeError(res, 502, 'Cache read failed');
  }

  const contacts = (data || []).map(r => ({
    id: r.id,
    nom: r.nom || '',
    prenom: r.prenom || '',
    email: r.email || '',
    tel: r.tel || '',
    leadStatus: r.lead_status || '',
    hsLeadStatus: r.hs_lead_status || '',
    formName: r.form_name || '',
    source: r.source || '',
    createdAt: r.created_at || ''
  }));

  return res.status(200).json({ contacts, total: contacts.length, cached: true });
}

// ── SYNC: Fetch ALL contacts from HubSpot via list endpoint → filter Edumove → upsert into Supabase ──
async function syncFromHubSpot(req, res) {
  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!hubspotToken) return safeError(res, 500, 'HubSpot not configured');

  const sb = getSupabase();
  const PROPS = 'firstname,lastname,email,phone,edumove_lead_status,hs_lead_status,recent_conversion_event_name,hs_analytics_source,createdate';

  let allContacts = [];
  let after = null;
  let safety = 0;

  // Use LIST endpoint (no search limit) and paginate through ALL contacts
  do {
    safety++;
    let url = `https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=${PROPS}`;
    if (after) url += `&after=${after}`;

    const listRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${hubspotToken}` }
    });
    const data = await listRes.json();
    const results = data.results || [];

    // Filter: keep only Edumove contacts (form name contains "edumove" case-insensitive)
    const edumoveResults = results.filter(c => {
      const formName = (c.properties?.recent_conversion_event_name || '').toLowerCase();
      return formName.includes('edumove');
    });
    allContacts = allContacts.concat(edumoveResults);

    after = data.paging?.next?.after || null;
  } while (after && safety < 500);

  // Transform and upsert into Supabase
  const now = new Date().toISOString();
  const rows = allContacts.map(c => {
    const p = c.properties || {};
    return {
      id: c.id,
      nom: p.lastname || '',
      prenom: p.firstname || '',
      email: p.email || '',
      tel: p.phone || '',
      lead_status: p.edumove_lead_status || '',
      hs_lead_status: p.hs_lead_status || '',
      form_name: cleanFormName(p.recent_conversion_event_name || ''),
      source: p.hs_analytics_source || '',
      created_at: p.createdate || null,
      synced_at: now
    };
  });

  // Upsert in batches of 500
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await sb.from('crm_contacts').upsert(batch, { onConflict: 'id' });
    if (error) console.error('Upsert error batch', i, error.message);
    else upserted += batch.length;
  }

  return res.status(200).json({ success: true, synced: upserted, total: rows.length });
}

// ── UPDATE: Update on HubSpot + Supabase cache ──
async function updateContact(req, res) {
  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!hubspotToken) return safeError(res, 500, 'HubSpot not configured');

  const { contactId, properties } = req.body;
  if (!contactId) return safeError(res, 400, 'contactId required');

  const allowed = ['edumove_lead_status', 'hs_lead_status', 'lifecyclestage'];
  const safeProps = {};
  for (const [key, val] of Object.entries(properties || {})) {
    if (allowed.includes(key)) safeProps[key] = val;
  }

  // Update HubSpot
  const updateRes = await hubFetch(hubspotToken, 'PATCH', `/crm/v3/objects/contacts/${contactId}`, { properties: safeProps });
  if (!updateRes.ok) {
    const err = await updateRes.text();
    console.error('HubSpot update error:', err);
    return safeError(res, 502, 'HubSpot update failed');
  }

  // Update Supabase cache
  const sb = getSupabase();
  const cacheUpdate = {};
  if (safeProps.hs_lead_status !== undefined) cacheUpdate.hs_lead_status = safeProps.hs_lead_status;
  if (safeProps.edumove_lead_status !== undefined) cacheUpdate.lead_status = safeProps.edumove_lead_status;
  if (Object.keys(cacheUpdate).length > 0) {
    await sb.from('crm_contacts').update(cacheUpdate).eq('id', contactId);
  }

  return res.status(200).json({ success: true });
}

// ── HELPERS ──
function cleanFormName(raw) {
  if (!raw) return '';
  if (raw.includes('EDUMOVE - CONTACT')) return 'Edumove Contact';
  if (raw.includes('EDUMOVE - QUALIFICATION')) return 'Edumove Qualification';
  if (raw.includes('EDUMOVE - Form LGF')) return 'Meta Lead Gen (LGF V2)';
  if (raw.includes('EDUMOVE')) return raw.replace(/^(Form:|Facebook Lead Ads:)\s*/i, '').trim();
  return raw;
}

async function hubFetch(token, method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`https://api.hubapi.com${path}`, opts);
}
