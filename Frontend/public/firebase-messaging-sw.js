// Firebase Cloud Messaging Service Worker
// Handles background push notifications when the app is closed/in background

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAAScPjwJ9iRxixhTpr63fmgi1seA2zKMI",
  authDomain: "zeebac-e96fb.firebaseapp.com",
  projectId: "zeebac-e96fb",
  storageBucket: "zeebac-e96fb.firebasestorage.app",
  messagingSenderId: "230717734580",
  appId: "1:230717734580:web:81f74fd072555464a461e1",
  measurementId: "G-KHXPMT5Y25"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload);

  const { title, body } = payload.notification || {};

  if (title && body) {
    self.registration.showNotification(title, {
      body,
      icon: '/logo.png',
      badge: '/badge.png',
      data: payload.data,
      vibrate: [200, 100, 200],
    });
  }
});
