// ============================================
// Service Worker - キャッシュ戦略とオフライン対応
// Version: 1.1.2
// ============================================

// キャッシュバージョン管理
const CACHE_VERSION = '1.1.2';
const STATIC_CACHE = `sandai-bus-static-v${CACHE_VERSION}`;
const DATA_CACHE = `sandai-bus-data-v${CACHE_VERSION}`;

// キャッシュ対象のファイルリスト
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/bot_bus.webp',
  '/manifest.json'
];

const DATA_ASSETS = [
  '/time.json',
  '/day.json'
];

// ============================================
// ユーティリティ関数
// ============================================

/**
 * 静的アセットをキャッシュに追加
 * @param {string} cacheName - キャッシュ名
 * @param {Array} assets - アセットのパスリスト
 * @returns {Promise}
 */
const cacheAssets = (cacheName, assets) => {
  return caches.open(cacheName).then((cache) => {
    console.log(`Service Worker: ${cacheName} をキャッシュ中...`);
    return cache.addAll(assets);
  });
};

/**
 * 古いキャッシュを削除
 * @param {Array} currentCaches - 保持するキャッシュ名のリスト
 * @returns {Promise}
 */
const clearOldCaches = (currentCaches) => {
  return caches.keys().then((cacheNames) => {
    return Promise.all(
      cacheNames.map((cacheName) => {
        if (!currentCaches.includes(cacheName)) {
          console.log('Service Worker: 古いキャッシュを削除:', cacheName);
          return caches.delete(cacheName);
        }
      })
    );
  });
};

// ============================================
// イベントリスナー: インストール
// ============================================

// 注: skipWaiting()はここでは呼ばない。
// ページ側からのSKIP_WAITINGメッセージ受信時のみ適用する（意図しない更新適用を防ぐ）
self.addEventListener('install', (event) => {
  console.log('Service Worker: インストール中...', CACHE_VERSION);

  event.waitUntil(
    Promise.all([
      cacheAssets(STATIC_CACHE, STATIC_ASSETS),
      cacheAssets(DATA_CACHE, DATA_ASSETS)
    ])
    .then(() => {
      console.log('Service Worker: インストール完了');
    })
    .catch((error) => {
      console.error('Service Worker: キャッシュエラー', error);
    })
  );
});

// ============================================
// イベントリスナー: アクティベーション
// ============================================

self.addEventListener('activate', (event) => {
  console.log('Service Worker: アクティベート中...', CACHE_VERSION);
  
  const currentCaches = [STATIC_CACHE, DATA_CACHE];
  
  event.waitUntil(
    clearOldCaches(currentCaches)
      .then(() => {
        console.log('Service Worker: アクティベート完了');
        return self.clients.claim();
      })
  );
});

// ============================================
// キャッシュ戦略: Stale-While-Revalidate (JSON / CSS / JS)
// ============================================

/**
 * キャッシュから即座にレスポンスし、バックグラウンドで更新
 * @param {Request} request
 * @param {string} cacheName - 使用するキャッシュ名（DATA_CACHE または STATIC_CACHE）
 * @param {FetchEvent} event - バックグラウンド更新の完了まで生存させるイベント
 * @returns {Promise<Response>}
 */
const staleWhileRevalidate = (request, cacheName, event) => {
  const cachePromise = caches.open(cacheName);
  const cachedResponsePromise = cachePromise.then((cache) => cache.match(request));
  const fetchPromise = cachedResponsePromise.then(() => fetch(request));

  // waitUntilはイベント処理中に登録し、取得とキャッシュ保存の両方を待つ。
  // 保存の失敗は、有効なネットワークレスポンスを失敗させない。
  event.waitUntil(
    Promise.all([cachePromise, fetchPromise])
      .then(([cache, response]) => {
        if (response.ok) {
          return cache.put(request, response.clone());
        }
      })
      .catch((error) => {
        console.error('Service Worker: バックグラウンド更新エラー', error);
      })
  );

  // キャッシュがあれば即座に返し、なければフェッチを待つ
  return cachedResponsePromise.then((cachedResponse) => cachedResponse || fetchPromise);
};

// ============================================
// キャッシュ戦略: Cache-First (静的アセット)
// ============================================

/**
 * 静的ファイル用のキャッシュ戦略
 * キャッシュ優先、なければネットワークから取得
 * @param {Request} request
 * @returns {Promise<Response>}
 */
const cacheFirst = async (request) => {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const response = await fetch(request);
    
    if (response && response.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    // オフライン時、ナビゲーションリクエストはindex.htmlを返す
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) {
        return fallback;
      }
    }
    throw error;
  }
};

// ============================================
// キャッシュ戦略: Network-First (その他)
// ============================================

/**
 * その他のリソース用のキャッシュ戦略
 * ネットワーク優先、失敗時はキャッシュを使用
 * @param {Request} request
 * @returns {Promise<Response>}
 */
const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return caches.match(request);
  }
};

// ============================================
// キャッシュ戦略: Network-First (ナビゲーション)
// ============================================

/**
 * ナビゲーションリクエスト用のキャッシュ戦略
 * ネットワーク優先。失敗時はキャッシュ、それも無ければindex.htmlにフォールバック
 * @param {Request} request
 * @returns {Promise<Response>}
 */
const networkFirstNavigate = async (request) => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    const fallback = await caches.match('/index.html');
    if (fallback) {
      return fallback;
    }
    throw error;
  }
};

// ============================================
// ファイルタイプ判定ユーティリティ
// ============================================

/**
 * 静的アセットかどうかを判定
 * @param {string} pathname
 * @returns {boolean}
 */
const isStaticAsset = (pathname) => {
  const staticExtensions = ['.html', '.css', '.js', '.webp', '.json', '/'];
  return staticExtensions.some((ext) => 
    pathname.endsWith(ext) || pathname === '/'
  );
};

// ============================================
// イベントリスナー: フェッチ
// ============================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // リロード（Shift+F5など）の場合はネットワーク優先。
  // ただしオフライン時はキャッシュにフォールバックする（真っ白画面を防ぐ）
  if (request.cache === 'reload') {
    event.respondWith(
      fetch(request).catch(async (error) => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        if (request.mode === 'navigate') {
          const fallback = await caches.match('/index.html');
          if (fallback) {
            return fallback;
          }
        }
        throw error;
      })
    );
    return;
  }
  
  // ナビゲーションリクエスト: Network-First戦略
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(request));
  }
  // JSONファイル: Stale-While-Revalidate戦略（DATA_CACHE）
  else if (url.pathname.endsWith('.json')) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE, event));
  }
  // CSS/JSファイル: Stale-While-Revalidate戦略（STATIC_CACHE）
  else if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE, event));
  }
  // その他の静的ファイル: Cache-First戦略
  else if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
  // その他: Network-First戦略
  else {
    event.respondWith(networkFirst(request));
  }
});

// ============================================
// イベントリスナー: プッシュ通知（将来の拡張用）
// ============================================

self.addEventListener('push', (event) => {
  if (!event.data) return;
  
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
});

// ============================================
// イベントリスナー: 通知クリック
// ============================================

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});

// ============================================
// イベントリスナー: メッセージ
// ============================================

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('Service Worker: SKIP_WAITING メッセージを受信');
    self.skipWaiting();
  }
});
