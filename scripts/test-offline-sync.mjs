import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";

const bootstrap = await readFile(new URL("../app-bootstrap.js", import.meta.url), "utf8");
const authCore = await readFile(new URL("../auth-core.js", import.meta.url), "utf8");

function storageEntries(storage) {
    const entries = [];
    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        entries.push([key, storage.getItem(key)]);
    }
    return entries;
}

async function createRun({ saved = [], remoteRows = [], failUpsert = false } = {}) {
    const virtualConsole = new VirtualConsole();
    const errors = [];
    virtualConsole.on("jsdomError", error => errors.push(error));
    const dom = new JSDOM("<!doctype html><html><head></head><body data-page=\"dashboard\"></body></html>", {
        url: "https://atlas.test/app.html",
        runScripts: "outside-only",
        pretendToBeVisual: true,
        virtualConsole
    });
    const { window } = dom;
    saved.forEach(([key, value]) => window.localStorage.setItem(key, value));
    const upserts = [];
    const originalAppend = window.document.head.appendChild.bind(window.document.head);
    window.document.head.appendChild = node => {
        const result = originalAppend(node);
        if (node.tagName === "SCRIPT") window.queueMicrotask(() => node.onload?.());
        return result;
    };
    const client = {
        from(table) {
            assert.equal(table, "app_data");
            return {
                select() {
                    return this;
                },
                async eq() {
                    return { data: structuredClone(remoteRows), error: null };
                },
                async upsert(rows) {
                    upserts.push(structuredClone(rows));
                    return failUpsert
                        ? { error: { message: "sin conexión" } }
                        : { error: null };
                }
            };
        }
    };
    window.AtlasAuth = {
        client,
        user: { id: "user-test" },
        isConfigured: () => true,
        getSession: async () => ({ user: { id: "user-test" } }),
        getWorkspace: async () => ({ id: "workspace-test", role: "owner" }),
        isHRAdmin: async () => false
    };

    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("La aplicación no terminó de iniciar")), 1500);
        window.addEventListener("atlas:app-ready", () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
    window.eval(bootstrap);
    await ready;
    assert.equal(errors.length, 0, errors.map(error => error.message).join("\n"));
    return { dom, window, upserts };
}

const remote = [{
    data_key: "atlasTasks",
    value: [{ id: "remote", text: "Copia vieja" }],
    updated_at: "2026-01-01T00:00:00.000Z"
}];
const first = await createRun({ remoteRows: remote, failUpsert: true });
first.window.AtlasStore.write("atlasTasks", [{ id: "local", text: "Cambio sin conexión" }]);
await new Promise(resolve => setTimeout(resolve, 600));
assert.equal(first.window.AtlasStore.read("atlasTasks", [])[0].id, "local");
assert.match(first.window.localStorage.getItem("atlas:pending:workspace-test") || "", /atlasTasks/);
const saved = storageEntries(first.window.localStorage);
first.dom.window.close();

const second = await createRun({ saved, remoteRows: remote, failUpsert: false });
assert.equal(second.window.AtlasStore.read("atlasTasks", [])[0].id, "local", "La nube vieja no debe pisar un cambio local pendiente");
assert.equal(second.upserts.length, 1);
assert.equal(second.upserts[0][0].value[0].id, "local");
assert.equal(second.window.localStorage.getItem("atlas:pending:workspace-test"), null);
second.dom.window.close();

const authDom = new JSDOM("<!doctype html><body></body>", {
    url: "https://atlas.test/app.html",
    runScripts: "outside-only"
});
const authWindow = authDom.window;
authWindow.localStorage.setItem("atlas:workspace:user-test", JSON.stringify({
    id: "workspace-test",
    name: "Espacio guardado",
    role: "owner"
}));
authWindow.localStorage.setItem("atlas:hr-admin:user-test", "true");
const offlineClient = {
    auth: {
        getSession: async () => ({ data: { session: { user: { id: "user-test" } } }, error: null }),
        signOut: async () => ({ error: null })
    },
    from() {
        return {
            select() { return this; },
            eq() { return this; },
            order() { return this; },
            limit() { return this; },
            async maybeSingle() { return { data: null, error: { message: "sin conexión" } }; }
        };
    },
    async rpc() {
        return { data: null, error: { message: "sin conexión" } };
    }
};
authWindow.ATLAS_CONFIG = {
    supabaseUrl: "https://prueba.supabase.co",
    supabasePublishableKey: "publishable-test"
};
authWindow.supabase = { createClient: () => offlineClient };
authWindow.console.warn = () => {};
authWindow.eval(authCore);
await authWindow.AtlasAuth.getSession();
assert.equal((await authWindow.AtlasAuth.getWorkspace()).id, "workspace-test");
assert.equal(await authWindow.AtlasAuth.isHRAdmin(), true);
authDom.window.close();

console.log("ATLAS SO v0.7.1: cambios sin conexión preservados y sincronizados tras reabrir.");
