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

// ── LIST CONTACTS ──
async function listContacts(req, res, token) {
  const { after, search } = req.body;

  // If search query, use search endpoint
  if (search && search.trim()) {
    const searchRes = await hubFetch(token, 'POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [],
      query: search.trim(),
      limit: 100,
      properties: ['firstname', 'lastname', 'email', 'phone', 'edumove_lead_status', 'edumove_profil', 'edumove_score', 'edumove_destination', 'edumove_candidature_id', 'createdate', 'hs_lead_status', 'lifecyclestage', 'edumove_departement'],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }]
    });
    const data = await searchRes.json();
    return res.status(200).json({
      contacts: (data.results || []).map(formatContact),
      total: data.total || 0,
      hasMore: false
    });
  }

  // Default: list all with pagination
  let url = '/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,phone,edumove_lead_status,edumove_profil,edumove_score,edumove_destination,edumove_candidature_id,createdate,hs_lead_status,lifecyclestage,edumove_departement';
  if (after) url += '&after=' + after;

  const listRes = await hubFetch(token, 'GET', url);
  const data = await listRes.json();

  return res.status(200).json({
    contacts: (data.results || []).map(formatContact),
    total: data.total || 0,
    hasMore: !!data.paging?.next?.after,
    after: data.paging?.next?.after || null
  });
}

// ── UPDATE CONTACT ──
async function updateContact(req, res, token) {
  const { contactId, properties } = req.body;
  if (!contactId) return safeError(res, 400, 'contactId required');

  // Only allow updating specific safe properties
  const allowed = ['edumove_lead_status', 'hs_lead_status', 'lifecyclestage'];
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
    leadStatus: p.edumove_lead_status || p.hs_lead_status || '',
    lifecycle: p.lifecyclestage || '',
    profil: p.edumove_profil || '',
    score: p.edumove_score || '',
    destination: p.edumove_destination || '',
    departement: p.edumove_departement || '',
    candidatureId: p.edumove_candidature_id || '',
    createdAt: p.createdate || ''
  };
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
