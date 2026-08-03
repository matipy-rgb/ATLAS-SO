(function () {
    "use strict";

    const DB_NAME = "atlas-so-rrhh";
    const DB_VERSION = 1;
    const STORE = "attendance";
    const CLOUD_CHUNK_SIZE = 500;
    const DELETE_CHUNK_SIZE = 200;
    const cloudAvailable = () => Boolean(window.AtlasAuth?.client && window.AtlasStore?.workspaceId);

    function bucketId(companyId, period) {
        return `${window.AtlasStore?.workspaceId || "local"}:${companyId}:${period}`;
    }

    function fallbackKey(companyId, period) {
        return `atlasHRAttendanceFallback__${companyId}__${period}`;
    }

    function deletionKey(companyId) {
        return `atlasHRAttendanceDeletes__${companyId}`;
    }

    function pendingDeletions(companyId) {
        const value = window.AtlasStore?.read(deletionKey(companyId), []);
        return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
    }

    function savePendingDeletions(companyId, ids) {
        window.AtlasStore?.write(deletionKey(companyId), [...new Set((ids || []).map(String).filter(Boolean))]);
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
            branchId: String(item?.branchId || ""),
            assignmentId: String(item?.assignmentId || ""),
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

    function comparable(value) {
        return JSON.stringify({
            employeeId: value.employeeId,
            clientId: value.clientId,
            branchId: value.branchId,
            assignmentId: value.assignmentId,
            clockId: value.clockId,
            date: value.date,
            in: value.in,
            out: value.out,
            rawStatus: value.rawStatus,
            resolvedStatus: value.resolvedStatus,
            note: value.note,
            sourceImportId: value.sourceImportId
        });
    }

    function timestamp(value) {
        const parsed = Date.parse(value?.updatedAt || "");
        return Number.isFinite(parsed) ? parsed : 0;
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
            if (comparable(previous) === comparable(item)) {
                counts.equal += 1;
                if (timestamp(item) >= timestamp(previous)) map.set(key, { ...previous, ...item, id: previous.id });
            }
            else {
                counts.updated += 1;
                if (timestamp(item) >= timestamp(previous)) map.set(key, { ...previous, ...item, id: previous.id });
            }
        });
        return { records: Array.from(map.values()), counts };
    }

    function periodEnd(period) {
        const match = String(period || "").match(/^(\d{4})-(\d{2})$/);
        if (!match) return "";
        const year = Number(match[1]);
        const month = Number(match[2]);
        if (month < 1 || month > 12) return "";
        const lastDay = new Date(year, month, 0).getDate();
        return `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;
    }

    function syncStatus(status, message) {
        window.dispatchEvent?.(new CustomEvent("atlas:sync-status", { detail: { status, message } }));
    }

    async function readCloud(companyId, period) {
        if (!cloudAvailable()) return null;
        const end = periodEnd(period);
        if (!end) return null;
        const { data, error } = await window.AtlasAuth.client
            .from("hr_attendance_records")
            .select("id,employee_id,client_id,branch_id,assignment_id,clock_id,source_name,work_date,time_in,time_out,raw_status,resolved_status,note,source_import_id,updated_at")
            .eq("workspace_id", window.AtlasStore.workspaceId)
            .eq("company_id", companyId)
            .gte("work_date", `${period}-01`)
            .lte("work_date", end);
        if (error) {
            if (!["42P01", "PGRST205"].includes(error.code)) console.warn("Marcaciones en nube:", error.message);
            return null;
        }
        return (data || []).map(row => normalize({
            id: row.id,
            employeeId: row.employee_id,
            clientId: row.client_id,
            branchId: row.branch_id,
            assignmentId: row.assignment_id,
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
            branch_id: item.branchId || null,
            assignment_id: item.assignmentId || null,
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
        for (let index = 0; index < rows.length; index += CLOUD_CHUNK_SIZE) {
            const chunk = rows.slice(index, index + CLOUD_CHUNK_SIZE);
            const { error } = await window.AtlasAuth.client
                .from("hr_attendance_records")
                .upsert(chunk, { onConflict: "workspace_id,company_id,employee_id,work_date" });
            if (error) {
                if (!["42P01", "PGRST205"].includes(error.code)) console.warn("No se sincronizaron marcaciones:", error.message);
                syncStatus("offline", "Marcaciones guardadas en este dispositivo");
                return false;
            }
        }
        syncStatus("synced", "Marcaciones sincronizadas");
        return true;
    }

    async function flushPendingDeletions(companyId) {
        const ids = pendingDeletions(companyId);
        if (!ids.length) return true;
        if (!cloudAvailable()) return false;
        for (let index = 0; index < ids.length; index += DELETE_CHUNK_SIZE) {
            const chunk = ids.slice(index, index + DELETE_CHUNK_SIZE);
            const { error } = await window.AtlasAuth.client
                .from("hr_attendance_records")
                .delete()
                .eq("workspace_id", window.AtlasStore.workspaceId)
                .eq("company_id", companyId)
                .in("id", chunk);
            if (error) {
                syncStatus("offline", "Hay eliminaciones de marcaciones pendientes");
                return false;
            }
        }
        savePendingDeletions(companyId, []);
        return true;
    }

    async function getMonth(companyId, period) {
        if (cloudAvailable()) await flushPendingDeletions(companyId);
        const deleted = new Set(pendingDeletions(companyId));
        const local = (await readLocal(companyId, period)).filter(item => !deleted.has(String(item.id)));
        const remote = await readCloud(companyId, period);
        const cloud = remote?.filter(item => !deleted.has(String(item.id))) ?? remote;
        if (cloud !== null) {
            const merged = mergeRecords(cloud, local).records;
            await writeLocal(companyId, period, merged);
            const cloudByKey = new Map(cloud.map(item => [`${item.employeeId || item.clockId}:${item.date}`, item]));
            const pending = merged.filter(item => {
                const remote = cloudByKey.get(`${item.employeeId || item.clockId}:${item.date}`);
                return !remote || comparable(remote) !== comparable(item) || timestamp(item) > timestamp(remote);
            });
            if (pending.length) await writeCloud(companyId, pending);
            return merged;
        }
        return local;
    }

    async function upsertMonth(companyId, period, incoming) {
        const current = await getMonth(companyId, period);
        const normalizedIncoming = incoming.map(normalize);
        const merged = mergeRecords(current, normalizedIncoming);
        await writeLocal(companyId, period, merged.records);
        const cloudSynced = await writeCloud(companyId, normalizedIncoming);
        return { ...merged, cloudSynced: cloudAvailable() ? cloudSynced : null };
    }

    async function remove(companyId, period, id) {
        const records = (await getMonth(companyId, period)).filter(item => String(item.id) !== String(id));
        await writeLocal(companyId, period, records);
        savePendingDeletions(companyId, [...pendingDeletions(companyId), String(id)]);
        const deleted = await flushPendingDeletions(companyId);
        if (!deleted) syncStatus("offline", "La eliminación quedó pendiente de sincronizar");
        return records;
    }

    window.AtlasHRStorage = {
        getMonth,
        upsertMonth,
        remove,
        mergeRecords,
        normalize,
        periodEnd,
        flushPendingDeletions
    };
})();
