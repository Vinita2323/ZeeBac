import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAAScPjwJ9iRxixhTpr63fmgi1seA2zKMI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "zeebac-e96fb.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "zeebac-e96fb",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "zeebac-e96fb.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "230717734580",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:230717734580:web:81f74fd072555464a461e1",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-KHXPMT5Y25"
};

let app = null;
let analytics = null;
let messaging = null;

try {
  app = initializeApp(firebaseConfig);
  if (typeof window !== 'undefined') {
    try {
      analytics = getAnalytics(app);
    } catch (e) {
      // Analytics may fail if blocked by ad-blocker or in offline dev mode
    }
    try {
      messaging = getMessaging(app);
    } catch (e) {
      console.warn("Firebase messaging initialization skipped:", e.message);
    }
  }
} catch (err) {
  console.warn("Firebase initialization warning:", err);
}

export { app, analytics, messaging };
