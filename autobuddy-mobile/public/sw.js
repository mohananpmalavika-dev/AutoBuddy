self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'SHOW_NOTIFICATION') {
    return;
  }
  const title = data.title || 'AutoBuddy Alert';
  const body = data.body || 'You have a new update.';
  const options = {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    data: data.data || {},
    tag: String((data.data && data.data.notification_id) || Date.now()),
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'AutoBuddy Alert', body: event.data ? event.data.text() : 'You have a new update.' };
  }

  const title = payload.title || 'AutoBuddy Alert';
  const options = {
    body: payload.body || 'You have a new update.',
    icon: '/logo.png',
    badge: '/logo.png',
    data: payload.data || {},
    tag: String((payload.data && payload.data.notification_id) || Date.now()),
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/app') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return null;
    }),
  );
});
