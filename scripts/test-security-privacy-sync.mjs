import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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

assert.equal(JSON.parse(packageSource).version, "0.9.0");
assert.match(config, /sb_publishable_/);
assert.doesNotMatch(config, /service_role\s*[:=]\s*["']/i);

assert.match(auth, /\^sb_publishable_/);
assert.match(auth, /flowType:\s*"pkce"/);
assert.match(auth, /hrAdmin\s*=\s*false/);
assert.doesNotMatch(auth, /hrAdmin\s*=\s*localStorage\.getItem/);

assert.match(bootstrap, /purgeUnauthorizedHRData/);
assert.match(bootstrap, /migrateLegacyDataOnFirstLogin\s*===\s*"confirm"/);
assert.match(bootstrap, /for \(const \[key, version\] of batch\)/);
assert.match(bootstrap, /addEventListener\("storage"/);
assert.doesNotMatch(bootstrap, /\.upsert\(rows,/);

assert.match(dashboard, /atlas-so-encrypted-backup/);
assert.match(dashboard, /AES-GCM/);
assert.match(dashboard, /PBKDF2/);
assert.match(dashboard, /validateBackupPayload\(parsed\)/);
assert.match(dashboard, /restore_hr_attendance_backup/);
assert.ok(
    dashboard.indexOf("const validated = validateBackupPayload(parsed)") < dashboard.indexOf("await restoreAttendanceRecords(validated.attendance)"),
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
assert.match(migration, /security invoker/i);
assert.doesNotMatch(baseSchema, /create trigger on_auth_user_created_atlas_hr_admin/i);

assert.match(privacy, /copias nuevas se cifran/i);
assert.match(privacy, /depósito privado de Supabase/i);

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

console.log("ATLAS SO v0.9.0: privacidad, permisos, sincronización, copias cifradas y caché segura verificados.");
