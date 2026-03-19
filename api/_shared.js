// Shared utilities for all API endpoints

const ALLOWED_ORIGINS = [
  'https://candidature.edumove.fr',
  'https://edumove-candidature-main.vercel.app'
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.some(o => origin.startsWith(o)) || origin.includes('edumove-candidature-main')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Vary', 'Origin');
}

function verifyApiKey(req) {
  const key = req.headers['x-api-key'];
  return key && key === process.env.API_SHARED_SECRET;
}

function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return true; }
  return false;
}

function safeError(res, code, publicMsg) {
  return res.status(code).json({ error: publicMsg || 'Internal error' });
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(tel) {
  if (!tel) return false;
  const clean = String(tel).replace(/[\s.\-()]/g, '');
  return /^[\+]?[0-9]{8,15}$/.test(clean);
}

function normalizePhone(tel) {
  let phone = String(tel).replace(/[\s.\-()]/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  else if (phone.startsWith('+')) phone = phone.slice(1);
  else if (phone.startsWith('0')) phone = '33' + phone.slice(1);
  return phone;
}

function capitalize(str) {
  if (!str) return 'Candidat';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = {
  setCorsHeaders,
  verifyApiKey,
  handlePreflight,
  safeError,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  capitalize,
  escapeHtml,
  ALLOWED_ORIGINS
};
