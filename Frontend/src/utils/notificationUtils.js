import { getToken, onMessage } from 'firebase/messaging';
import { messaging } from '../config/firebase.js';
import { apiClient } from '../services/api.js';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Request notification permission and save FCM token to backend
 * Call this after user logs in
 * @param {string} role - 'customer' | 'vendor'
 */
export const requestNotificationPermission = async (role = 'customer') => {
  try {
    // 1. Check if browser supports notifications
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return;
    }

    // 2. Ask for permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return;
    }

    console.log('Firebase VAPID Key available:', !!VAPID_KEY, VAPID_KEY ? VAPID_KEY.substring(0, 10) + '...' : 'MISSING');
    console.log('Firebase API Key available:', !!import.meta.env.VITE_FIREBASE_API_KEY);

    // 3. Get FCM token
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) {
      console.log('No FCM token received');
      return;
    }

    // 4. Save token to backend
    const endpoint = role === 'vendor' ? '/vendor/fcm-token' : '/user/fcm-token';
    await apiClient.post(endpoint, { token });
    console.log('FCM token saved successfully');

    return token;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
  }
};

/**
 * Listen for foreground notifications (when app is open)
 * Call this once after app loads
 */
export const onForegroundMessage = (callback) => {
  return onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload);
    callback(payload);
  });
};
