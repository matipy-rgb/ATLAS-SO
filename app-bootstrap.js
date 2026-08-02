(function () {
    const DATA_KEYS = [
        "atlasTasks",
        "atlasQuickNotes",
        "atlasPreferences",
        "atlasDailyFocus",
        "atlasTransactions",
        "atlasObligations",
        "atlasStudyEvents",
        "atlasHealthRecords",
        "atlasProjects",
        "atlasWorkRecords",
        "atlasWorkSettings",
        "atlasHabits",
        "atlasHRPeople",
        "atlasHRAbsences",
        "atlasHRClients",
        "atlasHRBranches",
        "atlasHRSchedules",
        "atlasHRAttendance",
        "atlasHRCompliance",
        "atlasHRPayrollSettings",
        "atlasHRHolidays"
    ];

    const pendingSync = new Map();
    const durablePending = new Map();
    let syncTimer = null;
    let retryTimer = null;
    let retryDelay = 1500;
    let pendingVersion = 0;
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

    function pendingStorageKey() {
        return `atlas:pending:${workspaceId}`;
    }

    function persistPending() {
        if (!workspaceId) return;
        if (!durablePending.size) {
            localStorage.removeItem(pendingStorageKey());
            return;
        }
        localStorage.setItem(pendingStorageKey(), JSON.stringify(Object.fromEntries(durablePending)));
    }

    function loadPending() {
        pendingSync.clear();
        durablePending.clear();
        try {
            const parsed = JSON.parse(localStorage.getItem(pendingStorageKey()) || "{}");
            Object.entries(parsed && typeof parsed === "object" ? parsed : {}).forEach(([key, version]) => {
                if (!key || typeof version !== "string") return;
                durablePending.set(key, version);
                pendingSync.set(key, version);
            });
        } catch {
            localStorage.removeItem(pendingStorageKey());
        }
    }

    function rememberPending(key) {
        const version = `${Date.now()}-${pendingVersion += 1}`;
        pendingSync.set(key, version);
        durablePending.set(key, version);
        persistPending();
    }

    async function flush() {
        if (!pendingSync.size || !window.AtlasAuth?.client || !workspaceId) return;
        const batch = Array.from(pendingSync);
        batch.forEach(([key, version]) => {
            if (pendingSync.get(key) === version) pendingSync.delete(key);
        });
        const rows = batch.map(([data_key]) => ({
            workspace_id: workspaceId,
            data_key,
            value: readLocal(data_key, null),
            updated_by: userId,
            updated_at: new Date().toISOString()
        }));

        let error = null;
        try {
            ({ error } = await window.AtlasAuth.client
                .from("app_data")
                .upsert(rows, { onConflict: "workspace_id,data_key" }));
        } catch (caught) {
            error = caught;
        }

        if (error) {
            batch.forEach(([key, version]) => {
                if (!pendingSync.has(key)) pendingSync.set(key, version);
            });
            window.dispatchEvent(new CustomEvent("atlas:sync-status", {
                detail: { status: "offline", message: "Cambios guardados en este dispositivo" }
            }));
            window.clearTimeout(retryTimer);
            retryTimer = window.setTimeout(() => flush().catch(console.error), retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30000);
            return;
        }

        batch.forEach(([key, version]) => {
            if (durablePending.get(key) === version) durablePending.delete(key);
        });
        persistPending();
        window.clearTimeout(retryTimer);
        retryDelay = 1500;
        window.dispatchEvent(new CustomEvent("atlas:sync-status", {
            detail: { status: "synced", message: "Sincronizado" }
        }));
        if (pendingSync.size) {
            window.clearTimeout(syncTimer);
            syncTimer = window.setTimeout(() => flush().catch(console.error), 0);
        }
    }

    function queueSync(key, value) {
        void value;
        rememberPending(key);
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
                rememberPending(key);
                migrated += 1;
            } catch (error) {
                if (key === "atlasQuickNotes") {
                    writeLocal(key, raw);
                    rememberPending(key);
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
        loadPending();
        localStorage.setItem("atlasActiveUserId", userId);
        localStorage.setItem("atlasActiveWorkspaceId", workspaceId);

        const { data, error } = await window.AtlasAuth.client
            .from("app_data")
            .select("data_key, value, updated_at")
            .eq("workspace_id", workspaceId);

        if (error) {
            console.warn("ATLAS SO inició con la copia local:", error.message);
            if (pendingSync.size) window.setTimeout(() => flush().catch(console.error), retryDelay);
            return;
        }

        const rows = Array.isArray(data) ? data : [];
        await migrateLegacy(rows);
        rows.forEach(row => {
            if (!durablePending.has(row.data_key)) writeLocal(row.data_key, row.value);
        });
        if (pendingSync.size) await flush();
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
            const next = encodeURIComponent(location.pathname.split("/").pop() || "app.html");
            window.location.replace(`login.html?next=${next}`);
            return;
        }

        await hydrate();
        const isHRAdmin = await auth.isHRAdmin();
        if (document.body.dataset.page === "rrhh" && !isHRAdmin) {
            window.location.replace("app.html?access=denied");
            return;
        }
        window.AtlasStore = {
            read: readLocal,
            write,
            has: hasLocal,
            flush,
            get workspaceId() { return workspaceId; },
            get userId() { return userId; }
        };
        window.ATLAS_IS_HR_ADMIN = isHRAdmin;

        await loadScript("atlas.js");
        const pageScript = document.body.dataset.script;
        if (pageScript) await loadScript(pageScript);
        const extraScripts = String(document.body.dataset.extraScript || "")
            .split(",")
            .map(source => source.trim())
            .filter(Boolean);
        for (const extraScript of extraScripts) await loadScript(extraScript);
        document.body.classList.add("auth-ready");
        window.dispatchEvent(new CustomEvent("atlas:app-ready"));
    }

    window.addEventListener("online", () => flush().catch(console.error));
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) flush().catch(console.error);
    });

    start().catch(error => {
        console.error(error);
        document.body.classList.add("auth-ready");
        document.body.replaceChildren();
        const main = document.createElement("main");
        main.className = "boot-error";
        const title = document.createElement("strong");
        title.textContent = "No pudimos abrir ATLAS SO.";
        const detail = document.createElement("p");
        detail.textContent = String(error.message || error);
        const link = document.createElement("a");
        link.href = "login.html";
        link.textContent = "Volver al inicio de sesión";
        main.append(title, detail, link);
        document.body.appendChild(main);
    });
})();
