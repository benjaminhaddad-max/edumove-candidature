// Vercel Serverless Function — CRM: List & Update HubSpot contacts
// POST /api/hubspot-contacts { action: "list" | "update", ... }
const { setCorsHeaders, safeError } = require('./_shared');

const ALLOWED_ORIGINS = [
  'https://candidature.edumove.fr',
  'https://edumove-candidature-main.vercel.app'
];

module.exports = async function handler(req, res) {
  // CORS
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

  // Verify API key
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.API_SHARED_SECRET) return safeError(res, 401, 'Unauthorized');

  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!hubspotToken) return safeError(res, 500, 'HubSpot not configured');

  const { action } = req.body;

  try {
    if (action === 'list') {
      return await listContacts(req, res, hubspotToken);
    } else if (action === 'update') {
      return await updateContact(req, res, hubspotToken);
    } else if (action === 'forms') {
      return await listFormSubmissions(req, res, hubspotToken);
    } else {
      return safeError(res, 400, 'Invalid action. Use: list, update, forms');
    }
  } catch (err) {
    console.error('HubSpot CRM error:', err.message);
    return safeError(res, 500, 'HubSpot request failed');
  }
};

const CONTACT_PROPERTIES = ['firstname', 'lastname', 'email', 'phone', 'edumove_lead_status', 'edumove_profil', 'edumove_score', 'edumove_destination', 'edumove_candidature_id', 'createdate', 'hs_lead_status', 'lifecyclestage', 'edumove_departement', 'recent_conversion_event_name', 'hs_analytics_source'];

// ── LIST CONTACTS (only from Edumove forms) ──
// Uses HubSpot search API filtering on recent_conversion_event_name containing "EDUMOVE"
async function listContacts(req, res, token) {
  const { after, search } = req.body;

  // Base filter: only contacts who submitted an EDUMOVE form
  const edumoveFilter = {
    propertyName: 'recent_conversion_event_name',
    operator: 'CONTAINS_TOKEN',
    value: 'EDUMOVE'
  };

  // Search with text query + Edumove filter
  if (search && search.trim()) {
    const searchRes = await hubFetch(token, 'POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{ filters: [edumoveFilter] }],
      query: search.trim(),
      limit: 100,
      properties: CONTACT_PROPERTIES,
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }]
    });
    const data = await searchRes.json();
    return res.status(200).json({
      contacts: (data.results || []).map(formatContact),
      total: data.total || 0,
      hasMore: false
    });
  }

  // Paginated list of Edumove contacts only (search API, max 100 per page)
  const afterNum = after ? parseInt(after) : 0;
  const searchRes = await hubFetch(token, 'POST', '/crm/v3/objects/contacts/search', {
    filterGroups: [{ filters: [edumoveFilter] }],
    limit: 100,
    after: afterNum,
    properties: CONTACT_PROPERTIES,
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }]
  });
  const data = await searchRes.json();
  const nextAfter = data.paging?.next?.after || null;

  return res.status(200).json({
    contacts: (data.results || []).map(formatContact),
    total: data.total || 0,
    hasMore: !!nextAfter,
    after: nextAfter
  });
}

// ── UPDATE CONTACT ──
async function updateContact(req, res, token) {
  const { contactId, properties } = req.body;
  if (!contactId) return safeError(res, 400, 'contactId required');

  // Only allow updating specific safe properties
  const allowed = ['edumove_lead_status', 'hs_lead_status', 'lifecyclestage', 'edumove_profil'];
  const safeProps = {};
  for (const [key, val] of Object.entries(properties || {})) {
    if (allowed.includes(key)) safeProps[key] = val;
  }

  const updateRes = await hubFetch(token, 'PATCH', `/crm/v3/objects/contacts/${contactId}`, { properties: safeProps });
  if (!updateRes.ok) {
    const err = await updateRes.text();
    console.error('HubSpot update error:', err);
    return safeError(res, 502, 'HubSpot update failed');
  }

  return res.status(200).json({ success: true });
}

// ── FORM SUBMISSIONS ──
async function listFormSubmissions(req, res, token) {
  // List recent form submissions
  const formsRes = await hubFetch(token, 'GET', '/marketing/v3/forms?limit=50');
  const formsData = await formsRes.json();

  return res.status(200).json({
    forms: (formsData.results || []).map(f => ({
      id: f.id,
      name: f.name,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt
    }))
  });
}

// ── HELPERS ──
function formatContact(c) {
  const p = c.properties || {};
  return {
    id: c.id,
    nom: p.lastname || '',
    prenom: p.firstname || '',
    email: p.email || '',
    tel: p.phone || '',
    leadStatus: p.edumove_lead_status || '',
    hsLeadStatus: p.hs_lead_status || '',
    lifecycle: p.lifecyclestage || '',
    profil: p.edumove_profil || '',
    score: p.edumove_score || '',
    destination: p.edumove_destination || '',
    departement: p.edumove_departement || '',
    candidatureId: p.edumove_candidature_id || '',
    formName: cleanFormName(p.recent_conversion_event_name || ''),
    source: p.hs_analytics_source || '',
    createdAt: p.createdate || ''
  };
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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`https://api.hubapi.com${path}`, opts);
}
