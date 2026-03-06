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

// ── Helper: convertir Firestore timestamp ──

function toDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

// ── Auto-transition ──

async function checkAndAdvanceStatus(candidatureId, data) {
  if (data.manualOverride) return false;
  const now = new Date();

  // TRANSITION 1: en_attente → en_cours (2h ouvrables = 120 min)
  if (data.status === 'en_attente' && data.createdAt) {
    const submittedAt = toDate(data.createdAt);
    if (!submittedAt) return false;
    const elapsed = businessMinutesElapsed(submittedAt);

    if (elapsed >= 120) {
      const transitionTime = addBusinessMinutes(submittedAt, 120);
      await db.collection('candidatures').doc(candidatureId).update({
        status: 'en_cours',
        statusHistory: firebase.firestore.FieldValue.arrayUnion({
          status: 'en_cours',
          at: firebase.firestore.Timestamp.fromDate(transitionTime),
          by: 'auto'
        })
      });
      return true;
    }
  }

  // TRANSITION 2: en_cours → reponse_edumove (24h reelles)
  if (data.status === 'en_cours') {
    const history = data.statusHistory || [];
    const enCoursEntry = history.find(h => h.status === 'en_cours');
    if (enCoursEntry) {
      const enCoursAt = toDate(enCoursEntry.at);
      if (enCoursAt && (now.getTime() - enCoursAt.getTime()) >= 24 * 60 * 60 * 1000) {
        const responseText = generateReponseEdumove(data);
        await db.collection('candidatures').doc(candidatureId).update({
          status: 'reponse_edumove',
          autoResponseText: responseText,
          autoResponseGeneratedAt: firebase.firestore.FieldValue.serverTimestamp(),
          statusHistory: firebase.firestore.FieldValue.arrayUnion({
            status: 'reponse_edumove',
            at: firebase.firestore.Timestamp.now(),
            by: 'auto'
          })
        });
        return true;
      }
    } else {
      // Pas d'entree en_cours dans l'historique, utiliser createdAt + 2h comme estimation
      const submittedAt = toDate(data.createdAt);
      if (submittedAt) {
        const estimatedEnCours = addBusinessMinutes(submittedAt, 120);
        if ((now.getTime() - estimatedEnCours.getTime()) >= 24 * 60 * 60 * 1000) {
          const responseText = generateReponseEdumove(data);
          await db.collection('candidatures').doc(candidatureId).update({
            status: 'reponse_edumove',
            autoResponseText: responseText,
            autoResponseGeneratedAt: firebase.firestore.FieldValue.serverTimestamp(),
            statusHistory: firebase.firestore.FieldValue.arrayUnion({
              status: 'reponse_edumove',
              at: firebase.firestore.Timestamp.now(),
              by: 'auto'
            })
          });
          return true;
        }
      }
    }
  }

  return false;
}

// ── Generation de la reponse EDUMOVE (cote etudiant) ──

function generateReponseEdumove(c) {
  const score = parseFloat(c.score) || 0;
  const langues = c.langues || {};
  const dest = c.destination;
  const uni = c.universite;
  const prenom = c.prenom || 'Candidat(e)';

  const langLabels = {
    b2: 'bilingue/courant (B2+)',
    b1: 'intermediaire (B1)',
    debut: 'debutant (A1/A2)',
    aucun: 'aucune connaissance'
  };

  const esp = langues.espagnol || 'aucun';
  const eng = langues.anglais || 'aucun';

  let t = '';
  t += `Bonjour ${prenom},\n\n`;
  t += `Apres analyse approfondie de votre dossier par notre equipe, nous sommes heureux de vous presenter notre recommandation personnalisee.\n\n`;

  // Profil academique
  t += `📚 VOTRE PROFIL ACADEMIQUE\n`;
  t += `Votre moyenne academique est de ${score.toFixed(1)}/20. `;
  if (score >= 13) {
    t += `C'est un excellent dossier qui vous ouvre les portes des meilleures universites partenaires EDUMOVE.\n\n`;
  } else if (score >= 10) {
    t += `C'est un dossier solide qui vous permet d'acceder a plusieurs universites partenaires de qualite.\n\n`;
  } else {
    t += `Nous avons identifie des options adaptees a votre profil pour vous accompagner au mieux dans votre projet d'etudes en Europe.\n\n`;
  }

  // Langues
  t += `🌍 VOS COMPETENCES LINGUISTIQUES\n`;
  t += `Espagnol : ${langLabels[esp] || esp}\n`;
  t += `Anglais : ${langLabels[eng] || eng}\n`;
  if (langues.italien && langues.italien !== 'aucun') t += `Italien : ${langLabels[langues.italien] || langues.italien}\n`;
  if (langues.portugais && langues.portugais !== 'aucun') t += `Portugais : ${langLabels[langues.portugais] || langues.portugais}\n`;
  t += '\n';

  // Recommandation
  t += `🎯 NOTRE RECOMMANDATION\n`;
  t += `Destination : ${dest === 'espagne' ? 'Espagne 🇪🇸' : 'Italie 🇮🇹'}\n`;
  t += `Universite : ${uni}\n\n`;

  // Justification
  t += `💡 POURQUOI CETTE RECOMMANDATION ?\n`;
  if (dest === 'espagne' && esp === 'b2') {
    t += `Votre niveau bilingue en espagnol est un atout majeur. Il vous permet d'integrer directement les cursus de sante en espagnol proposes par l'UCJC et l'UEM a Madrid. Ces universites sont reconnues en France et offrent un cadre d'etudes de tres haute qualite.\n\n`;
  } else if (dest === 'espagne' && (eng === 'b2' || eng === 'b1')) {
    t += `Votre bon niveau en anglais (${langLabels[eng]}) vous ouvre l'acces a l'UEM en Espagne, qui propose des cursus de sante en anglais. C'est une excellente option pour les profils anglophones souhaitant etudier dans un environnement international.\n\n`;
  } else {
    t += `LINK Campus University en Italie est notre universite partenaire ideale pour votre profil. Aucun prerequis en italien n'est necessaire : vous beneficierez d'un accompagnement linguistique integre tout au long de votre parcours. De nombreux etudiants francophones y reussissent brillamment chaque annee.\n\n`;
  }

  // Prochaines etapes
  t += `📋 PROCHAINES ETAPES\n`;
  t += `1. Prenez connaissance de cette recommandation\n`;
  t += `2. Si vous souhaitez en discuter, demandez un rappel telephonique avec un conseiller EDUMOVE\n`;
  t += `3. Notre equipe vous accompagnera dans la preparation de votre dossier d'inscription\n\n`;
  t += `N'hesitez pas a nous contacter pour toute question.\n\n`;
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

  if (c.callbackRequested) {
    const cbDate = c.callbackRequestedAt ? toDate(c.callbackRequestedAt) : null;
    html += `<div style="padding:10px 12px;background:#fff3e0;border-radius:6px;border-left:3px solid #e65100;">`;
    html += `<strong style="color:#e65100;">📞 Rappel telephonique demande</strong>`;
    if (cbDate) {
      html += `<br><span style="font-size:12px;color:var(--text-muted);">Le ${cbDate.toLocaleDateString('fr-FR')} a ${cbDate.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</span>`;
    }
    html += '</div>';
  }

  return html;
}
