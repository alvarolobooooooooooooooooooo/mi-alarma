/*
  Mi Alarma · service worker
  Guarda la app en el teléfono para que abra al instante y aunque no haya
  internet. Los mensajes con la alarma (MQTT) nunca pasan por aquí.
  Al cambiar cualquier archivo de la app, sube el número de CACHE.
*/
const CACHE = 'mi-alarma-v4';

const ARCHIVOS = [
  './',
  'index.html',
  'estilos.css',
  'app.js',
  'manifest.webmanifest',
  'vendor/mqtt.min.js',
  'fuentes/outfit.woff2',
  'iconos/icon-192.png',
  'iconos/icon-512.png',
  'iconos/maskable-512.png',
  'iconos/apple-touch-icon.png',
  'iconos/favicon-32.png',
  'iconos/insignia-96.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;

  // La página: primero la red (para tener la última versión); sin internet, la guardada.
  if (pedido.mode === 'navigate') {
    e.respondWith(
      fetch(pedido).catch(() => caches.match('./').then((r) => r || caches.match('index.html')))
    );
    return;
  }

  // Lo demás: lo guardado al instante, y se actualiza por detrás.
  e.respondWith(
    caches.match(pedido).then((guardado) => {
      const deLaRed = fetch(pedido)
        .then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(pedido, copia));
          }
          return resp;
        })
        .catch(() => guardado);
      return guardado || deLaRed;
    })
  );
});

// Tocar el aviso abre la app (o la trae al frente si ya estaba abierta).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ('focus' in v) return v.focus();
      }
      return self.clients.openWindow('./#inicio');
    })
  );
});
