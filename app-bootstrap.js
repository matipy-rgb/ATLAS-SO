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
        "atlasHRAreas",
        "atlasHRPositions",
        "atlasHRAssignments",
        "atlasHRAuditLog",
        "atlasHRImportJobs",
        "atlasHRLegalParameters",
        "atlasHRSchedules",
        "atlasHRAttendance",
        "atlasHRCompliance",
        "atlasHRPayrollSettings",
        "atlasHRHolidays"
    ];
    const FINANCE_DATA_KEYS = Object.freeze([
        "atlasTransactions",
        "atlasObligations",
        "atlasReceiptDeletes"
    ]);

    const pendingSync = new Map();
    const durablePending = new Map();
    let syncTimer = null;
    let retryTimer = null;
    let retryDelay = 1500;
    let pendingVersion = 0;
    let workspaceId = "";
    let workspaceRole = "";
    let workspaceName = "";
    let userId = "";
    let hrAuthorized = false;

    function isHRDataKey(key) {
        return /^atlasHR/i.test(String(key || ""));
    }

    function isFinanceDataKey(key) {
        return FINANCE_DATA_KEYS.includes(String(key || ""));
    }

    function canUseDataKey(key) {
        if (!hrAuthorized && isHRDataKey(key)) return false;
        if (workspaceRole && workspaceRole !== "owner" && isFinanceDataKey(key)) return false;
        return true;
    }

    function scopedKey(key) {
        return `atlas:${workspaceId}:${key}`;
    }

    function readLocal(key, fallback) {
        if (!canUseDataKey(key)) return fallback;
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
        if (!canUseDataKey(key)) return false;
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
                if (!canUseDataKey(key)) return;
                durablePending.set(key, version);
                pendingSync.set(key, version);
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
                if (!key || typeof version !== "string" || !canUseDataKey(key)) return;
                durablePending.set(key, version);
                pendingSync.set(key, version);
            });
        } catch {
            // Otro contexto pudo escribir mientras cambiaba la sesiÃ³n; se ignora.
        }
    }

    function rememberPending(key) {
        const version = `${Date.now()}-${pendingVersion += 1}`;
        pendingSync.set(key, version);
        durablePending.set(key, version);
        persistPending();
    }

    async function flush() {
        if (!pendingSync.size) return true;
        if (!window.AtlasAuth?.client || !workspaceId) return false;
        const batch = Array.from(pendingSync);
        let failed = false;
        for (const [key, version] of batch) {
            if (!canUseDataKey(key)) {
                if (pendingSync.get(key) === version) pendingSync.delete(key);
                if (durablePending.get(key) === version) durablePending.delete(key);
                continue;
            }
            let error = null;
            try {
                ({ error } = await window.AtlasAuth.client
                    .from("app_data")
                    .upsert({
                        workspace_id: workspaceId,
                        data_key: key,
                        value: readLocal(key, null),
                        updated_by: userId,
                        updated_at: new Date().toISOString()
                    }, { onConflict: "workspace_id,data_key" }));
            } catch (caught) {
                error = caught;
            }
            if (error) {
                failed = true;
                continue;
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

    function queueSync(key, value) {
        void value;
        rememberPending(key);
        window.dispatchEvent(new CustomEvent("atlas:sync-status", {
            detail: { status: "syncing", message: "Sincronizandoâ€¦" }
        }));
        window.clearTimeout(syncTimer);
        syncTimer = window.setTimeout(() => flush().catch(console.error), 450);
    }

    function write(key, value) {
        if (!canUseDataKey(key)) throw new Error("Esta cuenta no puede guardar datos en ese módulo.");
        writeLocal(key, value);
        queueSync(key, value);
    }

    function legacySources() {
        return DATA_KEYS.flatMap(key => {
            const sources = key === "atlasTasks" ? [key, "tasks"] : [key];
            if (!canUseDataKey(key)) return [];
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
            "Encontramos datos locales de una versiÃ³n anterior sin cuenta asignada. Â¿Vincularlos a la cuenta que acabÃ¡s de abrir?"
        )) return;

        let migrated = 0;
        const migratedKeys = new Set();
        sources.forEach(({ key, source }) => {
            if (migratedKeys.has(key)) return;
            const raw = localStorage.getItem(source);
            try {
                const value = JSON.parse(raw);
                writeLocal(key, value);
                rememberPending(key);
                migrated += 1;
                migratedKeys.add(key);
            } catch (error) {
                if (key === "atlasQuickNotes") {
                    writeLocal(key, raw);
                    rememberPending(key);
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

    async function purgeUnauthorizedFinanceData() {
        if (!workspaceId || workspaceRole === "owner") return;
        FINANCE_DATA_KEYS.forEach(key => localStorage.removeItem(scopedKey(key)));
        for (const key of Array.from(pendingSync.keys())) {
            if (isFinanceDataKey(key)) pendingSync.delete(key);
        }
        for (const key of Array.from(durablePending.keys())) {
            if (isFinanceDataKey(key)) durablePending.delete(key);
        }
        persistPending();

        try {
            if (!window.AtlasFinanceStorage) await loadScript("finance-storage.js");
            const Storage = window.AtlasFinanceStorage?.FinanceStorage;
            if (!Storage) return;
            const storage = new Storage();
            await storage.open();
            for (const name of Object.keys(window.AtlasFinanceStorage.STORES)) {
                await storage.clearWorkspace(name, workspaceId);
            }
            storage.close();
        } catch (error) {
            console.warn("No se pudo limpiar la copia financiera local:", error.message);
        }

        if (!("indexedDB" in window)) return;
        await new Promise(resolve => {
            const request = indexedDB.open("atlasSOFiles", 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains("paymentReceipts")) {
                    request.result.createObjectStore("paymentReceipts", { keyPath: "paymentId" });
                }
            };
            request.onerror = () => resolve();
            request.onsuccess = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains("paymentReceipts")) {
                    database.close();
                    resolve();
                    return;
                }
                const transaction = database.transaction("paymentReceipts", "readwrite");
                const cursorRequest = transaction.objectStore("paymentReceipts").openCursor();
                cursorRequest.onsuccess = () => {
                    const cursor = cursorRequest.result;
                    if (!cursor) return;
                    const record = cursor.value;
                    if (record?.workspaceId === workspaceId
                        || String(record?.paymentId || "").startsWith(`${workspaceId}:`)) cursor.delete();
                    cursor.continue();
                };
                transaction.oncomplete = () => { database.close(); resolve(); };
                transaction.onerror = () => { database.close(); resolve(); };
            };
        });
    }

    async function hydrate() {
        const workspace = await window.AtlasAuth.getWorkspace();
        workspaceId = workspace.id;
        workspaceRole = workspace.role || "member";
        workspaceName = workspace.name || "Mi espacio";
        userId = window.AtlasAuth.user.id;
        loadPending();
        await purgeUnauthorizedHRData();
        await purgeUnauthorizedFinanceData();
        localStorage.setItem("atlasActiveUserId", userId);
        localStorage.setItem("atlasActiveWorkspaceId", workspaceId);

        let dataQuery = window.AtlasAuth.client
            .from("app_data")
            .select("data_key, value, updated_at")
            .eq("workspace_id", workspaceId);
        if (workspaceRole !== "owner") {
            dataQuery = dataQuery.not("data_key", "in", `(${FINANCE_DATA_KEYS.join(",")})`);
        }
        const { data, error } = await dataQuery;

        if (error) {
            console.warn("ATLAS SO iniciÃ³ con la copia local:", error.message);
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
            get workspaceRole() { return workspaceRole; },
            get workspaceName() { return workspaceName; },
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
        link.textContent = "Volver al inicio de sesiÃ³n";
        main.append(title, detail, link);
        document.body.appendChild(main);
    });
})();
