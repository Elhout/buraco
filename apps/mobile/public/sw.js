// Service worker for the web build (iPhone home-screen app): push notifications, and an app-shell
// cache so the app still opens with no signal at the table. Supabase calls are never cached.

const CACHE = 'buraco-shell-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/apple-touch-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Pages: network first so updates arrive; the cached shell when offline (every route is the SPA).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Bundles and assets have content hashes in their names: cache first, then keep them.
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})

// Payload from push-dispatch: { title, body, url }. iOS requires every push to show a notification.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/'
  event.waitUntil(
    self.registration.showNotification(data.title || 'Buraco', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: url,
      data: { url },
    }),
  )
})

// Tapping a notification opens its screen: in the running app if there is one, else a new window.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          client.postMessage({ type: 'navigate', url })
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
