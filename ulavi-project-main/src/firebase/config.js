import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;
let db = null;
let auth = null;

export const initFirebase = () => {
  if (!app) {
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'your-api-key') {
      console.warn('Firebase not configured. Set VITE_FIREBASE_* env vars.');
      return null;
    }
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  }
  return { app, db, auth };
};

export const getFirestoreDb = () => {
  if (!db) {
    const fb = initFirebase();
    if (!fb) return null;
    db = fb.db;
  }
  return db;
};

export const getFirebaseAuth = () => {
  if (!auth) {
    const fb = initFirebase();
    if (!fb) return null;
    auth = fb.auth;
  }
  return auth;
};
