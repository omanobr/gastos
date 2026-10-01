/* Guarda só os arquivos do app para abrir rápido e sem internet. Dados e login sempre vão direto ao Google. */
const CACHE = 'gastos-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'store.js', 'app.js', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Arquivos do app sempre conferidos no servidor (cache: no-cache), para nunca misturar versão nova com antiga.
  const net = e.request.mode === 'navigate' ? fetch(e.request) : fetch(new Request(e.request, { cache: 'no-cache' }));
  e.respondWith(net.then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
});
