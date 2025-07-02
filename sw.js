const CACHE_NAME = 'sandai-bus-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/time.json',
  '/day.json',
  '/bot_bus.webp',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
  console.log('Service Worker: インストール中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: ファイルをキャッシュ中...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: インストール完了');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: キャッシュエラー', error);
      })
  );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
  console.log('Service Worker: アクティベート中...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: 古いキャッシュを削除:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: アクティベート完了');
      return self.clients.claim();
    })
  );
});

// フェッチ時の処理（キャッシュファーストの戦略）
self.addEventListener('fetch', (event) => {
  // JSONファイルは常に最新を取得（ネットワークファースト）
  if (event.request.url.includes('.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // 成功した場合はキャッシュも更新
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // ネットワークエラーの場合はキャッシュから返す
          return caches.match(event.request);
        })
    );
  } else {
    // その他のリソースはキャッシュファースト
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // キャッシュにある場合はそれを返す
          if (response) {
            return response;
          }
          
          // キャッシュにない場合はネットワークから取得
          return fetch(event.request)
            .then((response) => {
              // 有効なレスポンスかチェック
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              
              // レスポンスをキャッシュに保存
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
              
              return response;
            })
            .catch(() => {
              // ネットワークエラーの場合、HTMLリクエストならオフラインページを表示
              if (event.request.destination === 'document') {
                return caches.match('/index.html');
              }
            });
        })
    );
  }
});

// プッシュ通知の処理（将来の拡張用）
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/bot_bus.webp',
      badge: '/bot_bus.webp',
      data: data.data
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// 通知クリック時の処理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/')
  );
});
