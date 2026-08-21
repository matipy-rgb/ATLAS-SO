(function () {
    "use strict";

    const A = window.Atlas;
    const C = window.AtlasHRContext;
    const Core = window.AtlasHRV09Core;
    const O = window.AtlasHROperation;
    const XLSX = window.XLSX;
    if (!A || !C || !Core || !O || !XLSX) throw new Error("El centro de importaciones no pudo iniciar.");

    const q = selector => document.querySelector(selector);
    const esc = A.escapeHTML;
    const MAX_BYTES = 50 * 1024 * 1024;
    const MAX_ROWS = 250000;
    const MAX_COLUMNS = 200;
    let stage = null;

    function bytesHex(buffer) {
        return Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, "0")).join("");
    }

    async function hashBuffer(buffer) {
        if (crypto?.subtle) return bytesHex(await crypto.subtle.digest("SHA-256", buffer));
        let hash = 2166136261;
        new Uint8Array(buffer).forEach(byte => { hash = Math.imul(hash ^ byte, 16777619); });
        return `fnv1a-${(hash >>> 0).toString(16)}`;
    }

    function assertFile(file) {
        if (!file) throw new Error("Seleccioná una planilla.");
        if (!/\.(?:xlsx|xls|xlsm|csv)$/i.test(file.name)) throw new Error("Usá un archivo XLSX, XLS, XLSM o CSV.");
        if (file.size > MAX_BYTES) throw new Error("La planilla supera el límite de 50 MB.");
    }

    function workbookData(buffer) {
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) throw new Error("La planilla no tiene una hoja legible.");
        if (sheet["!ref"]) {
            const range = XLSX.utils.decode_range(sheet["!ref"]);
            const rows = range.e.r - range.s.r + 1;
            const columns = range.e.c - range.s.c + 1;
            if (rows > MAX_ROWS || columns > MAX_COLUMNS) throw new Error(`La hoja tiene ${rows.toLocaleString("es-PY")} filas y ${columns} columnas; dividila.`);
        }
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
        const headerIndex = matrix.findIndex(row => row.filter(value => String(value).trim()).length >= 2);
        if (headerIndex < 0) throw new Error("No encontré una fila de encabezados.");
        const headers = matrix[headerIndex].map((value, index) => String(value || `Columna ${index + 1}`).trim());
        const rows = matrix.slice(headerIndex + 1).filter(row => row.some(value => String(value).trim())).map(row =>
            Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
        );
        return { headers, rows, headerIndex };
    }

    function currentContext(type) {
        const people = A.readArray("atlasHRPeople");
        const schedules = A.readArray("atlasHRSchedules");
        const news = A.readArray("atlasHRAbsences");
        const existingNaturalKeys = new Set();
        if (type === "people") people.forEach(item => existingNaturalKeys.add(Core.naturalKey(type, item)));
        if (type === "clients") C.company.clients.forEach(item => existingNaturalKeys.add(Core.naturalKey(type, item)));
        if (type === "branches") O.branches.forEach(item => existingNaturalKeys.add(Core.naturalKey(type, { client: C.clientById(item.clientId)?.name, name: item.name })));
        if (type === "assignments") O.assignments.forEach(item => {
            const person = people.find(entry => entry.id === item.employeeId);
            existingNaturalKeys.add(Core.naturalKey(type, { ci: person?.ci, from: item.from, client: C.clientById(item.clientId)?.name, branch: O.branchById(item.branchId)?.name }));
        });
        if (type === "schedules") schedules.forEach(item => (item.revisions || []).forEach(revision => existingNaturalKeys.add(Core.naturalKey(type, { name: item.name, effectiveFrom: revision.effectiveFrom }))));
        if (type === "news") news.forEach(item => {
            const person = people.find(entry => entry.id === item.employeeId);
            existingNaturalKeys.add(Core.naturalKey(type, { ci: person?.ci, type: item.type, startDate: item.startDate, endDate: item.endDate }));
        });
        return { people, clients: C.company.clients, branches: O.branches, schedules, news, existingNaturalKeys };
    }

    function schema() {
        return Core.IMPORT_SCHEMAS[q("#hrImportType").value];
    }

    function renderMapping() {
        const target = q("#hrImportMapping");
        if (!stage) { target.innerHTML = ""; return; }
        const selectedSchema = schema();
        target.innerHTML = selectedSchema.columns.map(([field, label, , required]) => `<label><span>${esc(label)}${required ? " *" : ""}</span><select data-map-field="${esc(field)}"><option value="">No importar</option>${stage.headers.map(header => `<option value="${esc(header)}" ${stage.mapping[field] === header ? "selected" : ""}>${esc(header)}</option>`).join("")}</select></label>`).join("");
    }

    function stageRows() {
        if (!stage) return;
        const type = q("#hrImportType").value;
        stage.type = type;
        stage.mapping = { ...Core.autoMap(stage.headers, type), ...stage.mapping };
        const missingMappings = schema().columns.filter(([field, , , required]) => required && !stage.mapping[field]);
        const mapped = stage.rawRows.map((row, index) => Core.mappedRow(row, stage.mapping, type, stage.headerIndex + index + 2));
        stage.rows = Core.validateImportRows(type, mapped, currentContext(type));
        if (missingMappings.length) stage.rows.forEach(row => missingMappings.forEach(([, label]) => row.issues.push(`Falta mapear ${label}`)));
        renderMapping();
        renderPreview();
    }

    function renderPreview() {
        const container = q("#hrImportWorkspace");
        if (!stage) { container.hidden = true; return; }
        const invalid = stage.rows.filter(item => item.issues.length);
        const warnings = stage.rows.filter(item => item.warnings.length);
        const fresh = stage.rows.filter(item => item.action === "new");
        const updates = stage.rows.filter(item => item.action === "update");
        q("#hrImportHubSummary").innerHTML = `<span><strong>${stage.rows.length.toLocaleString("es-PY")}</strong> filas</span><span><strong>${fresh.length}</strong> nuevas</span><span><strong>${updates.length}</strong> actualizaciones</span><span><strong>${warnings.length}</strong> advertencias</span><span><strong>${invalid.length}</strong> errores</span>`;
        q("#hrImportHubErrors").innerHTML = invalid.length ? `<strong>El archivo no se procesará hasta corregir:</strong><ul>${invalid.slice(0, 100).map(item => `<li>Fila ${item.sourceRow}: ${esc(item.issues.join(" · "))}</li>`).join("")}</ul>${invalid.length > 100 ? `<p>Se muestran 100 de ${invalid.length} errores.</p>` : ""}` : '<div class="hr-import-ok">✓ Validación completa. Podés confirmar el procesamiento.</div>';
        const displayFields = schema().columns.slice(0, 6).map(([field, label]) => [field, label]);
        q("#hrImportHubPreview").innerHTML = `<table class="hr-simple-table"><thead><tr><th>Fila</th>${displayFields.map(([, label]) => `<th>${esc(label)}</th>`).join("")}<th>Resultado</th></tr></thead><tbody>${stage.rows.slice(0, 200).map(item => `<tr class="${item.issues.length ? "hr-row-error" : item.warnings.length ? "hr-row-warning" : ""}"><td>${item.sourceRow}</td>${displayFields.map(([field]) => `<td>${esc(item[field] || "—")}</td>`).join("")}<td><span class="hr-import-status ${item.issues.length ? "error" : item.action}">${item.issues.length ? "Error" : item.warnings.length ? "Advertencia" : item.action === "update" ? "Actualizar" : "Nuevo"}</span></td></tr>`).join("")}</tbody></table>`;
        q("#hrImportFileMeta").textContent = `${stage.fileName} · SHA-256 ${stage.hash.slice(0, 16)}… · nada se guardó todavía`;
        q("#hrImportConfirm").disabled = !stage.rows.length || invalid.length > 0 || stage.duplicate;
        q("#hrImportDownloadErrors").disabled = invalid.length === 0;
        if (stage.duplicate) q("#hrImportHubErrors").innerHTML = '<strong>Este archivo ya fue procesado. ATLAS bloqueó la reimportación por hash para evitar duplicados.</strong>';
        container.hidden = false;
    }

    async function readFile(file) {
        assertFile(file);
        const buffer = await file.arrayBuffer();
        const hash = await hashBuffer(buffer);
        const parsed = workbookData(buffer);
        const duplicate = A.readArray(Core.KEYS.imports).some(item => item.hash === hash && item.status === "PROCESADO");
        stage = {
            type: q("#hrImportType").value,
            fileName: file.name,
            fileSize: file.size,
            hash,
            duplicate,
            headers: parsed.headers,
            rawRows: parsed.rows,
            headerIndex: parsed.headerIndex,
            mapping: Core.autoMap(parsed.headers, q("#hrImportType").value),
            rows: []
        };
        stageRows();
    }

    function clientFrom(value) {
        const wanted = Core.clean(value);
        return C.company.clients.find(item => [item.id, item.name, item.costCenter].some(entry => Core.clean(entry) === wanted)) || null;
    }

    function branchFrom(value, clientId = "") {
        const wanted = Core.clean(value);
        return O.branches.find(item => (!clientId || item.clientId === clientId) && [item.id, item.name, item.code].some(entry => Core.clean(entry) === wanted)) || null;
    }

    function personFromCI(value) {
        const ci = Core.normalizeCI(value);
        return A.readArray("atlasHRPeople").find(item => Core.normalizeCI(item.ci) === ci) || null;
    }

    function scheduleFrom(value) {
        const wanted = Core.clean(value);
        return A.readArray("atlasHRSchedules").find(item => [item.id, item.name].some(entry => Core.clean(entry) === wanted)) || null;
    }

    function parseDays(value) {
        const raw = String(value || "").toLowerCase();
        if (!raw) return [1, 2, 3, 4, 5, 6];
        const names = [["dom", 0], ["lun", 1], ["mar", 2], ["mie", 3], ["jue", 4], ["vie", 5], ["sab", 6]];
        const found = names.filter(([name]) => Core.clean(raw).includes(name)).map(([, day]) => day);
        if (found.length) return found;
        return raw.split(/[,; ]+/).map(Number).filter(day => day >= 0 && day <= 6);
    }

    function normalizeWorkerType(value) {
        const clean = Core.clean(value);
        return clean.includes("jornal") ? "daily" : clean.includes("parcial") ? "parttime" : "monthly";
    }

    function normalizeStatus(value) {
        const clean = Core.clean(value);
        return clean.includes("inactiv") || clean.includes("baja") ? "inactive" : "active";
    }

    function cleanRows() {
        return stage.rows.map(item => {
            const next = { ...item };
            ["issues", "warnings", "action", "sourceRow", "naturalKey"].forEach(key => delete next[key]);
            return next;
        });
    }

    async function processPeople(rows) {
        let people = A.readArray("atlasHRPeople");
        let processed = 0;
        O.beginBatch();
        try {
            for (const row of rows) {
                const current = people.find(item => Core.normalizeCI(item.ci) === row.ci);
                const client = clientFrom(row.client);
                const branch = branchFrom(row.branch, client.id);
                const next = {
                    ...current,
                    id: current?.id || String(A.createId()),
                    ci: row.ci,
                    fullName: row.fullName,
                    clockId: row.clockId,
                    clientId: client.id,
                    branchId: branch?.id || "",
                    area: row.area,
                    position: row.position,
                    startDate: row.startDate || current?.startDate || A.localDate(),
                    status: normalizeStatus(row.status),
                    active: normalizeStatus(row.status) === "active",
                    workerType: normalizeWorkerType(row.workerType),
                    createdAt: current?.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const operated = O.recordPersonChange(current, next, {
                    effectiveFrom: row.startDate || A.localDate(),
                    reason: current ? `Actualización masiva · ${stage.fileName}` : "Alta por importación masiva"
                });
                people = current ? people.map(item => item.id === current.id ? operated : item) : [operated, ...people];
                processed += 1;
            }
            O.endBatch();
        } catch (error) {
            O.cancelBatch();
            throw error;
        }
        A.writeJSON("atlasHRPeople", people);
        window.dispatchEvent(new CustomEvent("atlas:hr-data-changed", { detail: { type: "people-import" } }));
        return processed;
    }

    async function processClients(rows) {
        rows.forEach(row => {
            const existing = C.company.clients.find(item => Core.clean(item.name) === Core.clean(row.name));
            C.upsertClient({ ...existing, name: row.name, costCenter: row.costCenter, workplace: row.workplace, detail: row.detail });
        });
        return rows.length;
    }

    async function processBranches(rows) {
        rows.forEach(row => {
            const client = clientFrom(row.client);
            const existing = branchFrom(row.name, client.id);
            O.upsertBranch({ ...existing, clientId: client.id, name: row.name, code: row.code, city: row.city, address: row.address });
        });
        return rows.length;
    }

    async function processAssignments(rows) {
        rows.forEach(row => {
            const person = personFromCI(row.ci);
            const client = clientFrom(row.client);
            const branch = branchFrom(row.branch, client.id);
            const schedule = scheduleFrom(row.schedule);
            const area = row.area ? O.areas.find(item => Core.clean(item.name) === Core.clean(row.area)) || O.upsertCatalog("area", { name: row.area }) : null;
            const position = row.position ? O.positions.find(item => Core.clean(item.name) === Core.clean(row.position)) || O.upsertCatalog("position", { name: row.position }) : null;
            O.transfer(person.id, {
                clientId: client.id,
                branchId: branch?.id || "",
                areaId: area?.id || "",
                positionId: position?.id || "",
                supervisorId: personFromCI(row.supervisorCI)?.id || "",
                scheduleId: schedule?.id || "",
                effectiveFrom: row.from,
                reason: row.note || `Asignación importada · ${stage.fileName}`,
                note: row.note
            });
        });
        return rows.length;
    }

    async function processSchedules(rows) {
        let schedules = A.readArray("atlasHRSchedules");
        rows.forEach(row => {
            const existing = scheduleFrom(row.name);
            const revision = {
                id: String(A.createId()), effectiveFrom: row.effectiveFrom, note: `Importado desde ${stage.fileName}`,
                rules: parseDays(row.days).map(day => ({ day, active: true, start: row.start, end: row.end, breakMinutes: row.breakMinutes, tolerance: row.tolerance })),
                createdAt: new Date().toISOString()
            };
            if (existing) {
                const same = (existing.revisions || []).find(item => item.effectiveFrom === row.effectiveFrom);
                if (same) Object.assign(same, revision, { id: same.id }); else existing.revisions = [...(existing.revisions || []), revision];
                existing.updatedAt = new Date().toISOString();
            } else schedules.push({ id: String(A.createId()), name: row.name, active: true, revisions: [revision], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        });
        A.writeJSON("atlasHRSchedules", schedules);
        window.dispatchEvent(new CustomEvent("atlas:hr-data-changed", { detail: { type: "schedules" } }));
        return rows.length;
    }

    async function processAttendance(rows) {
        const byPeriod = new Map();
        rows.forEach(row => {
            const person = personFromCI(row.ci) || A.readArray("atlasHRPeople").find(item => String(item.clockId) === String(row.clockId));
            const assignment = O.currentAssignment(person.id, row.date);
            const item = {
                id: String(A.createId()), employeeId: person.id, clientId: assignment?.clientId || person.clientId,
                branchId: assignment?.branchId || person.branchId || "", assignmentId: assignment?.id || "",
                clockId: person.clockId || row.clockId, sourceName: person.fullName, date: row.date, in: row.in, out: row.out,
                rawStatus: Core.clean(row.status) === "falta" ? "FALTA" : "", resolvedStatus: Core.clean(row.status) === "falta" ? "" : row.status,
                sourceImportId: stage.hash.slice(0, 36), updatedAt: new Date().toISOString()
            };
            const period = row.date.slice(0, 7);
            if (!byPeriod.has(period)) byPeriod.set(period, []);
            byPeriod.get(period).push(item);
        });
        for (const [period, records] of byPeriod) await window.AtlasHRStorage.upsertMonth(C.active.companyId, period, records);
        return rows.length;
    }

    const newsTypes = { ausencia: "other", reposo: "medical", permiso: "permission", maternidad: "maternity", vacaciones: "vacation", suspension: "suspension", tardanza: "late", salidaanticipada: "early", horaextra: "overtime", bonificacion: "bonus", descuento: "deduction" };

    async function processNews(rows) {
        let news = A.readArray("atlasHRAbsences");
        rows.forEach(row => {
            const person = personFromCI(row.ci);
            const assignment = O.currentAssignment(person.id, row.startDate);
            const key = Core.naturalKey("news", row);
            const existing = news.find(item => Core.naturalKey("news", { ci: person.ci, type: item.type, startDate: item.startDate, endDate: item.endDate }) === key);
            const item = {
                ...existing, id: existing?.id || String(A.createId()), employeeId: person.id,
                clientId: assignment?.clientId || person.clientId, branchId: assignment?.branchId || person.branchId || "", assignmentId: assignment?.id || "",
                type: newsTypes[Core.clean(row.type)] || "other", startDate: row.startDate, endDate: row.endDate,
                returnDate: row.returnDate || Core.addDays(row.endDate, 1), hours: Number(row.hours || 0), note: row.note,
                documentRef: row.documentRef, status: "pending", impact: ["bonus", "deduction", "overtime"].includes(newsTypes[Core.clean(row.type)]) ? "payroll" : "attendance",
                responsible: window.AtlasStore?.userId || "local-admin", createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            news = existing ? news.map(entry => entry.id === existing.id ? item : entry) : [item, ...news];
            O.appendAudit({ entityType: "news", entityId: item.id, action: existing ? "update" : "create", reason: `Importación masiva · ${stage.fileName}`, clientId: item.clientId, branchId: item.branchId, changes: Core.diff(existing || {}, item, ["type", "startDate", "endDate", "returnDate", "hours", "status"]) });
        });
        A.writeJSON("atlasHRAbsences", news);
        window.dispatchEvent(new CustomEvent("atlas:hr-data-changed", { detail: { type: "absences" } }));
        return rows.length;
    }

    const processors = { people: processPeople, clients: processClients, branches: processBranches, assignments: processAssignments, schedules: processSchedules, attendance: processAttendance, news: processNews };

    async function processStage() {
        if (!stage || stage.rows.some(item => item.issues.length) || stage.duplicate) return;
        const started = performance.now();
        q("#hrImportConfirm").disabled = true;
        q("#hrImportConfirm").textContent = "Procesando…";
        try {
            const rows = cleanRows();
            const processed = await processors[stage.type](rows);
            const warnings = stage.rows.filter(item => item.warnings.length).length;
            const jobs = A.readArray(Core.KEYS.imports);
            const job = {
                id: String(A.createId()), type: stage.type, fileName: stage.fileName, hash: stage.hash,
                status: "PROCESADO", userId: window.AtlasStore?.userId || "local-admin", createdAt: new Date().toISOString(),
                companyId: C.active.companyId, clientId: C.active.clientId === "all" ? "" : C.active.clientId,
                branchId: C.active.branchId === "all" ? "" : C.active.branchId, total: rows.length, valid: rows.length,
                warnings, errors: 0, processed, skipped: 0, durationMs: Math.round(performance.now() - started), mapping: stage.mapping
            };
            jobs.unshift(job);
            A.writeJSON(Core.KEYS.imports, jobs);
            O.appendAudit({ entityType: "import", entityId: job.id, action: "process", reason: `${Core.IMPORT_SCHEMAS[stage.type].label} · ${stage.fileName}`, changes: [{ field: "processed", before: 0, after: processed }] });
            window.dispatchEvent(new CustomEvent("atlas:hr-import-completed", { detail: job }));
            q("#hrImportResultFinal").innerHTML = `<strong>Importación completada.</strong><span>${processed.toLocaleString("es-PY")} registro(s) procesados en ${job.durationMs.toLocaleString("es-PY")} ms.</span><small>Hash ${stage.hash}</small>`;
            q("#hrImportResultFinal").hidden = false;
            A.notify("Importación masiva completada y auditada.");
            stage = null;
            q("#hrImportWorkspace").hidden = true;
        } catch (error) {
            A.notify(error.message || "No se pudo procesar la importación.", "error");
            q("#hrImportConfirm").disabled = false;
        } finally {
            q("#hrImportConfirm").textContent = "Confirmar y procesar";
        }
    }

    function downloadErrors() {
        if (!stage) return;
        const rows = stage.rows.filter(item => item.issues.length).map(item => ({ Fila: item.sourceRow, Errores: item.issues.join(" | "), Advertencias: item.warnings.join(" | ") }));
        if (!rows.length) return;
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "ERRORES");
        XLSX.writeFile(workbook, `ATLAS_ERRORES_${stage.type}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    function renderHistory() {
        const target = q("#hrImportHistory");
        if (!target) return;
        const jobs = A.readArray(Core.KEYS.imports).slice(0, 100);
        target.innerHTML = jobs.length ? `<table class="hr-simple-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Archivo</th><th>Filas</th><th>Errores</th><th>Duración</th><th>Estado</th></tr></thead><tbody>${jobs.map(item => `<tr><td>${esc(new Date(item.createdAt || item.importedAt).toLocaleString("es-PY"))}</td><td>${esc(Core.IMPORT_SCHEMAS[item.type]?.label || item.type || "Marcaciones")}</td><td>${esc(item.fileName || "Importación anterior")}</td><td>${Number(item.total || item.rows || 0).toLocaleString("es-PY")}</td><td>${Number(item.errors || 0)}</td><td>${Number(item.durationMs || 0).toLocaleString("es-PY")} ms</td><td>${esc(item.status || "PROCESADO")}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state">Todavía no hay importaciones registradas.</div>';
    }

    q("#hrImportHubFile")?.addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try { await readFile(file); A.notify("Archivo analizado. Revisá el mapeo y la vista previa."); }
        catch (error) { stage = null; q("#hrImportWorkspace").hidden = true; A.notify(error.message, "error"); }
        finally { event.target.value = ""; }
    });
    q("#hrImportType")?.addEventListener("change", () => {
        if (!stage) return;
        stage.mapping = Core.autoMap(stage.headers, q("#hrImportType").value);
        stageRows();
    });
    q("#hrImportMapping")?.addEventListener("change", event => {
        const select = event.target.closest("[data-map-field]");
        if (!select || !stage) return;
        stage.mapping[select.dataset.mapField] = select.value;
        stageRows();
    });
    q("#hrImportCancelHub")?.addEventListener("click", () => { stage = null; q("#hrImportWorkspace").hidden = true; });
    q("#hrImportConfirm")?.addEventListener("click", processStage);
    q("#hrImportDownloadErrors")?.addEventListener("click", downloadErrors);
    window.addEventListener("atlas:hr-import-completed", renderHistory);

    renderHistory();

    window.AtlasHRBulkImport = { hashBuffer, workbookData, readFile, processStage, renderHistory };
})();
