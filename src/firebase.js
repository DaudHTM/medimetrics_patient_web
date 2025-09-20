// Firebase configuration and initialization (modular SDK v9+)
// Reads credentials from environment variables with the REACT_APP_ prefix.

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID, // optional
};

// Helpful runtime warning if env vars are not set (development only)
if (typeof process !== 'undefined' && !firebaseConfig.apiKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Firebase configuration appears to be missing. Set REACT_APP_FIREBASE_* variables in .env.local.'
  );
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Exports for common Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
