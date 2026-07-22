import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "www");
const allowedExtensions = new Set([".html", ".css", ".js", ".webmanifest"]);

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });

for (const entry of await readdir(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && allowedExtensions.has(path.extname(entry.name))) {
        await cp(path.join(ROOT, entry.name), path.join(OUTPUT, entry.name));
    }
}

for (const directory of ["icons", "vendor"]) {
    await cp(path.join(ROOT, directory), path.join(OUTPUT, directory), { recursive: true });
}

console.log("ATLAS SO preparado en www/ para Android.");
