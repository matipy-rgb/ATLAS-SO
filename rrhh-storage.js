(function () {
    "use strict";

    const DB_NAME = "atlas-so-rrhh";
    const DB_VERSION = 1;
    const STORE = "attendance";
    const cloudAvailable = () => Boolean(window.AtlasAuth?.client && window.AtlasStore?.workspaceId);

    function bucketId(companyId, period) {
        return `${window.AtlasStore?.workspaceId || "local"}:${companyId}:${period}`;
    }

    function fallbackKey(companyId, period) {
        return `atlasHRAttendanceFallback__${companyId}__${period}`;
    }

    function openDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error("IndexedDB no disponible"));
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function readLocal(companyId, period) {
        try {
            const db = await openDB();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, "readonly");
                const request = tx.objectStore(STORE).get(bucketId(companyId, period));
                request.onsuccess = () => resolve(Array.isArray(request.result?.records) ? request.result.records : []);
                request.onerror = () => reject(request.error);
                tx.oncomplete = () => db.close();
            });
        } catch {
            const value = window.AtlasStore?.read(fallbackKey(companyId, period), []);
            return Array.isArray(value) ? value : [];
        }
    }

    async function writeLocal(companyId, period, records) {
        try {
            const db = await openDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, "readwrite");
                tx.objectStore(STORE).put({
                    id: bucketId(companyId, period),
                    workspaceId: window.AtlasStore?.workspaceId || "",
                    companyId,
                    period,
                    records,
                    updatedAt: new Date().toISOString()
                });
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            db.close();
        } catch {
            window.AtlasStore?.write(fallbackKey(companyId, period), records);
        }
    }

    function normalize(item) {
        const date = window.AtlasHRCalc?.dateISO(item?.date) || String(item?.date || "").slice(0, 10);
        return {
            id: String(item?.id || `${item?.employeeId || item?.clockId || "unknown"}-${date}`),
            employeeId: String(item?.employeeId || ""),
            clientId: String(item?.clientId || ""),
            clockId: String(item?.clockId || ""),
            sourceName: String(item?.sourceName || ""),
            date,
            in: String(item?.in || ""),
            out: String(item?.out || ""),
            rawStatus: String(item?.rawStatus || ""),
            resolvedStatus: String(item?.resolvedStatus || ""),
            note: String(item?.note || ""),
            sourceImportId: String(item?.sourceImportId || ""),
            updatedAt: item?.updatedAt || new Date().toISOString()
        };
    }

    function mergeRecords(base, incoming) {
        const map = new Map((base || []).map(item => [`${item.employeeId || item.clockId}:${item.date}`, normalize(item)]));
        const counts = { new: 0, updated: 0, equal: 0 };
        (incoming || []).forEach(raw => {
            const item = normalize(raw);
            const key = `${item.employeeId || item.clockId}:${item.date}`;
            const previous = map.get(key);
            if (!previous) {
                counts.new += 1;
                map.set(key, item);
                return;
            }
            const comparable = value => JSON.stringify({
                employeeId: value.employeeId,
                clientId: value.clientId,
                clockId: value.clockId,
                date: value.date,
                in: value.in,
                out: value.out,
                rawStatus: value.rawStatus,
                resolvedStatus: value.resolvedStatus
            });
            if (comparable(previous) === comparable(item)) counts.equal += 1;
            else {
                counts.updated += 1;
                map.set(key, { ...previous, ...item, id: previous.id });
            }
        });
        return { records: Array.from(map.values()), counts };
    }

    async function readCloud(companyId, period) {
        if (!cloudAvailable()) return null;
        const { data, error } = await window.AtlasAuth.client
            .from("hr_attendance_records")
            .select("id,employee_id,client_id,clock_id,source_name,work_date,time_in,time_out,raw_status,resolved_status,note,source_import_id,updated_at")
            .eq("workspace_id", window.AtlasStore.workspaceId)
            .eq("company_id", companyId)
            .gte("work_date", `${period}-01`)
            .lte("work_date", `${period}-31`);
        if (error) {
            if (!["42P01", "PGRST205"].includes(error.code)) console.warn("Marcaciones en nube:", error.message);
            return null;
        }
        return (data || []).map(row => normalize({
            id: row.id,
            employeeId: row.employee_id,
            clientId: row.client_id,
            clockId: row.clock_id,
            sourceName: row.source_name,
            date: row.work_date,
            in: row.time_in,
            out: row.time_out,
            rawStatus: row.raw_status,
            resolvedStatus: row.resolved_status,
            note: row.note,
            sourceImportId: row.source_import_id,
            updatedAt: row.updated_at
        }));
    }

    async function writeCloud(companyId, records) {
        if (!cloudAvailable() || !records.length) return false;
        const rows = records.map(item => ({
            id: item.id,
            workspace_id: window.AtlasStore.workspaceId,
            company_id: companyId,
            client_id: item.clientId || null,
            employee_id: item.employeeId || null,
            clock_id: item.clockId || null,
            source_name: item.sourceName || null,
            work_date: item.date,
            time_in: item.in || null,
            time_out: item.out || null,
            raw_status: item.rawStatus || null,
            resolved_status: item.resolvedStatus || null,
            note: item.note || null,
            source_import_id: item.sourceImportId || null,
            updated_by: window.AtlasStore.userId,
            updated_at: new Date().toISOString()
        }));
        const { error } = await window.AtlasAuth.client
            .from("hr_attendance_records")
            .upsert(rows, { onConflict: "workspace_id,company_id,employee_id,work_date" });
        if (error) {
            if (!["42P01", "PGRST205"].includes(error.code)) console.warn("No se sincronizaron marcaciones:", error.message);
            return false;
        }
        return true;
    }

    async function getMonth(companyId, period) {
        const local = await readLocal(companyId, period);
        const cloud = await readCloud(companyId, period);
        if (cloud) {
            const merged = mergeRecords(local, cloud).records;
            await writeLocal(companyId, period, merged);
            return merged;
        }
        return local;
    }

    async function upsertMonth(companyId, period, incoming) {
        const current = await getMonth(companyId, period);
        const merged = mergeRecords(current, incoming);
        await writeLocal(companyId, period, merged.records);
        await writeCloud(companyId, incoming.map(normalize));
        return merged;
    }

    async function remove(companyId, period, id) {
        const records = (await getMonth(companyId, period)).filter(item => String(item.id) !== String(id));
        await writeLocal(companyId, period, records);
        if (cloudAvailable()) {
            await window.AtlasAuth.client.from("hr_attendance_records")
                .delete().eq("workspace_id", window.AtlasStore.workspaceId).eq("id", id);
        }
        return records;
    }

    window.AtlasHRStorage = {
        getMonth,
        upsertMonth,
        remove,
        mergeRecords,
        normalize
    };
})();
