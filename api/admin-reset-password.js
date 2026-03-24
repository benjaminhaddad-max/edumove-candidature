// Vercel Serverless Function — Admin: force-set a user's password
// POST /api/admin-reset-password  { user_id, new_password }
// Requires x-api-key header matching API_SHARED_SECRET
const { setCorsHeaders, handlePreflight, verifyApiKey, safeError } = require('./_shared');

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (handlePreflight(req, res)) return;
  if (!verifyApiKey(req)) return safeError(res, 401, 'Unauthorized');

  const { user_id, new_password } = req.body || {};
  if (!user_id) return safeError(res, 400, 'Missing user_id');
  if (!new_password || new_password.length < 6) return safeError(res, 400, 'Password must be at least 6 characters');

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) return safeError(res, 500, 'Service not configured');

  try {
    const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, {
      method: 'PUT',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: new_password })
    });

    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}));
      console.error('Admin reset password failed:', err);
      return safeError(res, 502, err.msg || 'Failed to update password');
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('admin-reset-password error:', err.message);
    return safeError(res, 500, 'Password reset failed');
  }
};
