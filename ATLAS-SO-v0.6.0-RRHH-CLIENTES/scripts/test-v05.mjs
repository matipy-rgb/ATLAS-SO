import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(ROOT, file), "utf8");

const [
    index,
    app,
    atlas,
    bootstrap,
    authPage,
    styles,
    manifestSource,
    serviceWorker,
    packageSource
] = await Promise.all([
    read("index.html"),
    read("app.html"),
    read("atlas.js"),
    read("app-bootstrap.js"),
    read("auth-page.js"),
    read("styles.css"),
    read("manifest.webmanifest"),
    read("sw.js"),
    read("package.json")
]);

const manifest = JSON.parse(manifestSource);
const packageJson = JSON.parse(packageSource);
const checks = [
    [index.includes('href="landing.css"'), "La portada pública no carga landing.css."],
    [!index.includes("data-protected"), "La portada pública no debe exigir una sesión."],
    [app.includes('data-page="dashboard"') && app.includes("data-protected"), "app.html debe ser el panel protegido."],
    [atlas.includes("atlasCaptureDialog") && atlas.includes("atlasSearchDialog"), "Faltan las herramientas globales."],
    [atlas.includes('writeJSON("atlasTransactions"') && atlas.includes('writeJSON("atlasStudyEvents"'), "El registro rápido no cubre dinero y estudios."],
    [bootstrap.includes('"atlasPreferences"') && bootstrap.includes('"atlasDailyFocus"'), "Las preferencias nuevas no se sincronizan."],
    [authPage.includes('|| "app.html"'), "El acceso no redirige al nuevo inicio."],
    [styles.includes("[hidden]"), "Los formularios ocultos necesitan una regla explícita."],
    [manifest.start_url === "./app.html", "La PWA no inicia en app.html."],
    [serviceWorker.includes('CACHE_NAME = "atlas-so-v0.6.0"'), "La caché no corresponde a v0.6.0."],
    [packageJson.version === "0.6.0", "package.json no corresponde a v0.6.0."]
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length) {
    failures.forEach(message => console.error(message));
    process.exit(1);
}

console.log("ATLAS SO v0.6: portada, inicio diario y herramientas globales verificadas.");
