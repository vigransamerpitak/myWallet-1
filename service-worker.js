// service-worker.js - แคชไฟล์ JavaScript ย่อยและองค์ประกอบ PWA ให้สามารถรันออฟไลน์ได้สมบูรณ์

const CACHE_NAME = 'wallet-app-v4'; 
const ASSETS = [
    '/',
    'index.html',
    'login.html',
    'config.js',
    'manifest.json',
    'icon.png',
    'css/style.css',
    'js/utils.js',
    'js/ui.js',
    'js/jars.js',
    'js/mascot.js',
    'js/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // ใช้ cache.addAll เพื่อแคชทรัพยากรทั้งหมด
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', e => {
  // เคลียร์แคชเวอร์ชันเก่าทิ้งอัตโนมัติ เพื่อป้องกันไฟล์ค้าง
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request);
    })
  );
});