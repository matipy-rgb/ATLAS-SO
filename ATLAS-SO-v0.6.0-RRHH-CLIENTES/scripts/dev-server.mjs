import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function argument(name, fallback) {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const host = argument("--host", "0.0.0.0");
const port = Number(argument("--port", process.env.PORT || "4173"));
const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".wasm": "application/wasm",
    ".webmanifest": "application/manifest+json; charset=utf-8"
};

createServer(async (request, response) => {
    try {
        const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
        const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
        const resolved = path.resolve(ROOT, `.${pathname}`);

        if (!resolved.startsWith(`${ROOT}${path.sep}`)) {
            response.writeHead(403);
            response.end("Forbidden");
            return;
        }

        const info = await stat(resolved);
        const file = info.isDirectory() ? path.join(resolved, "index.html") : resolved;
        const content = await readFile(file);
        response.writeHead(200, {
            "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
            "Cache-Control": "no-store"
        });
        response.end(content);
    } catch {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
    }
}).listen(port, host, () => {
    console.log(`ATLAS SO disponible en http://${host}:${port}`);
});
