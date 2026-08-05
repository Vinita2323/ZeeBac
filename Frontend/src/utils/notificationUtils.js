// import { getToken, onMessage } from 'firebase/messaging';
// import { messaging } from '../config/firebase.js';
import { apiClient } from '../services/api.js';

// const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export const requestNotificationPermission = async (role = 'customer') => {
  console.log('Firebase is disabled, skipping notification permission');
  return null;
};

export const onForegroundMessage = (callback) => {
  console.log('Firebase is disabled, skipping foreground message listener');
  // return dummy unsubscribe function
  return () => {};
};
