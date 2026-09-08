import { getToken, onMessage } from 'firebase/messaging';
import { messaging } from '../config/firebase.js';
import { apiClient, AdminAPI } from '../services/api.js';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Request notification permission and save FCM token to backend
 * @param {string} role - 'customer' | 'vendor' | 'admin'
 */
export const requestNotificationPermission = async (role = 'customer') => {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.log('This browser does not support web notifications');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission was not granted:', permission);
      return null;
    }

    if (!messaging) {
      console.log('Firebase Messaging is not initialized');
      return null;
    }

    const tokenOptions = VAPID_KEY ? { vapidKey: VAPID_KEY } : undefined;
    const token = await getToken(messaging, tokenOptions);
    if (!token) {
      console.log('No FCM token obtained from Firebase');
      return null;
    }

    console.log('🔑 FCM Token obtained successfully:', token);

    // Save token to backend API (mobile save endpoint + role endpoint)
    try {
      await apiClient.post('/v1/fcm-tokens/mobile/save', { token, role, deviceType: 'mobile' });
      if (role === 'admin') {
        await AdminAPI.saveAdminFcmToken(token);
      } else if (role === 'vendor') {
        await apiClient.post('/vendor/fcm-token', { token });
      } else {
        await apiClient.post('/user/fcm-token', { token });
      }
      console.log(`FCM token successfully registered at /v1/fcm-tokens/mobile/save for role: ${role}`);
    } catch (saveErr) {
      console.warn(`Could not save FCM token to backend for role ${role}:`, saveErr?.response?.data?.message || saveErr.message);
    }

    return token;
  } catch (error) {
    console.error('Error requesting FCM notification permission:', error);
    return null;
  }
};

/**
 * Listen for foreground push notifications (when app is open)
 */
export const onForegroundMessage = (callback) => {
  if (!messaging) return () => {};
  try {
    return onMessage(messaging, (payload) => {
      console.log('🔔 Foreground FCM notification received:', payload);
      if (callback) callback(payload);
    });
  } catch (err) {
    console.warn('Error listening to foreground FCM notifications:', err);
    return () => {};
  }
};

