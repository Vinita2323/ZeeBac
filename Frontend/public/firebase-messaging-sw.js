// Firebase Cloud Messaging Service Worker
// This file MUST be in the public/ folder (root of the web app)
// It handles background push notifications when the app is closed/in background

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSy" + "C0tumV6UfQx5tfGPIZ1lOL6ej61wsQios",
  authDomain: "zeebac-f13c8.firebaseapp.com",
  projectId: "zeebac-f13c8",
  storageBucket: "zeebac-f13c8.firebasestorage.app",
  messagingSenderId: "796440324577",
  appId: "1:796440324577:web:94fb0f76b3dc85a537caa0",
  measurementId: "G-W7NZ2J00WY"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload);

  const { title, body } = payload.notification;

  self.registration.showNotification(title, {
    body,
    icon: '/logo.png',
    badge: '/badge.png',
    data: payload.data,
    vibrate: [200, 100, 200],
  });
});
