const CACHE_NAME = "atlas-so-v0.6.0";
const APP_SHELL = [
    "./",
    "./app.html",
    "./login.html",
    "./reset-password.html",
    "./index.html",
    "./finance.html",
    "./study.html",
    "./work.html",
    "./rrhh.html",
    "./health.html",
    "./projects.html",
    "./personal.html",
    "./offline.html",
    "./privacy.html",
    "./landing.css",
    "./styles.css",
    "./dashboard.css",
    "./module.css",
    "./finance.css",
    "./study.css",
    "./projects.css",
    "./personal.css",
    "./auth.css",
    "./rrhh.css",
    "./atlas-config.js",
    "./auth-core.js",
    "./auth-page.js",
    "./app-bootstrap.js",
    "./atlas.js",
    "./dashboard.js",
    "./finance.js",
    "./study.js",
    "./work.js",
    "./rrhh.js",
    "./rrhh-super.js",
    "./rrhh-context.js",
    "./rrhh-import.js",
    "./vendor/xlsx.full.min.js",
    "./vendor/tesseract.min.js",
    "./vendor/tesseract-worker.min.js",
    "./vendor/tesseract-core/tesseract-core.wasm.js",
    "./vendor/tesseract-core/tesseract-core.wasm",
    "./vendor/tesseract-core/tesseract-core-simd.wasm.js",
    "./vendor/tesseract-core/tesseract-core-simd.wasm",
    "./vendor/tesseract-core/tesseract-core-lstm.wasm.js",
    "./vendor/tesseract-core/tesseract-core-lstm.wasm",
    "./vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js",
    "./vendor/tesseract-core/tesseract-core-simd-lstm.wasm",
    "./vendor/tessdata/spa.traineddata.gz",
    "./health.js",
    "./projects.js",
    "./personal.js",
    "./vendor/supabase.js",
    "./manifest.webmanifest",
    "./icons/atlas-192.png",
    "./icons/atlas-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key.startsWith("atlas-so-") && key !== CACHE_NAME).map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    const requestUrl = new URL(event.request.url);
    if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

    // La configuración y el acceso consultan primero la versión instalada más
    // reciente. Si no hay conexión, conservan la última copia válida.
    const networkFirstFiles = [
        "/atlas-config.js",
        "/auth-core.js",
        "/auth-page.js",
        "/login.html",
        "/index.html",
        "/app.html",
        "/landing.css",
        "/dashboard.css",
        "/dashboard.js",
        "/atlas.js",
        "/app-bootstrap.js",
        "/reset-password.html",
        "/rrhh.html",
        "/rrhh.js",
        "/rrhh-super.js",
        "/rrhh-context.js",
        "/rrhh-import.js",
        "/rrhh.css"
    ];
    if (networkFirstFiles.some(file => requestUrl.pathname.endsWith(file))) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    return response;
                })
                .catch(async () => (await caches.match(event.request)) || caches.match("./offline.html"))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            const network = fetch(event.request).then(response => {
                if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                return response;
            }).catch(() => cached);
            return cached || network;
        })
    );
});
