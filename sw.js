const CACHE = 'forge-fuel-shell-v2b9';
const SHELL = ['./', './index.html', './styles.css', './app.js', './core.js', './programs.js', './catalog.js', './movement-data.js', './training.js', './storage.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './barlow-condensed-500.woff2', './barlow-condensed-600.woff2', './barlow-condensed-700.woff2'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('forge-fuel-shell-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message', event => { if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  if (!SHELL.some(path => new URL(path, self.registration.scope).pathname === url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(event.request, { ignoreSearch: true })) || fetch(event.request);
  })());
});
