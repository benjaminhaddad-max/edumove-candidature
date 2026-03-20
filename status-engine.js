// ═══════════════════════════════════════════════════════
// STATUS ENGINE — Moteur d'auto-transition des candidatures
// Charge par espace.html et admin.html apres firebase-config.js
// ═══════════════════════════════════════════════════════

const OFFICE_OPEN_H = 8, OFFICE_OPEN_M = 0;     // 08:00
const OFFICE_CLOSE_H = 20, OFFICE_CLOSE_M = 0;  // 20:00
const OFFICE_OPEN_MIN = OFFICE_OPEN_H * 60 + OFFICE_OPEN_M;     // 480
const OFFICE_CLOSE_MIN = OFFICE_CLOSE_H * 60 + OFFICE_CLOSE_M;  // 1200
const OFFICE_DAY_MIN = OFFICE_CLOSE_MIN - OFFICE_OPEN_MIN;      // 720 = 12h

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

  // ── TRANSITION : en_cours → reponse_edumove ──
  // Le timer de 2h ouvrées (9h-20h, lun-dim) démarre quand l'étudiant
  // confirme ses choix d'universités (uni_selections_at).
  // Pendant ces 2h le statut reste "en_cours" ("En attente de validation")
  // pour simuler une validation humaine.
  if (data.status === 'en_cours' && data.uni_selections_at) {
    const selectionsAt = toDate(data.uni_selections_at);
    if (!selectionsAt) return false;
    const elapsed = businessMinutesElapsed(selectionsAt);

    if (elapsed >= 120) {
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

  // Fallback : si en_cours mais pas de uni_selections_at (anciens dossiers),
  // utiliser created_at + 2h ouvrées comme estimation
  if (data.status === 'en_cours' && !data.uni_selections_at && data.created_at) {
    const submittedAt = toDate(data.created_at);
    if (submittedAt) {
      const elapsed = businessMinutesElapsed(submittedAt);
      if (elapsed >= 120) {
        const responseText = generateReponseEdumove(data);
        const existing = Array.isArray(data.status_history) ? data.status_history : [];
        await supabase.from('candidatures').update({
          status: 'reponse_edumove',
          auto_response_text: responseText,
          auto_response_generated_at: new Date().toISOString(),
          status_history: [...existing, { status: 'reponse_edumove', at: new Date().toISOString(), by: 'auto' }]
        }).eq('id', candidatureId);
        sendSmsReponseEdumove(data);
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
          sendSmsReponseEdumove(data);
          return true;
        }
      }
    }
  }

  return false;
}

// ── Envoi SMS via SMS Factor (transition auto → reponse_edumove) ──
function sendSmsReponseEdumove(c) {
  if (!c || !c.tel || c.sms_reponse_sent) return;
  fetch('/api/send-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tel: c.tel, prenom: c.prenom })
  }).then(r => r.json()).then(data => {
    if (data.ok) {
      supabase.from('candidatures').update({ sms_reponse_sent: true }).eq('id', c.id);
    }
  }).catch(e => console.warn('SMS auto non envoyé :', e));
}

// ── Génération de la réponse EDUMOVE (côté étudiant) ──

function generateReponseEdumove(c) {
  const score = parseFloat(c.score) || 0;
  const langues = c.langues || {};
  const dest = c.destination;
  const uni = c.universite;
  const filiere = c.filiere || '';
  const prenom = c.prenom || 'Candidat(e)';

  const langLabels = {
    b2: 'bilingue/courant (B2+)',
    b1: 'intermédiaire (B1)',
    debut: 'débutant (A1/A2)',
    aucun: 'aucune connaissance'
  };
  const filiereLabels = {
    medecine: 'Médecine', dentaire: 'Dentaire',
    kine: 'Kinésithérapie', pharmacie: 'Pharmacie'
  };

  const esp = langues.espagnol || 'aucun';
  const eng = langues.anglais || 'aucun';

  let t = '';
  t += `Bonjour ${prenom},\n\n`;
  t += `Après analyse approfondie de votre dossier par notre équipe, nous sommes heureux de vous présenter notre recommandation personnalisée.\n\n`;

  // Profil académique
  t += `📚 VOTRE PROFIL ACADÉMIQUE\n`;
  if (filiere) t += `Filière visée : ${filiereLabels[filiere] || filiere}\n`;
  t += `Votre moyenne académique est de ${score.toFixed(1)}/20. `;
  if (score >= 13) {
    t += `C'est un excellent dossier qui vous ouvre les portes des meilleures universités partenaires EDUMOVE.\n\n`;
  } else if (score >= 10) {
    t += `C'est un dossier solide qui vous permet d'accéder à plusieurs universités partenaires de qualité.\n\n`;
  } else {
    t += `Nous avons identifié des options adaptées à votre profil pour vous accompagner au mieux dans votre projet d'études en Europe.\n\n`;
  }

  // Langues
  t += `🌍 VOS COMPÉTENCES LINGUISTIQUES\n`;
  t += `Espagnol : ${langLabels[esp] || esp}\n`;
  t += `Anglais : ${langLabels[eng] || eng}\n`;
  if (langues.italien && langues.italien !== 'aucun') t += `Italien : ${langLabels[langues.italien] || langues.italien}\n`;
  if (langues.portugais && langues.portugais !== 'aucun') t += `Portugais : ${langLabels[langues.portugais] || langues.portugais}\n`;
  t += '\n';

  // Recommandation
  t += `🎯 NOTRE RECOMMANDATION\n`;
  t += `Destination : ${dest === 'espagne' ? 'Espagne 🇪🇸' : 'Italie 🇮🇹'}\n`;
  t += `Université : ${uni}\n\n`;

  // Justification selon filiere + langue
  t += `💡 POURQUOI CETTE RECOMMANDATION ?\n`;

  if (filiere === 'pharmacie' && dest === 'italie') {
    t += `Pour la filière Pharmacie, LINK Campus University en Italie vous accepte automatiquement, sans test d'entrée. Aucun prérequis en italien n'est requis : un accompagnement linguistique est intégré dans le cursus.\n\n`;
  } else if (filiere === 'pharmacie' && dest === 'espagne') {
    t += `Votre niveau de langue vous permet d'accéder directement aux programmes Pharmacie en Espagne. C'est une filière accessible avec de très bonnes perspectives.\n\n`;
  } else if ((filiere === 'kine' || filiere === 'pharmacie') && dest === 'espagne') {
    t += `Pour la filière ${filiereLabels[filiere] || filiere}, les universités espagnoles partenaires (${uni}) ont des critères d'admission accessibles. Votre profil correspond bien à leurs attentes.\n\n`;
  } else if (dest === 'espagne' && esp === 'b2') {
    t += `Votre niveau bilingue en espagnol est un atout déterminant. Il vous permet d'intégrer les cursus de santé en espagnol de l'UCJC et/ou l'UEM. Votre dossier académique vous oriente vers le(s) campus ${uni.includes('Madrid') ? 'de Madrid et Malaga' : 'de Valence, Alicante ou des Canaries'}.\n\n`;
    if (uni === 'UCJC') {
      t += `Note : votre intégration à l'UCJC est soumise à un entretien de 15 minutes avec un professeur. Un accompagnement EDUMOVE vous préparera à cet entretien.\n\n`;
    }
  } else if (dest === 'espagne' && (eng === 'b2' || eng === 'b1')) {
    t += `Votre niveau en anglais (${langLabels[eng]}) vous donne accès aux cursus anglophones de l'UEM. Votre dossier académique vous oriente vers le(s) campus ${uni.includes('Madrid') ? 'de Madrid et Malaga' : 'de Valence, Alicante ou des Canaries'}.\n\n`;
  } else {
    t += `LINK Campus University en Italie est notre université partenaire idéale pour votre profil. Aucun prérequis en italien n'est nécessaire : vous bénéficierez d'un accompagnement linguistique intégré tout au long de votre parcours. De nombreux étudiants francophones y réussissent brillamment chaque année.\n\n`;
  }

  // Prochaines étapes
  t += `📋 PROCHAINES ÉTAPES\n`;
  t += `1. Prenez connaissance de cette recommandation\n`;
  t += `2. Si vous souhaitez en discuter, demandez un rappel téléphonique avec un conseiller EDUMOVE\n`;
  t += `3. Notre équipe vous accompagnera dans la préparation de votre dossier d'inscription\n\n`;
  t += `N'hésitez pas à nous contacter pour toute question.\n\n`;
  t += `Cordialement,\nL'équipe EDUMOVE`;

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
  const filiere = c.filiere || '';
  const filiereLabels = {
    medecine: 'Médecine', dentaire: 'Dentaire',
    kine: 'Kinésithérapie', pharmacie: 'Pharmacie'
  };

  // Recalcul des éligibilités UEM depuis les notes de première
  const notesPremiere = c.notes_premiere || [];
  const SCIENCES = ['Mathématiques', 'Physique-Chimie', 'SVT'];
  const validSpecs = notesPremiere.filter(n => !isNaN(parseFloat(n.moy)));
  const spesAvg = validSpecs.length > 0
    ? validSpecs.reduce((s, n) => s + parseFloat(n.moy), 0) / validSpecs.length : 0;
  const sciCount = notesPremiere.filter(n => SCIENCES.includes(n.nom)).length;
  const uemMadridMalaga = sciCount >= 2 && spesAvg > 15;
  const uemAutres = spesAvg > 12.5;
  const uemFacile = spesAvg >= 10;

  let html = '<div style="margin-bottom:12px;">';
  if (filiere) html += `<strong>Filière visée :</strong> ${filiereLabels[filiere] || filiere} &nbsp;|&nbsp; `;
  html += `<strong>Score académique :</strong> ${score.toFixed(1)}/20 — `;

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
  if (validSpecs.length > 0) html += ` &nbsp;|&nbsp; <strong>Moy. spés 1ère :</strong> ${spesAvg.toFixed(1)}/20 (${sciCount} sci. sur ${notesPremiere.length})`;
  html += '</div>';

  html += '<div style="margin-bottom:12px;">';
  html += `<strong>Orientation algo :</strong> ${dest === 'espagne' ? 'Espagne' : 'Italie'} — ${uni}`;
  html += '</div>';

  html += '<div style="padding:12px;background:#f0f7ff;border-radius:6px;margin-bottom:12px;">';
  html += '<strong>💡 Action suggérée :</strong> ';

  if (filiere === 'pharmacie') {
    if (dest === 'italie') {
      html += `Accepter → LINK Campus (Italie). Pharmacie : acceptation automatique sans test.`;
    } else {
      html += `Accepter → ${uni} (Espagne). Pharmacie : critères académiques très bas.`;
    }
  } else if (filiere === 'kine') {
    if (dest === 'espagne') {
      html += `Accepter → ${uni} (Espagne). Kiné : UCJC accepte tous profils, UEM nécessite moy. >= 10 (actuelle : ${spesAvg.toFixed(1)}).`;
    } else {
      html += `Accepter → LINK Campus (Italie). Kiné : profil éligible, accompagnement linguistique.`;
    }
  } else if (filiere === 'medecine' || filiere === 'dentaire') {
    if (esp === 'b2' || esp === 'b1') {
      // UCJC: B1 ou B2 suffit pour médecine/dentaire (entretien 15 min)
      if (esp === 'b2' && uemMadridMalaga) {
        html += `Accepter → UCJC + UEM Madrid/Malaga (Espagne). Profil fort : espagnol B2, ${sciCount} spés sci., moy. ${spesAvg.toFixed(1)}/20 (> 15).`;
      } else if (esp === 'b2' && uemAutres) {
        html += `Accepter → UCJC + UEM Valence/Alicante/Canaris (Espagne). Espagnol B2, moy. ${spesAvg.toFixed(1)}/20 (> 12.5).`;
      } else if (esp === 'b2') {
        html += `<span style="color:#e65100;">UCJC seule (entretien obligatoire)</span>. Espagnol B2 mais moy. spés ${spesAvg.toFixed(1)}/20 < 12.5 — insuffisant pour UEM.`;
      } else {
        html += `UCJC éligible (espagnol B1 — entretien oral 15 min obligatoire). Moy. spés ${spesAvg.toFixed(1)}/20.`;
      }
    } else if (eng === 'b2' || eng === 'b1') {
      if (uemMadridMalaga) {
        html += `Accepter → UEM Madrid/Malaga (cursus anglophone). Bon profil : anglais ${eng}, moy. ${spesAvg.toFixed(1)}/20 (> 15).`;
      } else if (uemAutres) {
        html += `Accepter → UEM Valence/Alicante/Canaris (cursus anglophone). Anglais ${eng}, moy. ${spesAvg.toFixed(1)}/20 (> 12.5).`;
      } else {
        html += `Rediriger → LINK Campus (Italie). Anglais ${eng} mais moy. spés ${spesAvg.toFixed(1)}/20 insuffisante pour UEM.`;
      }
    } else {
      html += `Rediriger → LINK Campus (Italie). Pas de niveau suffisant en espagnol (B1 min pour UCJC) ni en anglais pour l'Espagne.`;
    }
  } else {
    // Filiere non renseignee : logique ancienne
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
