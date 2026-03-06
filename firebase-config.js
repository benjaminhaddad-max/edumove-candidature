// ══════════════════════════════════════════════════════════
// CONFIGURATION FIREBASE — EDUMOVE
// ══════════════════════════════════════════════════════════
//
// INSTRUCTIONS :
// 1. Va sur https://console.firebase.google.com
// 2. Crée un nouveau projet (ex: "edumove-candidature")
// 3. Active ces services :
//    - Authentication → Email/Password
//    - Firestore Database (mode production)
//    - Storage
// 4. Va dans Paramètres du projet → Général → Ajouter une appli Web
// 5. Copie les valeurs ci-dessous
// ══════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyB5H6tMzPqoJqm19bTpTfabjTq5wSP87VY",
  authDomain: "edumove-candidature.firebaseapp.com",
  projectId: "edumove-candidature",
  storageBucket: "edumove-candidature.firebasestorage.app",
  messagingSenderId: "12745076436",
  appId: "1:12745076436:web:f2604611bea513bf995541"
};

// Initialisation Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();
