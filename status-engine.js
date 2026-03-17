// ═══════════════════════════════════════════════════════
// STATUS ENGINE — Moteur d'auto-transition des candidatures
// Charge par espace.html et admin.html apres firebase-config.js
// ═══════════════════════════════════════════════════════

const OFFICE_OPEN_H = 8, OFFICE_OPEN_M = 30;   // 08:30
const OFFICE_CLOSE_H = 19, OFFICE_CLOSE_M = 30; // 19:30
const OFFICE_OPEN_MIN = OFFICE_OPEN_H * 60 + OFFICE_OPEN_M;     // 510
const OFFICE_CLOSE_MIN = OFFICE_CLOSE_H * 60 + OFFICE_CLOSE_M;  // 1170
const OFFICE_DAY_MIN = OFFICE_CLOSE_MIN - OFFICE_OPEN_MIN;      // 660 = 11h

// ── Calcul heures ouvrables ──

function addBusinessMinutes(startDate, businessMinutes) {
  let cur = new Date(startDate.getTime());
  let remaining = businessMinutes;

  // Snap to office hours
  let m = cur.getHours() * 60 + cur.getMinutes();
  if (m < OFFICE_OPEN_MIN) {
    cur.setHours(OFFICE_OPEN_H, OFFICE_OPEN_M, 0, 0);
  } else if (m >= OFFICE_CLOSE_MIN) {
    cur.setDate(cur.getDate() + 1);
    cur.setHours(OFFICE_OPEN_H, OFFICE_OPEN_M, 0, 0);
  }

  while (remaining > 0) {
    const curMin = cur.getHours() * 60 + cur.getMinutes();
    const leftToday = OFFICE_CLOSE_MIN - curMin;
    if (leftToday <= 0) {
      cur.setDate(cur.getDate() + 1);
      cur.setHours(OFFICE_OPEN_H, OFFICE_OPEN_M, 0, 0);
      continue;
    }
    if (remaining <= leftToday) {
      cur.setMinutes(cur.getMinutes() + remaining);
      remaining = 0;
    } else {
      remaining -= leftToday;
      cur.setDate(cur.getDate() + 1);
      cur.setHours(OFFICE_OPEN_H, OFFICE_OPEN_M, 0, 0);
    }
  }
  return cur;
}

function businessMinutesElapsed(startDate) {
  const now = new Date();
  let cur = new Date(startDate.getTime());
  let elapsed = 0;

  // Snap start to office hours
  let m = cur.getHours() * 60 + cur.getMinutes();
  if (m < OFFICE_OPEN_MIN) {
    cur.setHours(OFFICE_OPEN_H, OFFICE_OPEN_M, 0, 0);
  } else if (m >= OFFICE_CLOSE_MIN) {
    cur.setDate(cur.getDate() + 1);
    cur.setHours(OFFICE_OPEN_H, OFFICE_OPEN_M, 0, 0);
  }

  while (cur < now) {
    const curMin = cur.getHours() * 60 + cur.getMinutes();
    const endOfDay = new Date(cur);
    endOfDay.setHours(OFFICE_CLOSE_H, OFFICE_CLOSE_M, 0, 0);

    if (now <= endOfDay) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      elapsed += Math.max(0, nowMin - curMin);
      break;
    } else {
      elapsed += OFFICE_CLOSE_MIN - curMin;
      cur.setDate(cur.getDate() + 1);
      cur.setHours(OFFICE_OPEN_H, OFFICE_OPEN_M, 0, 0);
    }
  }
  return elapsed;
}

// ── Helper: convertir timestamp ──

function toDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

// ── Auto-transition ──

async function checkAndAdvanceStatus(candidatureId, data) {
  if (data.manualOverride) return false;
  const now = new Date();

  // TRANSITION 1: en_attente → en_cours (2h ouvrables = 120 min)
  if (data.status === 'en_attente' && data.created_at) {
    const submittedAt = toDate(data.created_at);
    if (!submittedAt) return false;
    const elapsed = businessMinutesElapsed(submittedAt);

    if (elapsed >= 120) {
      const transitionTime = addBusinessMinutes(submittedAt, 120);
      const existing = Array.isArray(data.status_history) ? data.status_history : [];
      await supabase.from('candidatures').update({
        status: 'en_cours',
        status_history: [...existing, { status: 'en_cours', at: transitionTime.toISOString(), by: 'auto' }]
      }).eq('id', candidatureId);
      return true;
    }
  }

  // TRANSITION 2: en_cours → reponse_edumove (24h reelles)
  if (data.status === 'en_cours') {
    const history = data.status_history || [];
    const enCoursEntry = history.find(h => h.status === 'en_cours');
    if (enCoursEntry) {
      const enCoursAt = toDate(enCoursEntry.at);
      if (enCoursAt && (now.getTime() - enCoursAt.getTime()) >= 24 * 60 * 60 * 1000) {
        const responseText = generateReponseEdumove(data);
        const existing = Array.isArray(data.status_history) ? data.status_history : [];
        await supabase.from('candidatures').update({
          status: 'reponse_edumove',
          auto_response_text: responseText,
          auto_response_generated_at: new Date().toISOString(),
          status_history: [...existing, { status: 'reponse_edumove', at: new Date().toISOString(), by: 'auto' }]
        }).eq('id', candidatureId);
        return true;
      }
    } else {
      // Pas d'entree en_cours dans l'historique, utiliser created_at + 2h comme estimation
      const submittedAt = toDate(data.created_at);
      if (submittedAt) {
        const estimatedEnCours = addBusinessMinutes(submittedAt, 120);
        if ((now.getTime() - estimatedEnCours.getTime()) >= 24 * 60 * 60 * 1000) {
          const responseText = generateReponseEdumove(data);
          const existing = Array.isArray(data.status_history) ? data.status_history : [];
          await supabase.from('candidatures').update({
            status: 'reponse_edumove',
            auto_response_text: responseText,
            auto_response_generated_at: new Date().toISOString(),
            status_history: [...existing, { status: 'reponse_edumove', at: new Date().toISOString(), by: 'auto' }]
          }).eq('id', candidatureId);
          return true;
        }
      }
    }
  }

  return false;
}

// ── Generation de la reponse EDUMOVE (cote etudiant) ──

function generateReponseEdumove(c) {
  const langues = c.langues || {};
  const dest = c.destination;
  const uni = (c.universite || '').toUpperCase();
  const prenom = c.prenom || 'Candidat(e)';
  const filieres = c.classement_filieres || ['medecine','dentaire','kinesitherapie','pharmacie','veterinaire'];
  const score = parseFloat(c.score) || 0;

  const esp = langues.espagnol || 'aucun';
  const eng = langues.anglais || 'aucun';

  // Map filiere IDs to labels
  const fLabels = { medecine: 'Medecine', dentaire: 'Dentaire', kinesitherapie: 'Kinesitherapie', pharmacie: 'Pharmacie', veterinaire: 'Veterinaire' };

  // Build university full names
  const uniNames = {
    UEM: 'Universidad Europea',
    UCJC: 'Universidad Camilo Jose Cela (UCJC)',
    LINK: 'LINK Campus University (Italie)'
  };
  const uniName = uniNames[uni] || uni;

  // Determine available options based on profile
  const options = [];

  // UE options per filiere
  const ueVilles = ['Madrid', 'Malaga', 'Valence', 'Alicante', 'Canaries'];
  const complets = [
    'Malaga-Dentaire-Espagnol', 'Malaga-Dentaire-Anglais',
    'Alicante-Dentaire-Espagnol', 'Alicante-Dentaire-Anglais',
    'Valence-Kinesitherapie-Espagnol', 'Alicante-Kinesitherapie-Espagnol'
  ];

  filieres.forEach(f => {
    const fl = fLabels[f] || f;
    if (f === 'medecine') {
      // Medecine only in Madrid and Canaries, espagnol only
      options.push({ filiere: fl, uni: 'Universidad Europea - Madrid', langue: 'Espagnol', complet: false });
      options.push({ filiere: fl, uni: 'Universidad Europea - Canaries', langue: 'Espagnol', complet: false });
      // LINK also offers medicine
      options.push({ filiere: fl, uni: 'LINK Campus University (Italie)', langue: 'Pas de prerequis linguistique', complet: false });
    } else {
      // UE: all cities for other filieres
      ueVilles.forEach(v => {
        const languesDispos = [];
        if (f === 'kinesitherapie' && v === 'Madrid') {
          languesDispos.push('Espagnol', 'Anglais', 'Francais');
        } else {
          languesDispos.push('Espagnol', 'Anglais');
        }
        languesDispos.forEach(l => {
          const key = v + '-' + fl + '-' + l;
          const isComplet = complets.includes(key);
          options.push({ filiere: fl, uni: 'Universidad Europea - ' + v, langue: l, complet: isComplet });
        });
      });
      // LINK for this filiere
      options.push({ filiere: fl, uni: 'LINK Campus University (Italie)', langue: 'Pas de prerequis linguistique', complet: false });
    }
    // UCJC for each filiere
    options.push({ filiere: fl, uni: 'UCJC - Madrid', langue: 'Espagnol (B2 facultatif)', complet: false });
  });

  // Get top recommendation (first filiere, best match)
  const topFiliere = fLabels[filieres[0]] || filieres[0];

  let t = '';
  t += `Bonjour ${prenom},\n\n`;
  t += `Apres analyse approfondie de votre dossier, notre equipe est heureuse de vous presenter votre orientation personnalisee.\n\n`;

  // Evaluation
  t += `📚 EVALUATION DE VOTRE DOSSIER\n`;
  if (score >= 13) {
    t += `Votre dossier academique est excellent. Vous avez acces a l'ensemble de nos universites partenaires et a toutes les filieres disponibles.\n\n`;
  } else if (score >= 10) {
    t += `Votre dossier academique est solide et vous ouvre l'acces a plusieurs universites partenaires de qualite.\n\n`;
  } else {
    t += `Nous avons identifie des options parfaitement adaptees a votre profil pour vous accompagner dans votre projet d'etudes de sante en Europe.\n\n`;
  }

  // Top recommendation
  t += `🎯 NOTRE RECOMMANDATION PRINCIPALE\n`;
  t += `Filiere : ${topFiliere}\n`;
  t += `Universite : ${uniName}`;
  if (uni === 'UEM') {
    t += ' - Madrid';
  }
  t += '\n\n';

  // All available options for top 2 filieres
  t += `📋 VOS OPTIONS DISPONIBLES\n`;
  const topFilieres = filieres.slice(0, 3);
  topFilieres.forEach(f => {
    const fl = fLabels[f] || f;
    t += `\n--- ${fl.toUpperCase()} ---\n`;
    const fopts = options.filter(o => o.filiere === fl && !o.complet);
    if (fopts.length === 0) {
      t += `Pas de place disponible actuellement.\n`;
    } else {
      // Group by uni
      const grouped = {};
      fopts.forEach(o => {
        if (!grouped[o.uni]) grouped[o.uni] = [];
        grouped[o.uni].push(o.langue);
      });
      Object.keys(grouped).forEach(u => {
        t += `  • ${u} (${grouped[u].join(' / ')})\n`;
      });
    }
  });

  t += '\n';

  // Next steps
  t += `📌 PROCHAINES ETAPES\n`;
  t += `1. Choisissez votre combinaison ville / filiere / langue ci-dessous\n`;
  t += `2. Preparez les documents demandes\n`;
  t += `3. L'equipe EDUMOVE verifiera votre dossier et lancera votre inscription\n\n`;
  t += `Si vous souhaitez en discuter, demandez un rappel telephonique.\n\n`;
  t += `Cordialement,\nL'equipe EDUMOVE`;

  return t;
}

// ── Suggestion IA pour l'admin ──

function generateAdminSuggestion(c) {
  const score = parseFloat(c.score) || 0;
  const langues = c.langues || {};
  const esp = langues.espagnol || 'aucun';
  const eng = langues.anglais || 'aucun';
  const dest = c.destination;
  const uni = c.universite;

  let html = '<div style="margin-bottom:12px;">';
  html += `<strong>Score academique :</strong> ${score.toFixed(1)}/20 — `;

  if (score >= 13) {
    html += `<span style="color:var(--success);font-weight:600;">Excellent dossier</span>`;
  } else if (score >= 10) {
    html += `<span style="color:#1565c0;font-weight:600;">Dossier correct</span>`;
  } else {
    html += `<span style="color:var(--error);font-weight:600;">Dossier faible</span>`;
  }
  html += '</div>';

  html += '<div style="margin-bottom:12px;">';
  html += `<strong>Langues :</strong> Espagnol ${esp}, Anglais ${eng}`;
  html += '</div>';

  html += '<div style="margin-bottom:12px;">';
  html += `<strong>Orientation algo :</strong> ${dest === 'espagne' ? 'Espagne' : 'Italie'} — ${uni}`;
  html += '</div>';

  html += '<div style="padding:12px;background:#f0f7ff;border-radius:6px;margin-bottom:12px;">';
  html += '<strong>💡 Action suggeree :</strong> ';

  if (score >= 13) {
    if (esp === 'b2') {
      html += `Accepter → UCJC + UEM (Espagne). Candidat prioritaire, profil bilingue espagnol.`;
    } else if (eng === 'b2' || eng === 'b1') {
      html += `Accepter → UEM (Espagne, cursus anglophone). Bon profil.`;
    } else {
      html += `Accepter → LINK Campus (Italie). Excellent dossier, accompagnement linguistique.`;
    }
  } else if (score >= 10) {
    if (esp === 'b2') {
      html += `Accepter avec accompagnement → UCJC + UEM (Espagne). Profil espagnol solide.`;
    } else if (eng === 'b2' || eng === 'b1') {
      html += `Accepter avec accompagnement → UEM (Espagne). Anglais correct.`;
    } else {
      html += `Accepter avec accompagnement renforce → LINK Campus (Italie).`;
    }
  } else {
    html += `<span style="color:var(--error);">Entretien telephonique recommande avant decision.</span> Score faible, evaluer la motivation du candidat.`;
  }
  html += '</div>';

  if (c.callback_requested) {
    const cbDate = c.callback_requested_at ? toDate(c.callback_requested_at) : null;
    html += `<div style="padding:10px 12px;background:#fff3e0;border-radius:6px;border-left:3px solid #e65100;">`;
    html += `<strong style="color:#e65100;">📞 Rappel telephonique demande</strong>`;
    if (cbDate) {
      html += `<br><span style="font-size:12px;color:var(--text-muted);">Le ${cbDate.toLocaleDateString('fr-FR')} a ${cbDate.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</span>`;
    }
    html += '</div>';
  }

  return html;
}
