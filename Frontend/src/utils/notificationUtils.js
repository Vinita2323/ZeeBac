import { getToken, onMessage } from 'firebase/messaging';
import { messaging } from '../config/firebase.js';
import { apiClient, AdminAPI } from '../services/api.js';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

const waitForActiveWorker = (registration, timeoutMs = 10000) =>
  new Promise((resolve) => {
    if (!registration || registration.active) return resolve();
    const worker = registration.installing || registration.waiting;
    if (!worker) return resolve();
    const timer = setTimeout(resolve, timeoutMs);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        clearTimeout(timer);
        resolve();
      }
    });
  });

/**
 * Request notification permission and save FCM token to backend
 * @param {string} role - 'customer' | 'vendor' | 'admin' | 'delivery'
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

    let registration = null;
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('Firebase Service Worker registered successfully:', registration.scope);
        // getToken() fails with "no active Service Worker" if called before the worker activates
        // (always the case the very first time someone allows notifications).
        await waitForActiveWorker(registration);
      } catch (swErr) {
        console.warn('Service worker registration fallback:', swErr);
      }
    }

    const tokenOptions = {
      ...(VAPID_KEY ? { vapidKey: VAPID_KEY } : {}),
      ...(registration ? { serviceWorkerRegistration: registration } : {}),
    };
    const token = await getToken(messaging, tokenOptions);
    if (!token) {
      console.log('No FCM token obtained from Firebase');
      return null;
    }

    console.log('🔑 FCM Token obtained successfully:', token);

    // Delivery partners: authenticated rider endpoint only (token saved on the rider account)
    if (role === 'delivery') {
      try {
        await apiClient.post('/delivery/fcm-token', { token });
        localStorage.setItem('zeebac_delivery_fcm_token', token);
      } catch (saveErr) {
        console.warn('Could not save rider push token:', saveErr?.response?.data?.message || saveErr.message);
        return null;
      }
      return token;
    }

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

