/* sw.js - caches the app shell only (HTML, CSS, JS, icons). API calls go to script.google.com (another origin)
   and are never intercepted or cached, so student data is never stored by the service worker.
   Change CACHE_NAME when you publish new files so old copies are replaced. */
var CACHE_NAME = 'cim-shell-v8';
var SHELL = [
  './', 'index.html', 'manifest.json', 'css/app.css',
  'js/config.js', 'js/ui.js', 'js/api.js', 'js/router.js', 'js/app.js', 'js/pages/dashboard.js', 'js/pages/students.js', 'js/pages/courses.js', 'js/pages/batches.js', 'js/pages/attendance.js', 'js/pages/fees.js', 'js/pages/exams.js', 'js/pages/progress.js', 'js/pages/schedule.js', 'js/pages/notices.js', 'js/pages/reports.js', 'js/pages/papers.js', 'js/pages/settings.js',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE_NAME).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch the API

  // Network first so updates show up; fall back to the cached copy when offline.
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
      });
    })
  );
});
