import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = await readdir(ROOT);
let failed = false;

for (const file of files.filter(name => name.endsWith(".js"))) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    try {
        new vm.Script(source, { filename: file });
    } catch (error) {
        failed = true;
        console.error(`${file}: ${error.message}`);
    }
}

const required = ["index.html", "app.html", "login.html", "privacy.html", "rrhh.html", "manifest.webmanifest", "atlas-config.js"];
for (const file of required) {
    if (!files.includes(file)) {
        failed = true;
        console.error(`Falta ${file}`);
    }
}

for (const file of files.filter(name => name.endsWith(".html"))) {
    const html = await readFile(path.join(ROOT, file), "utf8");
    const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), match => match[1]);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length) {
        failed = true;
        console.error(`${file}: id duplicado: ${[...new Set(duplicateIds)].join(", ")}`);
    }
    if (!html.includes('name="viewport"')) {
        failed = true;
        console.error(`${file}: falta la configuración de vista móvil.`);
    }
    if (/\son[a-z]+=/i.test(html)) {
        failed = true;
        console.error(`${file}: contiene eventos HTML en línea.`);
    }
    const unsafeBlankLinks = Array.from(html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi), match => match[0])
        .filter(tag => !/\brel="[^"]*\bnoopener\b/i.test(tag));
    if (unsafeBlankLinks.length) {
        failed = true;
        console.error(`${file}: hay enlaces externos sin rel="noopener".`);
    }
    const unnamedIconButtons = Array.from(html.matchAll(/<button\b[^>]*class="[^"]*\bicon-button\b[^"]*"[^>]*>×<\/button>/gi), match => match[0])
        .filter(tag => !/\baria-label="[^"]+"/i.test(tag));
    if (unnamedIconButtons.length) {
        failed = true;
        console.error(`${file}: hay botones de cierre sin nombre accesible.`);
    }
    const references = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g), match => match[1])
        .filter(value => !/^(?:https?:|mailto:|#|data:)/i.test(value));
    for (const reference of references) {
        const clean = reference.split(/[?#]/)[0];
        try {
            await access(path.join(ROOT, clean));
        } catch {
            failed = true;
            console.error(`${file}: no existe ${clean}`);
        }
    }
}

const worker = await readFile(path.join(ROOT, "sw.js"), "utf8");
const cachedReferences = Array.from(worker.matchAll(/"\.\/([^"]+)"/g), match => match[1]).filter(Boolean);
for (const reference of new Set(cachedReferences)) {
    try {
        await access(path.join(ROOT, reference));
    } catch {
        failed = true;
        console.error(`sw.js: no existe el recurso en caché ${reference}`);
    }
}

try {
    JSON.parse(await readFile(path.join(ROOT, "manifest.webmanifest"), "utf8"));
    JSON.parse(await readFile(path.join(ROOT, "capacitor.config.json"), "utf8"));
} catch (error) {
    failed = true;
    console.error(`JSON inválido: ${error.message}`);
}

if (failed) process.exit(1);
console.log("ATLAS SO: estructura y sintaxis verificadas.");
