const VERSION = 'kotobi-v5-2026-02-04';
const ASSET_CACHE = `${VERSION}-assets`;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  // تفعيل النسخة الجديدة فورًا لتجنب بقاء كاش قديم
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

// Push Notifications Handler
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');
  
  let data = {
    title: 'إشعار من كتبي',
    body: 'لديك إشعار جديد',
    icon: '/lovable-uploads/5882b036-f2e2-4fec-bc07-9ee97960056a.png',
    badge: '/favicon.png',
    tag: 'kotobi-notification',
    data: { url: '/' }
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        tag: payload.tag || `kotobi-${Date.now()}`,
        data: payload.data || data.data
      };
    }
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    vibrate: [100, 50, 100],
    requireInteraction: true,
    dir: 'rtl',
    lang: 'ar'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (urlToOpen !== '/') {
            client.navigate(urlToOpen);
          }
          return;
        }
      }
      // Open new window if none exists
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // لا نتدخل إلا في GET
  if (req.method !== 'GET') return;

  const accept = req.headers.get('accept') || '';
  const isHtml = req.mode === 'navigate' || accept.includes('text/html');

  // ✅ صفحات التطبيق: Network-first حتى لا يثبت HTML القديم
  if (isHtml) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(ASSET_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await caches.match(req);
          return cached || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // ✅ لا نقوم بتخزين ملفات الكتب/الصور المُمرّرة (قد تكون كبيرة جداً) حتى لا يكبر حجم بيانات الموقع
  if (sameOrigin && (url.pathname.startsWith('/f/') || url.pathname.startsWith('/i/'))) {
    event.respondWith(fetch(req));
    return;
  }

  // ✅ ملفات ثابتة: Cache-first مع تحديث بالخلفية
  if (sameOrigin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) {
          event.waitUntil(
            (async () => {
              try {
                const fresh = await fetch(req);
                if (fresh && fresh.ok) {
                  const cache = await caches.open(ASSET_CACHE);
                  cache.put(req, fresh.clone());
                }
              } catch (_) {
                // تجاهل
              }
            })()
          );
          return cached;
        }

        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      })()
    );
    return;
  }

  // ✅ طلبات خارجية: لا كاش
  event.respondWith(fetch(req));
});
