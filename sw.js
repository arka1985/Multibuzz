/**
 * Multibuzz Service Worker (PWA Mobile Installation & Offline Caching)
 */
const CACHE_NAME = 'multibuzz-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './host.html',
    './play.html',
    './css/styles.css',
    './js/theme.js',
    './js/audio.js',
    './js/time-sync.js',
    './js/network.js',
    './js/host.js',
    './js/player.js',
    './js/pwa.js',
    './js/vendor/mqtt.min.js',
    './js/vendor/qrcode.min.js',
    './assets/icon-192.png',
    './assets/icon-512.png',
    './assets/icon.svg',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                console.warn('[SW] Cache prefetch non-fatal warning:', err);
            });
        })
    );
    self.skipWaiting();
});

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

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    // Ignore WebSocket and non-http schemes
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Fetch in background to update cache
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                return networkResponse;
            }).catch(() => {
                return caches.match('./index.html');
            });
        })
    );
});
