import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = await readdir(ROOT);
let failed = false;

for (const file of files.filter(name => name.endsWith(".js") && name !== "sw.js")) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    try {
        new vm.Script(source, { filename: file });
    } catch (error) {
        failed = true;
        console.error(`${file}: ${error.message}`);
    }
}

const required = ["index.html", "login.html", "rrhh.html", "manifest.webmanifest", "atlas-config.js"];
for (const file of required) {
    if (!files.includes(file)) {
        failed = true;
        console.error(`Falta ${file}`);
    }
}

for (const file of files.filter(name => name.endsWith(".html"))) {
    const html = await readFile(path.join(ROOT, file), "utf8");
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

try {
    JSON.parse(await readFile(path.join(ROOT, "manifest.webmanifest"), "utf8"));
    JSON.parse(await readFile(path.join(ROOT, "capacitor.config.json"), "utf8"));
} catch (error) {
    failed = true;
    console.error(`JSON inválido: ${error.message}`);
}

if (failed) process.exit(1);
console.log("ATLAS SO: estructura y sintaxis verificadas.");
