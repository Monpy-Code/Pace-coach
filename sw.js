/* 페이스 코치 서비스 워커 — 네트워크 우선, 오프라인 시 캐시 사용 */
const CACHE = "pacecoach-v1.2.0";
const OCR_CACHE = "pacecoach-ocr-v1";
const CORE = [
  "./",
  "./index.html",
  "./styles.css?v=1.2.0-2",
  "./app.js?v=1.2.0-2",
  "./manifest.json",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/samsung-health-sample.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== OCR_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 무료 OCR 엔진(Tesseract.js · 학습데이터)은 한 번 받으면 오프라인에서도 쓰도록 캐시
  if (url.origin !== self.location.origin) {
    if (/tesseract|tessdata|jsdelivr\.net\/npm\/tesseract/i.test(url.href)) {
      e.respondWith(
        caches.open(OCR_CACHE).then((c) =>
          c.match(req).then((hit) => {
            if (hit) return hit;
            return fetch(req).then((res) => {
              if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()).catch(() => {});
              return res;
            });
          })
        )
      );
    }
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
