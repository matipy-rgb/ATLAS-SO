import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";

const root = new URL("../", import.meta.url);
const [bootstrap, aboutHTML, aboutJS, atlasJS, financeHTML, rrhhHTML, rrhhContext, resetSQL, logo, serviceWorker, devServer] = await Promise.all([
    "app-bootstrap.js", "about.html", "about.js", "atlas.js", "finance.html",
    "rrhh.html", "rrhh-context.js", "supabase/reset-workspace-data.sql", "icons/atlas-logo.svg",
    "sw.js", "scripts/dev-server.mjs"
].map(path => readFile(new URL(path, root), "utf8")));

assert.match(aboutHTML, /Borrar todos mis datos/);
assert.match(aboutHTML, /BORRAR ATLAS/);
assert.match(aboutJS, /resetWorkspaceData/);
assert.match(aboutHTML, /reset-workspace-data\.sql/);
assert.match(aboutHTML, /Abrir Supabase/);
assert.doesNotMatch(bootstrap, /fallbackCloudReset/);
assert.match(bootstrap, /No se borró ningún dato/);
assert.match(atlasJS, /about\.html/);
assert.match(financeHTML, /data-quick-action="context">＋ Emprendimiento/);
assert.match(rrhhHTML, /id="hrIdentityDelete"/);
assert.match(rrhhContext, /removeClient/);
assert.match(resetSQL, /owner_id = auth\.uid\(\)/);
assert.match(resetSQL, /delete from public\.app_data where workspace_id = target_workspace/);
assert.match(resetSQL, /set parent_id = null/);
assert.match(resetSQL, /set previous_close_id = null/);
assert.match(logo, /Una brújula en forma de A/);
assert.doesNotMatch(serviceWorker.match(/const APP_SHELL = \[[\s\S]*?\];/)?.[0] || "", /tesseract|xlsx\.full/);
assert.match(serviceWorker, /cachedResponse\(event\.request\)\.then/);
assert.match(bootstrap, /3500/);
assert.match(devServer, /image\/svg\+xml/);

const virtualConsole = new VirtualConsole();
const jsdomErrors = [];
virtualConsole.on("jsdomError", error => jsdomErrors.push(error));
const dom = new JSDOM("<!doctype html><html><head></head><body data-page=\"about\" data-script=\"about.js\"></body></html>", {
    url: "https://atlas.test/about.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole
});
const { window } = dom;
window.localStorage.setItem("atlas:workspace-clean:atlasTransactions", JSON.stringify([{ id: "old-finance" }]));
window.localStorage.setItem("atlas:workspace-clean:atlasHealthRecords", JSON.stringify([{ id: "old-health" }]));
window.localStorage.setItem("atlas:pending:workspace-clean", JSON.stringify({ atlasHealthRecords: "1" }));
window.localStorage.setItem("unrelated-setting", "keep");

const rpcCalls = [];
const client = {
    from(table) {
        assert.equal(table, "app_data");
        return {
            select() { return this; },
            async eq() { return { data: [], error: null }; },
            async upsert() { return { error: null }; }
        };
    },
    async rpc(name, args) {
        rpcCalls.push({ name, args });
        return { data: { deleted_rows: 3 }, error: null };
    }
};
window.AtlasAuth = {
    client,
    user: { id: "user-clean" },
    isConfigured: () => true,
    getSession: async () => ({ user: { id: "user-clean" } }),
    getWorkspace: async () => ({ id: "workspace-clean", role: "owner", name: "Espacio limpio" }),
    isHRAdmin: async () => true
};
const append = window.document.head.appendChild.bind(window.document.head);
window.document.head.appendChild = node => {
    const result = append(node);
    if (node.tagName === "SCRIPT") window.queueMicrotask(() => node.onload?.());
    return result;
};

const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ATLAS no inició")), 1500);
    window.addEventListener("atlas:app-ready", () => { clearTimeout(timer); resolve(); }, { once: true });
});
window.eval(bootstrap);
await ready;
const result = await window.AtlasStore.resetWorkspaceData();
assert.equal(result.cloudComplete, true);
assert.equal(result.deletedRows, 3);
assert.equal(rpcCalls.length, 1);
assert.equal(rpcCalls[0].name, "atlas_reset_workspace_data");
assert.equal(rpcCalls[0].args.target_workspace, "workspace-clean");
assert.equal(window.localStorage.getItem("atlas:workspace-clean:atlasTransactions"), null);
assert.equal(window.localStorage.getItem("atlas:workspace-clean:atlasHealthRecords"), null);
assert.equal(window.localStorage.getItem("atlas:pending:workspace-clean"), null);
assert.equal(window.localStorage.getItem("unrelated-setting"), "keep");
assert.equal(jsdomErrors.length, 0, jsdomErrors.map(error => error.message).join("\n"));
dom.window.close();

console.log("ATLAS SO: limpieza por espacio, Acerca de, emprendimientos, clientes y logo verificados.");
