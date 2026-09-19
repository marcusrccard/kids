// Service worker — Missão Família
// Cacheia o "app shell" pra abrir mais rápido e funcionar minimamente offline.
// Os dados (tarefas, pontos, etc.) sempre vêm do Supabase — precisa de internet pra sincronizar.
// Também trata notificações (push + locais).

const CACHE_NAME = 'missao-familia-v1';
const APP_SHELL = [
  './',
  './index.html',
  './missao-familia.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {
        // Alguns arquivos podem não existir em todos os deploys — não falha a instalação
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cacheia chamadas ao Supabase — sempre busca dados frescos da rede.
  if (url.hostname.includes('supabase.co')) return;

  // Apenas GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ---------- Notificações ----------

// Push remoto (quando houver servidor de push no futuro)
self.addEventListener('push', (event) => {
  let data = {
    title: 'Missão Família',
    body: 'Nova atualização na família',
    icon: './icon-192.png',
    tag: 'mf-push'
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || '',
      icon: data.icon || './icon-192.png',
      badge: './icon-192.png',
      vibrate: [120, 80, 120],
      data: data.url || './',
      tag: data.tag || 'mf-push',
      renotify: true
    })
  );
});

// Clique na notificação → foca ou abre o app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (client.navigate) {
            try { client.navigate(targetUrl); } catch (e) {}
          }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// Notificação local pedida pela página (postMessage)
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_NOTIFICATION') return;
  const { title, body, tag } = event.data;
  event.waitUntil(
    self.registration.showNotification(title || 'Missão Família', {
      body: body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [100, 50, 100],
      tag: tag || 'mf-local',
      renotify: true,
      data: './'
    })
  );
});
