// ═══════════════════════════════════════════════════════
// CRON STATUS ENGINE — Auto-transition des candidatures
// Tourne toutes les 15 min via Vercel Cron (8h-20h)
// ═══════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── Business hours config ──
const OFFICE_OPEN_H = 8, OFFICE_CLOSE_H = 20;
const OFFICE_OPEN_MIN = OFFICE_OPEN_H * 60;
const OFFICE_CLOSE_MIN = OFFICE_CLOSE_H * 60;

function businessMinutesElapsed(startDate) {
  const now = new Date();
  let cur = new Date(startDate.getTime());
  let elapsed = 0;

  let m = cur.getHours() * 60 + cur.getMinutes();
  if (m < OFFICE_OPEN_MIN) {
    cur.setHours(OFFICE_OPEN_H, 0, 0, 0);
  } else if (m >= OFFICE_CLOSE_MIN) {
    cur.setDate(cur.getDate() + 1);
    cur.setHours(OFFICE_OPEN_H, 0, 0, 0);
  }

  while (cur < now) {
    const curMin = cur.getHours() * 60 + cur.getMinutes();
    const endOfDay = new Date(cur);
    endOfDay.setHours(OFFICE_CLOSE_H, 0, 0, 0);

    if (now <= endOfDay) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      elapsed += Math.max(0, nowMin - curMin);
      break;
    } else {
      elapsed += OFFICE_CLOSE_MIN - curMin;
      cur.setDate(cur.getDate() + 1);
      cur.setHours(OFFICE_OPEN_H, 0, 0, 0);
    }
  }
  return elapsed;
}

function toDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

module.exports = async function handler(req, res) {
  // Verify cron secret (Vercel sends this automatically)
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if within business hours (8h-20h Paris time)
  const now = new Date();
  const parisHour = parseInt(now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }));
  if (parisHour < 8 || parisHour >= 20) {
    return res.json({ ok: true, skipped: true, reason: 'Outside business hours', parisHour });
  }

  try {
    // Fetch all candidatures that are 'en_cours'
    const { data: candidatures, error } = await getSupabase()
      .from('candidatures')
      .select('*')
      .eq('status', 'en_cours');

    if (error) {
      console.error('Fetch error:', error);
      return res.status(500).json({ error: error.message });
    }

    let advanced = 0;
    let smsSent = 0;

    for (const c of (candidatures || [])) {
      if (c.manualOverride) continue;

      // Determine start time: uni_selections_at (preferred) or created_at (fallback)
      const startTime = c.uni_selections_at || c.created_at;
      if (!startTime) continue;

      const startDate = toDate(startTime);
      if (!startDate) continue;

      const elapsed = businessMinutesElapsed(startDate);

      if (elapsed >= 120) {
        // Advance to reponse_edumove
        const existing = Array.isArray(c.status_history) ? c.status_history : [];
        const { error: updateErr } = await getSupabase().from('candidatures').update({
          status: 'reponse_edumove',
          auto_response_generated_at: new Date().toISOString(),
          status_history: [...existing, { status: 'reponse_edumove', at: new Date().toISOString(), by: 'auto-cron' }]
        }).eq('id', c.id);

        if (!updateErr) {
          advanced++;

          // Send SMS notification if not already sent
          if (c.tel && !c.sms_reponse_sent) {
            try {
              const smsResult = await sendSmsReponse(c);
              if (smsResult) {
                await getSupabase().from('candidatures').update({ sms_reponse_sent: true }).eq('id', c.id);
                smsSent++;
              }
            } catch (e) {
              console.warn('SMS error for', c.id, e.message);
            }
          }

          // Send email notification if email exists
          if (c.email) {
            try {
              await sendEmailReponse(c);
            } catch (e) {
              console.warn('Email error for', c.id, e.message);
            }
          }
        }
      }
    }

    return res.json({
      ok: true,
      checked: (candidatures || []).length,
      advanced,
      smsSent,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// ── Send SMS via SMS Factor ──
async function sendSmsReponse(c) {
  const token = process.env.SMSFACTOR_TOKEN;
  if (!token) return false;

  const prenom = c.prenom || '';
  const message = `${prenom ? prenom + ', v' : 'V'}otre réponse Edumove est disponible ! Connectez-vous pour la consulter : candidature.edumove.fr`;

  const tel = c.tel.replace(/[\s\-\.]/g, '');
  const formatted = tel.startsWith('0') ? '+33' + tel.slice(1) : tel;

  const resp = await fetch('https://api.smsfactor.com/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sms: {
        message: { text: message, pushtype: 'alert', sender: 'EDUMOVE' },
        recipients: { gsm: [{ value: formatted }] }
      }
    })
  });

  return resp.ok;
}

// ── Send Email via Brevo ──
async function sendEmailReponse(c) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return;

  const prenom = c.prenom || 'Candidat(e)';

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'Edumove', email: 'contact@edumove.fr' },
      to: [{ email: c.email, name: `${c.prenom || ''} ${c.nom || ''}`.trim() }],
      subject: `${prenom}, votre réponse Edumove est prête !`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#1b1d3a,#2a2356);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;font-size:24px;">EDUMOVE</h1>
          </div>
          <div style="background:white;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
            <h2 style="color:#1b1d3a;">Bonjour ${prenom},</h2>
            <p style="color:#374151;font-size:16px;line-height:1.6;">
              Notre équipe a analysé votre dossier et votre <strong>réponse personnalisée</strong> est maintenant disponible dans votre espace candidature.
            </p>
            <div style="text-align:center;margin:30px 0;">
              <a href="https://candidature.edumove.fr" style="background:#e97b2c;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
                Voir ma réponse
              </a>
            </div>
            <p style="color:#6b7280;font-size:14px;">
              Si vous avez des questions, n'hésitez pas à nous contacter via la messagerie de votre espace.
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
            <p style="color:#9ca3af;font-size:12px;text-align:center;">
              © 2026 EDUMOVE — edumove.fr
            </p>
          </div>
        </div>
      `
    })
  });
}
