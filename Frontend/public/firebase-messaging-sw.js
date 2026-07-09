// Firebase Cloud Messaging Service Worker
// This file MUST be in the public/ folder (root of the web app)
// It handles background push notifications when the app is closed/in background

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyATLMvdQ1u1uw9jIlT2URhT62mWgLKC6Yk",
  authDomain: "zeebac.firebaseapp.com",
  projectId: "zeebac",
  storageBucket: "zeebac.firebasestorage.app",
  messagingSenderId: "268413542283",
  appId: "1:268413542283:web:920b3b5e458e0137e6d98e",
  measurementId: "G-8Z3V0D2LYW"
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
