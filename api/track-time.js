// Lightweight beacon endpoint to track remaining time on page unload
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { candidatureId, seconds } = req.body || {};
    if (!candidatureId || !seconds || seconds < 1) return res.status(400).json({ error: 'Invalid' });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Get current time spent
    const { data } = await sb.from('candidatures').select('total_time_spent').eq('id', candidatureId).single();
    const prev = (data?.total_time_spent) || 0;

    await sb.from('candidatures').update({
      total_time_spent: prev + Math.min(seconds, 60), // cap at 60s safety
      last_viewed_at: new Date().toISOString()
    }).eq('id', candidatureId);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Track time error:', err.message);
    return res.status(500).json({ error: 'Failed' });
  }
};
