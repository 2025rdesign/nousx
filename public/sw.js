// CACHE_VERSION é substituído automaticamente a cada build pelo plugin
// `sw-cache-version` em vite.config.ts. Mudança de bytes garante que o
// navegador detecte a nova versão e dispare o fluxo de update.
const CACHE_VERSION = 'build-1779601254791';

self.addEventListener('error', (event) => {
  console.error('[sw] error', event.message || event);
});
self.addEventListener('unhandledrejection', (event) => {
  console.error('[sw] unhandledrejection', event.reason);
});

self.addEventListener('install', () => {
  // Ativa imediatamente o novo SW sem esperar fechar todas as abas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
      // Notifica todas as abas abertas que existe nova versão.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
      }
    })(),
  );
});

// Network-first: sempre tenta versão mais recente, cache como fallback offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(req)),
  );
});