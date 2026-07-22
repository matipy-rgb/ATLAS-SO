(function () {
    const DATA_KEYS = [
        "atlasTasks",
        "atlasQuickNotes",
        "atlasTransactions",
        "atlasObligations",
        "atlasStudyEvents",
        "atlasHealthRecords",
        "atlasProjects",
        "atlasWorkRecords",
        "atlasWorkSettings",
        "atlasHabits",
        "atlasHRPeople",
        "atlasHRAbsences"
    ];

    const pendingSync = new Map();
    let syncTimer = null;
    let workspaceId = "";
    let userId = "";

    function scopedKey(key) {
        return `atlas:${workspaceId}:${key}`;
    }

    function readLocal(key, fallback) {
        try {
            const raw = localStorage.getItem(scopedKey(key));
            return raw === null ? fallback : JSON.parse(raw);
        } catch (error) {
            console.error(`No se pudo leer ${key}:`, error);
            return fallback;
        }
    }

    function writeLocal(key, value) {
        localStorage.setItem(scopedKey(key), JSON.stringify(value));
    }

    function hasLocal(key) {
        return localStorage.getItem(scopedKey(key)) !== null;
    }

    async function flush() {
        if (!pendingSync.size || !window.AtlasAuth?.client || !workspaceId) return;
        const rows = Array.from(pendingSync, ([data_key, value]) => ({
            workspace_id: workspaceId,
            data_key,
            value,
            updated_by: userId,
            updated_at: new Date().toISOString()
        }));
        pendingSync.clear();

        const { error } = await window.AtlasAuth.client
            .from("app_data")
            .upsert(rows, { onConflict: "workspace_id,data_key" });

        if (error) {
            rows.forEach(row => pendingSync.set(row.data_key, row.value));
            window.dispatchEvent(new CustomEvent("atlas:sync-status", {
                detail: { status: "offline", message: "Cambios guardados en este dispositivo" }
            }));
            return;
        }

        window.dispatchEvent(new CustomEvent("atlas:sync-status", {
            detail: { status: "synced", message: "Sincronizado" }
        }));
    }

    function queueSync(key, value) {
        pendingSync.set(key, value);
        window.dispatchEvent(new CustomEvent("atlas:sync-status", {
            detail: { status: "syncing", message: "Sincronizando…" }
        }));
        window.clearTimeout(syncTimer);
        syncTimer = window.setTimeout(() => flush().catch(console.error), 450);
    }

    function write(key, value) {
        writeLocal(key, value);
        queueSync(key, value);
    }

    async function migrateLegacy(remoteRows) {
        const config = window.ATLAS_CONFIG || {};
        const marker = `atlas:migrated:${workspaceId}`;
        if (!config.migrateLegacyDataOnFirstLogin || localStorage.getItem(marker)) return;
        if (remoteRows.length) {
            localStorage.setItem(marker, "cloud-existing");
            return;
        }

        let migrated = 0;
        DATA_KEYS.forEach(key => {
            const raw = localStorage.getItem(key) ?? (key === "atlasTasks" ? localStorage.getItem("tasks") : null);
            if (raw === null) return;
            try {
                const value = JSON.parse(raw);
                writeLocal(key, value);
                pendingSync.set(key, value);
                migrated += 1;
            } catch (error) {
                if (key === "atlasQuickNotes") {
                    writeLocal(key, raw);
                    pendingSync.set(key, raw);
                    migrated += 1;
                }
            }
        });

        localStorage.setItem(marker, migrated ? "migrated" : "empty");
        if (migrated) await flush();
    }

    async function hydrate() {
        const workspace = await window.AtlasAuth.getWorkspace();
        workspaceId = workspace.id;
        userId = window.AtlasAuth.user.id;
        localStorage.setItem("atlasActiveUserId", userId);
        localStorage.setItem("atlasActiveWorkspaceId", workspaceId);

        const { data, error } = await window.AtlasAuth.client
            .from("app_data")
            .select("data_key, value, updated_at")
            .eq("workspace_id", workspaceId);

        if (error) {
            console.warn("ATLAS SO inició con la copia local:", error.message);
            return;
        }

        const rows = Array.isArray(data) ? data : [];
        await migrateLegacy(rows);
        rows.forEach(row => writeLocal(row.data_key, row.value));
    }

    function loadScript(source) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = source;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`No se pudo cargar ${source}`));
            document.head.appendChild(script);
        });
    }

    async function start() {
        const auth = window.AtlasAuth;
        if (!auth?.isConfigured()) {
            window.location.replace("login.html?setup=1");
            return;
        }

        const session = await auth.getSession();
        if (!session) {
            const next = encodeURIComponent(location.pathname.split("/").pop() || "index.html");
            window.location.replace(`login.html?next=${next}`);
            return;
        }

        await hydrate();
        window.AtlasStore = {
            read: readLocal,
            write,
            has: hasLocal,
            flush,
            get workspaceId() { return workspaceId; },
            get userId() { return userId; }
        };

        await loadScript("atlas.js");
        const pageScript = document.body.dataset.script;
        if (pageScript) await loadScript(pageScript);
        document.body.classList.add("auth-ready");
        window.dispatchEvent(new CustomEvent("atlas:app-ready"));
    }

    start().catch(error => {
        console.error(error);
        document.body.classList.add("auth-ready");
        document.body.innerHTML = `
            <main class="boot-error">
                <strong>No pudimos abrir ATLAS SO.</strong>
                <p>${String(error.message || error)}</p>
                <a href="login.html">Volver al inicio de sesión</a>
            </main>
        `;
    });
})();
