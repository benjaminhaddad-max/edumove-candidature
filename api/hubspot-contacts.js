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
    if (action === 'assign') return await assignContacts(req, res);
    return safeError(res, 400, 'Invalid action');
  } catch (err) {
    console.error('CRM error:', err.message);
    return safeError(res, 500, 'CRM request failed');
  }
};

// ── LIST: Read from Supabase cache (instant) ──
async function listFromCache(req, res) {
  const sb = getSupabase();
  const { assignedTo } = req.body || {};
  let allData = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let q = sb.from('crm_contacts').select('*').order('synced_at', { ascending: false });
    if (assignedTo && typeof assignedTo === 'string' && assignedTo.trim()) {
      q = q.eq('assigned_to', assignedTo.trim());
    }
    const { data: batch, error: batchErr } = await q.range(from, from + PAGE - 1);
    if (batchErr) { console.error('Cache read error:', batchErr); break; }
    allData = allData.concat(batch || []);
    if (!batch || batch.length < PAGE) break;
    from += PAGE;
  }
  const data = allData;
  const error = null;

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
    assignedTo: r.assigned_to || '',
    assignedName: r.assigned_name || '',
    createdAt: r.created_at || '',
    syncedAt: r.synced_at || ''
  }));

  return res.status(200).json({ contacts, total: contacts.length, cached: true });
}

// ── SYNC: Fetch Edumove contacts from HubSpot search → upsert into Supabase ──
async function syncFromHubSpot(req, res) {
  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!hubspotToken) return safeError(res, 500, 'HubSpot not configured');

  const sb = getSupabase();
  const PROPS = ['firstname', 'lastname', 'email', 'phone', 'edumove_lead_status', 'hs_lead_status', 'recent_conversion_event_name', 'hs_analytics_source', 'createdate'];

  let allContacts = [];
  let after = null;
  let pages = 0;

  do {
    pages++;
    const body = {
      filterGroups: [
        { filters: [{ propertyName: 'recent_conversion_event_name', operator: 'CONTAINS_TOKEN', value: 'edumove' }] }
      ],
      limit: 100,
      properties: PROPS,
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }]
    };
    if (after) body.after = after;

    const searchRes = await hubFetch(hubspotToken, 'POST', '/crm/v3/objects/contacts/search', body);
    const data = await searchRes.json();
    allContacts = allContacts.concat(data.results || []);
    after = data.paging?.next?.after || null;
  } while (after && pages < 200);

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
      lead_status: p.edumove_lead_status || mapHsToEdumove(p.hs_lead_status || ''),
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
// Map HubSpot hs_lead_status → Edumove lead_status (when edumove_lead_status is empty)
function mapHsToEdumove(hsStatus) {
  const map = {
    'Nouveau': 'Nouveau',
    'Nouveau - Chaud': 'Nouveau',
    'Disqualifié': 'Disqualifié',
    'Mauvais numéro': 'Disqualifié',
    'Raccroche au nez': 'Disqualifié',
    'Doublon': 'Disqualifié',
    'Autre prépa concurrente': 'Disqualifié',
    'Inscrit': 'Disqualifié',
    'Pré-inscrit 2025/2026': 'Disqualifié',
    'Pré-inscrit 2026/2027': 'Disqualifié',
    'En cours': 'Nouveau',
    'Rdv pris': 'Va candidater',
    'NRP1': 'Nouveau',
    'NRP2': 'Nouveau',
    'NRP3': 'Nouveau',
    'NRP4': 'Nouveau'
  };
  return map[hsStatus] || '';
}

// ── ASSIGN: Assign contacts to a telepro ──
async function assignContacts(req, res) {
  const { contactIds, assignTo, assignName } = req.body;
  if (!Array.isArray(contactIds) || !contactIds.length) return safeError(res, 400, 'contactIds required');

  const sb = getSupabase();
  const updateData = { assigned_to: assignTo || null, assigned_name: assignName || null };

  let updated = 0;
  for (let i = 0; i < contactIds.length; i += 500) {
    const batch = contactIds.slice(i, i + 500);
    const { error } = await sb.from('crm_contacts').update(updateData).in('id', batch);
    if (!error) updated += batch.length;
    else console.error('Assign error:', error.message);
  }

  return res.status(200).json({ ok: true, updated });
}

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
