import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(ROOT, file), "utf8");

const [
    auth,
    bootstrap,
    dashboard,
    finance,
    worker,
    migration,
    baseSchema,
    privacy,
    config,
    packageSource
] = await Promise.all([
    read("auth-core.js"),
    read("app-bootstrap.js"),
    read("dashboard.js"),
    read("finance.js"),
    read("sw.js"),
    read("supabase/v0.8-security-privacy-sync.sql"),
    read("supabase/atlas-schema.sql"),
    read("privacy.html"),
    read("atlas-config.js"),
    read("package.json")
]);

assert.equal(JSON.parse(packageSource).version, "0.8.0");
assert.match(config, /supabaseUrl:\s*""/);
assert.match(config, /supabasePublishableKey:\s*""/);
assert.doesNotMatch(config, /https:\/\/[a-z0-9-]+\.supabase\.co/i);
assert.doesNotMatch(config, /service_role\s*[:=]\s*["']/i);

assert.match(auth, /\^sb_publishable_/);
assert.match(auth, /flowType:\s*"pkce"/);
assert.match(auth, /hrAdmin\s*=\s*false/);
assert.doesNotMatch(auth, /hrAdmin\s*=\s*localStorage\.getItem/);

assert.match(bootstrap, /purgeUnauthorizedHRData/);
assert.match(bootstrap, /migrateLegacyDataOnFirstLogin\s*===\s*"confirm"/);
assert.match(bootstrap, /for \(const \[key, version\] of batch\)/);
assert.match(bootstrap, /addEventListener\("storage"/);
assert.match(bootstrap, /upsert_app_data_if_newer/);
assert.match(bootstrap, /target_client_updated_at:\s*version/);
assert.match(bootstrap, /atlas:sync-conflict/);
assert.doesNotMatch(bootstrap, /\.from\("app_data"\)\s*\.upsert/);

assert.match(dashboard, /atlas-so-encrypted-backup/);
assert.match(dashboard, /AES-GCM/);
assert.match(dashboard, /PBKDF2/);
assert.match(dashboard, /validateBackupPayload\(parsed\)/);
assert.match(dashboard, /restore_hr_attendance_backup/);
assert.match(dashboard, /requestRestoreMode/);
assert.match(dashboard, /mergeBackupArrays/);
assert.match(dashboard, /mode === "replace"/);
assert.match(dashboard, /\.from\("atlas-files"\)\.download\(path\)/);
assert.match(dashboard, /Versión de copia incompatible/);
assert.ok(
    dashboard.indexOf("const validated = validateBackupPayload(parsed)") < dashboard.indexOf("await restoreAttendanceRecords(validated.attendance"),
    "La copia debe validarse antes de modificar marcaciones"
);

assert.match(finance, /syncPendingReceipts/);
assert.match(finance, /atlasReceiptDeletes/);
assert.match(finance, /cloudPending/);

assert.match(worker, /SENSITIVE_QUERY_KEYS/);
assert.match(worker, /cleanCacheKey/);
assert.doesNotMatch(worker, /cache\.put\(event\.request/);

assert.match(migration, /drop trigger if exists on_auth_user_created_atlas_hr_admin/i);
assert.match(migration, /lower\(coalesce\(target_key/i);
assert.match(migration, /storage_workspace_id/i);
assert.match(migration, /revoke create on schema public/i);
assert.match(migration, /restore_hr_attendance_backup/i);
assert.match(migration, /upsert_app_data_if_newer/i);
assert.match(migration, /upsert_hr_attendance_if_newer/i);
assert.match(migration, /delete_hr_attendance_records/i);
assert.match(migration, /hr_attendance_tombstones/i);
assert.match(migration, /client_updated_at/i);
assert.match(migration, /revoke all on public\.app_data from public, anon, authenticated/i);
assert.match(migration, /revoke all on public\.hr_attendance_records from public, anon, authenticated/i);
assert.doesNotMatch(baseSchema, /create trigger on_auth_user_created_atlas_hr_admin/i);

assert.match(privacy, /copias nuevas se cifran/i);
assert.match(privacy, /depósito privado/i);

const productionHtml = (await readdir(ROOT)).filter(file => file.endsWith(".html"));
for (const file of productionHtml) {
    const html = await read(file);
    assert.match(html, /Content-Security-Policy/, `${file} no tiene CSP`);
    assert.match(html, /name="referrer" content="no-referrer"/, `${file} no bloquea el Referer`);
}

const privacyFiles = [
    "index.html", "privacy.html", "README.md", "CONFIGURAR-ACTUALIZACION.md",
    "Plantilla_CSV_IPS_PERMISO.md", "NOVEDADES-v0.6.md"
];
const privacyText = (await Promise.all(privacyFiles.map(read))).join("\n");
assert.doesNotMatch(privacyText, /Mat[ií]as|ASUPOR|Gesti[oó]n y Cambio/i);
assert.doesNotMatch(privacyText, /;5469180;|;1989608;/);

await assert.rejects(access(path.join(ROOT, "outputs")), "El paquete no debe conservar resultados empresariales.");
await assert.rejects(access(path.join(ROOT, "AUDITORIA-ATLAS-SO-v0.7.1.md")), "El paquete no debe conservar auditorías anteriores.");

async function textFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        if (["node_modules", "vendor", ".git"].includes(entry.name)) continue;
        const resolved = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await textFiles(resolved));
        else if (/\.(?:js|mjs|html|css|json|md|sql|txt|webmanifest)$/i.test(entry.name)) files.push(resolved);
    }
    return files;
}

const forbiddenPrivateValues = [
    "mat" + "ías",
    "a " + "support",
    "gestión" + " y cambio",
    "bebidas" + " del paraguay",
    "dxqa" + "ftxgbfibkocthkvr",
    "0005-" + "82-01080"
];
const allText = (await Promise.all((await textFiles(ROOT)).map(file => readFile(file, "utf8")))).join("\n").toLowerCase();
for (const forbidden of forbiddenPrivateValues) assert.ok(!allText.includes(forbidden), `Quedó un valor privado: ${forbidden}`);
assert.doesNotMatch(allText, /sb_publishable_[a-z0-9_-]{12,}/i);
assert.doesNotMatch(allText, /service_role\s*[:=]\s*["'][^"']+/i);

console.log("ATLAS SO v0.8.0: privacidad, permisos, sincronización, copias cifradas y caché segura verificados.");
