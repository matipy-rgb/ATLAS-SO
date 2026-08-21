import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenArtifacts = /(?:^|\/)(?:outputs?|resultados?|private|secrets?)(?:\/|$)|\.(?:xlsx?|xlsm|csv|pdf|docx?|zip|rar|7z)$/i;
const forbiddenSecrets = /(?:sb_secret_[A-Za-z0-9_-]+|SUPABASE_SERVICE_ROLE(?:_KEY)?\s*[:=]\s*["'][^"']+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/i;
const textExtensions = new Set([".js", ".mjs", ".html", ".css", ".json", ".md", ".txt", ".sql", ".yml", ".yaml", ".webmanifest"]);

async function walk(folder, prefix = "") {
    const files = [];
    for (const entry of await readdir(folder, { withFileTypes: true })) {
        if ([".git", "node_modules", "www"].includes(entry.name)) continue;
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) files.push(...await walk(path.join(folder, entry.name), relative));
        else files.push(relative);
    }
    return files;
}

let tracked = [];
let indexed = new Set();
let fromGit = false;
try {
    indexed = new Set(execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean));
    tracked = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
    fromGit = tracked.length > 0;
} catch {
    tracked = await walk(ROOT);
}

const artifacts = tracked.filter(file => forbiddenArtifacts.test(file) && file !== "vendor/xlsx-0.20.3.tgz");
assert.deepEqual(artifacts, [], `Hay artefactos empresariales preparados para Git: ${artifacts.join(", ")}`);

const leaks = [];
for (const file of tracked) {
    if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
    let source = "";
    try {
        source = fromGit && indexed.has(file) && file === "atlas-config.js"
            ? execFileSync("git", ["show", `:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 })
            : await readFile(path.join(ROOT, file), "utf8");
    } catch {
        continue;
    }
    if (forbiddenSecrets.test(source)) leaks.push(file);
}
assert.deepEqual(leaks, [], `Hay secretos o credenciales privadas preparadas para Git: ${leaks.join(", ")}`);

const trackedConfig = fromGit
    ? execFileSync("git", ["show", ":atlas-config.js"], { cwd: ROOT, encoding: "utf8" })
    : await readFile(path.join(ROOT, "atlas-config.js"), "utf8");
assert.match(trackedConfig, /supabaseUrl:\s*"(?:|https:\/\/[a-z0-9-]+\.supabase\.co)"/);
assert.match(trackedConfig, /supabasePublishableKey:\s*"(?:|sb_publishable_[A-Za-z0-9_-]+)"/);

console.log("ATLAS SO v0.10: secretos y artefactos empresariales preparados para Git = 0.");
