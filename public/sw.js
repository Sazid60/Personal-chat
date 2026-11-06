// NEXUS Quantum Comms PWA Service Worker
const CACHE_NAME = 'nexus-comms-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/webrtc.js',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/sounds/call-audio.wav',
  '/sounds/call-video.wav',
  '/sounds/message.wav'
];

let unreadCount = 0;

// Install & Cache Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate & Clean Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch with Network First Strategy
self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  // Ignore socket.io and API requests
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// Background Push Notification (Fires even when app is closed!)
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_) {
      data = { title: 'NEXUS // OS', body: event.data.text() };
    }
  }

  // Handle call cancellation from remote caller
  if (data.type === 'call_cancelled') {
    event.waitUntil(
      self.registration.getNotifications({ tag: 'nexus-call' }).then((notifications) => {
        notifications.forEach((n) => n.close());
      })
    );
    return;
  }

  const title = data.title || 'NEXUS';
  const isCall = data.type === 'call';

  unreadCount++;
  // App Badge Count on app icon
  if ('setAppBadge' in self.navigator) {
    self.navigator.setAppBadge(unreadCount).catch(() => {});
  }

  const options = {
    body: data.body || (isCall ? 'Incoming neural uplink...' : 'New encrypted packet received'),
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: isCall ? 'nexus-call' : `nexus-msg-${Date.now()}`,
    renotify: true,
    requireInteraction: isCall,
    vibrate: isCall ? [500, 200, 500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
    data: data.data || {},
    actions: isCall ? [
      { action: 'accept', title: 'Accept' },
      { action: 'decline', title: 'Decline' }
    ] : []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Clear badge count
  unreadCount = 0;
  if ('clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {});
  }

  const notificationData = event.notification.data || {};
  const action = event.action || 'open';

  // If user tapped decline directly from notification action button without opening app
  if (action === 'decline' && notificationData.callerId && notificationData.targetUserId) {
    event.waitUntil(
      fetch('/api/calls/decline-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callerId: notificationData.callerId,
          targetUserId: notificationData.targetUserId
        })
      }).catch(() => {})
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/') && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_ACTION',
            action,
            data: notificationData
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        let targetUrl = '/';
        if (notificationData.callerId) {
          targetUrl = `/?call_action=${action}&caller_id=${notificationData.callerId}&caller_name=${encodeURIComponent(notificationData.callerName || '')}&call_type=${notificationData.callType || 'audio'}`;
        }
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Clear Badge message from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_BADGE') {
    unreadCount = 0;
    if ('clearAppBadge' in self.navigator) {
      self.navigator.clearAppBadge().catch(() => {});
    }
  }
});

