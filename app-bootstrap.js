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
        "atlasReceiptDeletes",
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
    let lastModifiedMs = 0;
    let workspaceId = "";
    let userId = "";
    let hrAuthorized = false;
    const modifiedAt = new Map();

    function isHRDataKey(key) {
        return /^atlasHR/i.test(String(key || ""));
    }

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

    function modifiedStorageKey() {
        return `atlas:modified:${workspaceId}`;
    }

    function validTimestamp(value) {
        const parsed = Date.parse(String(value || ""));
        return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
    }

    function nextTimestamp() {
        const now = Date.now();
        lastModifiedMs = Math.max(now, lastModifiedMs + 1);
        return new Date(lastModifiedMs).toISOString();
    }

    function persistModified() {
        if (!workspaceId) return;
        if (!modifiedAt.size) {
            localStorage.removeItem(modifiedStorageKey());
            return;
        }
        localStorage.setItem(modifiedStorageKey(), JSON.stringify(Object.fromEntries(modifiedAt)));
    }

    function loadModified() {
        modifiedAt.clear();
        try {
            const parsed = JSON.parse(localStorage.getItem(modifiedStorageKey()) || "{}");
            Object.entries(parsed && typeof parsed === "object" ? parsed : {}).forEach(([key, value]) => {
                const timestamp = validTimestamp(value);
                if (!key || !timestamp || (!hrAuthorized && isHRDataKey(key))) return;
                modifiedAt.set(key, timestamp);
                lastModifiedMs = Math.max(lastModifiedMs, Date.parse(timestamp));
            });
            persistModified();
        } catch {
            localStorage.removeItem(modifiedStorageKey());
        }
    }

    function setModified(key, value) {
        const timestamp = validTimestamp(value) || nextTimestamp();
        modifiedAt.set(key, timestamp);
        lastModifiedMs = Math.max(lastModifiedMs, Date.parse(timestamp));
        persistModified();
        return timestamp;
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
                if (!hrAuthorized && isHRDataKey(key)) return;
                const timestamp = validTimestamp(version) || modifiedAt.get(key) || nextTimestamp();
                durablePending.set(key, timestamp);
                pendingSync.set(key, timestamp);
                setModified(key, timestamp);
            });
            persistPending();
        } catch {
            localStorage.removeItem(pendingStorageKey());
        }
    }

    function mergePending(raw) {
        try {
            const parsed = JSON.parse(raw || "{}");
            Object.entries(parsed && typeof parsed === "object" ? parsed : {}).forEach(([key, version]) => {
                const timestamp = validTimestamp(version);
                if (!key || !timestamp || (!hrAuthorized && isHRDataKey(key))) return;
                const current = durablePending.get(key);
                if (current && Date.parse(current) > Date.parse(timestamp)) return;
                durablePending.set(key, timestamp);
                pendingSync.set(key, timestamp);
                setModified(key, timestamp);
            });
        } catch {
            // Otro contexto pudo escribir mientras cambiaba la sesión; se ignora.
        }
    }

    function rememberPending(key, value = nextTimestamp()) {
        const version = setModified(key, value);
        pendingSync.set(key, version);
        durablePending.set(key, version);
        persistPending();
        return version;
    }

    async function flush() {
        if (!pendingSync.size) return true;
        if (!window.AtlasAuth?.client || !workspaceId) return false;
        const batch = Array.from(pendingSync);
        let failed = false;
        for (const [key, version] of batch) {
            if (!hrAuthorized && isHRDataKey(key)) {
                if (pendingSync.get(key) === version) pendingSync.delete(key);
                if (durablePending.get(key) === version) durablePending.delete(key);
                continue;
            }
            let error = null;
            let result = null;
            try {
                const response = await window.AtlasAuth.client.rpc("upsert_app_data_if_newer", {
                    target_workspace: workspaceId,
                    target_key: key,
                    target_value: readLocal(key, null),
                    target_client_updated_at: version
                });
                error = response.error;
                result = Array.isArray(response.data) ? response.data[0] : response.data;
                if (!error && (!result || typeof result !== "object" || typeof result.applied !== "boolean")) {
                    error = new Error("Supabase devolvió una confirmación de sincronización no válida.");
                }
            } catch (caught) {
                error = caught;
            }
            if (error) {
                failed = true;
                continue;
            }
            if (result?.applied === false) {
                writeLocal(key, result.value ?? null);
                setModified(key, result.client_updated_at || result.updated_at || version);
                window.dispatchEvent(new CustomEvent("atlas:data-changed", { detail: { key, source: "cloud-conflict" } }));
                window.dispatchEvent(new CustomEvent("atlas:sync-conflict", {
                    detail: { key, message: "Se conservó una versión más reciente guardada en la nube." }
                }));
            } else {
                setModified(key, result?.client_updated_at || version);
            }
            if (pendingSync.get(key) === version) pendingSync.delete(key);
            if (durablePending.get(key) === version) durablePending.delete(key);
        }

        persistPending();
        if (failed) {
            window.dispatchEvent(new CustomEvent("atlas:sync-status", {
                detail: { status: "offline", message: "Cambios guardados en este dispositivo" }
            }));
            window.clearTimeout(retryTimer);
            retryTimer = window.setTimeout(() => flush().catch(console.error), retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30000);
            return false;
        }
        window.clearTimeout(retryTimer);
        retryDelay = 1500;
        window.dispatchEvent(new CustomEvent("atlas:sync-status", {
            detail: { status: "synced", message: "Sincronizado" }
        }));
        if (pendingSync.size) {
            window.clearTimeout(syncTimer);
            syncTimer = window.setTimeout(() => flush().catch(console.error), 0);
        }
        return true;
    }

    function queueSync(key, timestamp) {
        rememberPending(key, timestamp);
        window.dispatchEvent(new CustomEvent("atlas:sync-status", {
            detail: { status: "syncing", message: "Sincronizando…" }
        }));
        window.clearTimeout(syncTimer);
        syncTimer = window.setTimeout(() => flush().catch(console.error), 450);
    }

    function write(key, value) {
        const timestamp = nextTimestamp();
        writeLocal(key, value);
        queueSync(key, timestamp);
    }

    function legacySources() {
        return DATA_KEYS.flatMap(key => {
            const sources = key === "atlasTasks" ? [key, "tasks"] : [key];
            if (!hrAuthorized && isHRDataKey(key)) return [];
            return sources.filter(source => localStorage.getItem(source) !== null).map(source => ({ key, source }));
        });
    }

    function removeLegacySources(sources) {
        sources.forEach(({ source }) => localStorage.removeItem(source));
    }

    async function migrateLegacy(remoteRows) {
        const config = window.ATLAS_CONFIG || {};
        const marker = `atlas:migrated:${workspaceId}`;
        if (!config.migrateLegacyDataOnFirstLogin || localStorage.getItem(marker)) return;
        const sources = legacySources();
        if (remoteRows.length) {
            localStorage.setItem(marker, "cloud-existing");
            removeLegacySources(sources);
            return;
        }
        if (!sources.length) {
            localStorage.setItem(marker, "empty");
            return;
        }
        if (config.migrateLegacyDataOnFirstLogin === "confirm" && !window.confirm(
            "Encontramos datos locales de una versión anterior sin cuenta asignada. ¿Vincularlos a la cuenta que acabás de abrir?"
        )) return;

        let migrated = 0;
        const migratedKeys = new Set();
        sources.forEach(({ key, source }) => {
            if (migratedKeys.has(key)) return;
            const raw = localStorage.getItem(source);
            try {
                const value = JSON.parse(raw);
                writeLocal(key, value);
                rememberPending(key, nextTimestamp());
                migrated += 1;
                migratedKeys.add(key);
            } catch (error) {
                if (key === "atlasQuickNotes") {
                    writeLocal(key, raw);
                    rememberPending(key, nextTimestamp());
                    migrated += 1;
                    migratedKeys.add(key);
                }
            }
        });

        if (!migrated) return;
        const synced = await flush();
        if (synced) {
            removeLegacySources(sources);
            localStorage.setItem(marker, "migrated");
        }
    }

    async function purgeUnauthorizedHRData() {
        if (!workspaceId || hrAuthorized) return;
        const prefix = `atlas:${workspaceId}:`;
        const removals = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(prefix) && isHRDataKey(key.slice(prefix.length))) removals.push(key);
        }
        removals.forEach(key => localStorage.removeItem(key));
        for (const key of Array.from(pendingSync.keys())) {
            if (isHRDataKey(key)) pendingSync.delete(key);
        }
        for (const key of Array.from(durablePending.keys())) {
            if (isHRDataKey(key)) durablePending.delete(key);
        }
        for (const key of Array.from(modifiedAt.keys())) {
            if (isHRDataKey(key)) modifiedAt.delete(key);
        }
        persistModified();
        persistPending();

        if (!("indexedDB" in window)) return;
        await new Promise(resolve => {
            const request = indexedDB.open("atlas-so-rrhh", 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains("attendance")) {
                    request.result.createObjectStore("attendance", { keyPath: "id" });
                }
            };
            request.onerror = () => resolve();
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction("attendance", "readwrite");
                const store = transaction.objectStore("attendance");
                const all = store.getAll();
                all.onsuccess = () => (all.result || [])
                    .filter(bucket => bucket.workspaceId === workspaceId)
                    .forEach(bucket => store.delete(bucket.id));
                transaction.oncomplete = () => { db.close(); resolve(); };
                transaction.onerror = () => { db.close(); resolve(); };
            };
        });
    }

    async function hydrate() {
        const workspace = await window.AtlasAuth.getWorkspace();
        workspaceId = workspace.id;
        userId = window.AtlasAuth.user.id;
        loadModified();
        loadPending();
        await purgeUnauthorizedHRData();
        localStorage.setItem("atlasActiveUserId", userId);
        localStorage.setItem("atlasActiveWorkspaceId", workspaceId);

        const { data, error } = await window.AtlasAuth.client
            .from("app_data")
            .select("data_key, value, client_updated_at, updated_at")
            .eq("workspace_id", workspaceId);

        if (error) {
            console.warn("ATLAS SO inició con la copia local:", error.message);
            if (pendingSync.size) window.setTimeout(() => flush().catch(console.error), retryDelay);
            return;
        }

        const rows = Array.isArray(data) ? data : [];
        await migrateLegacy(rows);
        const remoteKeys = new Set(rows.map(row => row.data_key));
        rows.forEach(row => {
            const key = row.data_key;
            if (!key || (!hrAuthorized && isHRDataKey(key)) || durablePending.has(key)) return;
            const remoteTimestamp = validTimestamp(row.client_updated_at || row.updated_at) || nextTimestamp();
            const localTimestamp = validTimestamp(modifiedAt.get(key));
            if (!hasLocal(key) || !localTimestamp || Date.parse(remoteTimestamp) >= Date.parse(localTimestamp)) {
                writeLocal(key, row.value);
                setModified(key, remoteTimestamp);
            } else {
                rememberPending(key, localTimestamp);
            }
        });
        const prefix = `atlas:${workspaceId}:`;
        const localKeys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const storageKey = localStorage.key(index);
            if (storageKey?.startsWith(prefix)) localKeys.push(storageKey.slice(prefix.length));
        }
        localKeys.forEach(key => {
            if (!key || remoteKeys.has(key) || durablePending.has(key) || (!hrAuthorized && isHRDataKey(key))) return;
            rememberPending(key, modifiedAt.get(key) || nextTimestamp());
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

        hrAuthorized = await auth.isHRAdmin();
        await hydrate();
        if (document.body.dataset.page === "rrhh" && !hrAuthorized) {
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
        window.ATLAS_IS_HR_ADMIN = hrAuthorized;

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
    window.addEventListener("storage", event => {
        if (!workspaceId || event.key !== pendingStorageKey()) return;
        mergePending(event.newValue);
        flush().catch(console.error);
    });
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
