/* 서비스 워커: 한 번 열어 본 뒤에는 인터넷이 없어도 앱이 열리도록 파일을 저장해 둡니다. */
const VERSION = "v1";
const CACHE = "love-kiosk-margaret-" + VERSION;
const PRECACHE = [
  "./",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "audio/01_%EC%96%B4%EC%84%9C%EC%98%A4%EC%84%B8%EC%9A%94_%EC%82%AC%EB%9E%91%EC%9D%98_%EC%B9%B4%ED%8E%98%EC%97%90_%EC%98%A4%EC%8B%A0_%EA%B2%83%EC%9D%84_%ED%99%98%EC%98%81%ED%95%A9%EB%8B%88%EB%8B%A4.mp3",
  "audio/02_%EA%B3%BC%EC%9E%90_%ED%95%9C%EB%91%90_%EA%B0%80%EC%A7%80%EC%99%80_%EC%9D%8C%EB%A3%8C_%ED%95%9C_%EA%B0%80%EC%A7%80%EB%A5%BC_%EA%B3%A8%EB%9D%BC%EC%A3%BC%EC%84%B8%EC%9A%94.mp3",
  "audio/03_%EC%A3%BC%EB%AC%B8%ED%95%9C_%EA%B0%84%EC%8B%9D%EC%9D%B4_%EB%A7%9E%EB%8A%94_%EC%A7%80_%ED%99%95%EC%9D%B8%ED%95%B4%EC%A3%BC%EC%84%B8%EC%9A%94.mp3",
  "audio/04_%EC%96%B4%EB%96%BB%EA%B2%8C_%EA%B2%B0%EC%A0%9C%ED%95%A0%EA%B9%8C%EC%9A%94.mp3",
  "audio/05_%EC%A7%81%EC%9B%90%EC%97%90%EA%B2%8C_%ED%98%84%EA%B8%88%EC%9D%84_%EC%A0%84%EB%8B%AC%ED%95%B4%EC%A3%BC%EC%84%B8%EC%9A%94.mp3",
  "audio/06_%EC%B9%B4%EB%93%9C%EB%A5%BC_%EA%B2%B0%EC%A0%9C%EA%B8%B0%EC%97%90_%EC%BD%95_%ED%83%9C%EA%B7%B8%ED%95%B4%EC%A3%BC%EC%84%B8%EC%9A%94.mp3",
  "audio/07_%EB%A9%8B%EC%A7%80%EA%B2%8C_%EC%84%9C%EB%AA%85%ED%95%B4%EC%A3%BC%EC%84%B8%EC%9A%94.mp3",
  "audio/08_%EA%B2%B0%EC%A0%9C%EA%B0%80_%EC%99%84%EB%A3%8C%EB%90%98%EC%97%88%EC%8A%B5%EB%8B%88%EB%8B%A4_%EB%A7%9B%EC%9E%88%EA%B2%8C_%EB%93%9C%EC%84%B8%EC%9A%94.mp3",
  "images/sign/love-cafe-sign.png",
  "images/snacks/snack-01.png",
  "images/snacks/snack-02.png",
  "images/snacks/snack-03.png",
  "images/snacks/snack-04.png",
  "images/snacks/snack-05.png",
  "images/drinks/drink-01.png",
  "images/drinks/drink-02.png",
  "images/drinks/drink-03.png",
  "index.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 파일 하나가 실패해도 설치가 멈추지 않도록 하나씩 저장
    await Promise.all(PRECACHE.map((url) =>
      cache.add(new Request(url, { cache: "reload" })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith("love-kiosk-margaret-") && k !== CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 오디오는 '부분 요청(Range)'으로 오는 경우가 있어 저장본에서 잘라서 돌려줍니다.
async function rangeFromCache(request) {
  const cached = await caches.match(request.url, { ignoreVary: true });
  if (!cached) return null;
  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") || "");
  if (!m) return cached;
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = buf.byteLength - end; end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": "bytes " + start + "-" + end + "/" + buf.byteLength,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes"
    }
  });
}

// 네트워크 우선(최대 4초) → 안 되면 저장본. 사이트를 고치면 새 버전이 바로 반영됩니다.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))
    ]);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === "navigate") {
      const home = await cache.match(new URL("./", self.registration.scope).href, { ignoreSearch: true })
        || await cache.match(new URL("index.html", self.registration.scope).href, { ignoreSearch: true });
      if (home) return home;
    }
    throw e;
  }
}

// 저장본 우선: 이미지·음성처럼 잘 안 바뀌는 파일
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

// 글꼴 등 외부 파일: 저장본을 먼저 보여주고 뒤에서 갱신
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const update = fetch(request).then((res) => {
    if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
    return res;
  }).catch(() => hit);
  return hit || update;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.hostname)) {
      event.respondWith(staleWhileRevalidate(req));
    }
    return;
  }

  if (req.headers.has("range")) {
    event.respondWith((async () => (await rangeFromCache(req)) || fetch(req))());
    return;
  }

  const isCode = req.mode === "navigate" || /\.(html|css|js|json)$/i.test(url.pathname) || url.pathname.endsWith("/");
  event.respondWith(isCode ? networkFirst(req) : cacheFirst(req));
});
