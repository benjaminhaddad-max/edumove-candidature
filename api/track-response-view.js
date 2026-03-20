// Vercel Serverless Function — Log each time a student views their Edumove response
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { candidatureId } = req.body || {};
    if (!candidatureId) return res.status(400).json({ error: 'candidatureId required' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Insert a row into response_views log
    const now = new Date().toISOString();
    await sb.from('response_views').insert({ candidature_id: candidatureId, viewed_at: now });

    // 2. Update candidature: increment view count + set first view timestamp
    const { data } = await sb.from('candidatures')
      .select('response_view_count, response_viewed_at')
      .eq('id', candidatureId)
      .single();

    const prev = data?.response_view_count || 0;
    const updateObj = { response_view_count: prev + 1 };
    if (!data?.response_viewed_at) {
      updateObj.response_viewed_at = now;
    }
    await sb.from('candidatures').update(updateObj).eq('id', candidatureId);

    return res.status(200).json({ ok: true, viewCount: prev + 1 });
  } catch (err) {
    console.error('Track response view error:', err.message);
    return res.status(500).json({ error: 'Failed' });
  }
};
