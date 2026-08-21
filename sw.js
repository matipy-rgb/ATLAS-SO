const CACHE_NAME = "atlas-so-shell-2026-08-20-4";
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
    "./about.html",
    "./offline.html",
    "./offline.js",
    "./privacy.html",
    "./landing.css",
    "./styles.css",
    "./dashboard.css",
    "./module.css",
    "./finance.css",
    "./study.css",
    "./projects.css",
    "./personal.css",
    "./experience-v011.css",
    "./auth.css",
    "./rrhh.css",
    "./atlas-config.js",
    "./auth-core.js",
    "./auth-page.js",
    "./app-bootstrap.js",
    "./atlas.js",
    "./dashboard.js",
    "./finance.js",
    "./finance-core.js",
    "./finance-domain.js",
    "./finance-storage.js",
    "./finance-repository.js",
    "./finance-migration.js",
    "./study.js",
    "./work.js",
    "./rrhh.js",
    "./rrhh-super.js",
    "./rrhh-context.js",
    "./rrhh-v09-core.js",
    "./rrhh-operation.js",
    "./rrhh-bulk-import.js",
    "./rrhh-import.js",
    "./rrhh-calc.js",
    "./rrhh-storage.js",
    "./rrhh-contracts.js",
    "./rrhh-ips.js",
    "./health.js",
    "./projects.js",
    "./personal.js",
    "./about.js",
    "./vendor/supabase.js",
    "./manifest.webmanifest",
    "./icons/atlas-logo.svg",
    "./icons/atlas-192.png",
    "./icons/atlas-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key.startsWith("atlas-so-") && key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

const SENSITIVE_QUERY_KEYS = new Set([
    "access_token", "refresh_token", "token", "token_hash", "code", "error", "error_description"
]);

function containsSensitiveQuery(url) {
    return Array.from(url.searchParams.keys()).some(key => SENSITIVE_QUERY_KEYS.has(key.toLowerCase()));
}

function cleanCacheKey(request) {
    const url = new URL(request.url);
    url.search = "";
    url.hash = "";
    return url.href;
}

async function updateCache(request, response, requestUrl) {
    if (!response.ok || containsSensitiveQuery(requestUrl)) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cleanCacheKey(request), response.clone());
}

function cachedResponse(request) {
    return caches.match(cleanCacheKey(request));
}

self.addEventListener("fetch", event => {
    const requestUrl = new URL(event.request.url);
    if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

    // Solo la configuración y el acceso consultan primero la red. Las
    // pantallas y módulos abren desde la copia instalada y se actualizan en
    // segundo plano, evitando esperas innecesarias.
    const networkFirstFiles = [
        "/atlas-config.js",
        "/auth-core.js",
        "/auth-page.js",
        "/login.html",
        "/index.html",
        "/reset-password.html"
    ];
    if (networkFirstFiles.some(file => requestUrl.pathname.endsWith(file))) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    updateCache(event.request, response, requestUrl).catch(() => {});
                    return response;
                })
                .catch(() => cachedResponse(event.request))
        );
        return;
    }

    if (event.request.mode === "navigate") {
        event.respondWith(
            cachedResponse(event.request).then(cached => {
                const network = fetch(event.request).then(response => {
                    updateCache(event.request, response, requestUrl).catch(() => {});
                    return response;
                }).catch(() => cached || caches.match("./offline.html"));
                return cached || network;
            })
        );
        return;
    }

    event.respondWith(
        cachedResponse(event.request).then(cached => {
            const network = fetch(event.request).then(response => {
                updateCache(event.request, response, requestUrl).catch(() => {});
                return response;
            }).catch(() => cached);
            return cached || network;
        })
    );
});
