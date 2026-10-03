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

// Handle background messages when app is closed / in background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload);

  const title = payload.notification?.title || payload.data?.title || '🔔 Zeebac';
  const body = payload.notification?.body || payload.data?.body || payload.data?.message || 'You have a new update';

  const notificationOptions = {
    body,
    icon: '/Logo (6).png',
    badge: '/Logo (6).png',
    data: payload.data || {},
    vibrate: [200, 100, 200, 100, 200],
    tag: payload.data?.tag || `zeebac-${Date.now()}`,
    renotify: true,
  };

  self.registration.showNotification(title, notificationOptions);
});

// Handle tap on system notification in mobile notification shade / lock screen
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let targetUrl = '/';
  if (data.isChat === 'true' || data.conversationId) {
    targetUrl = data.role === 'vendor' ? '/vendor/chat' : '/chat';
  } else if (data.referenceType === 'transaction' || data.type === 'credit') {
    targetUrl = data.role === 'vendor' ? '/vendor/wallet' : '/wallet';
  } else {
    targetUrl = data.role === 'vendor' ? '/vendor/notifications' : '/notifications';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
