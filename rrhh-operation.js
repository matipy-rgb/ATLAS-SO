(function () {
    "use strict";

    const A = window.Atlas;
    const C = window.AtlasHRContext;
    const Core = window.AtlasHRV09Core;
    if (!A || !C || !Core) throw new Error("ATLAS RR. HH. no pudo iniciar su modelo operativo.");

    const q = selector => document.querySelector(selector);
    const esc = A.escapeHTML;
    const KEYS = Core.KEYS;
    const MIGRATION_KEY = "atlasHRMigrationV09";
    const today = () => A.localDate();
    const now = () => new Date().toISOString();
    const userId = () => String(window.AtlasStore?.userId || "local-admin");
    const createId = () => String(A.createId());
    const INHERITED_PARAMETER_SEED = Object.freeze({
        monthlyHours: 240,
        dailyHours: 8,
        nightPremium: 0.30,
        extraDayMultiplier: 1.50,
        extraNightMultiplier: 2,
        sundayHolidayMultiplier: 2,
        sundayHolidayNightMultiplier: 2.60,
        absenceDivisor: 30
    });

    let branches = A.readArray(KEYS.branches).map(Core.normalizeBranch);
    let areas = A.readArray(KEYS.areas).map(item => Core.normalizeCatalog(item, "area"));
    let positions = A.readArray(KEYS.positions).map(item => Core.normalizeCatalog(item, "position"));
    let assignments = A.readArray(KEYS.assignments).map(Core.normalizeAssignment);
    let audit = A.readArray(KEYS.audit).map(Core.auditEvent);
    let importJobs = A.readArray(KEYS.imports);
    let parameters = A.readArray(KEYS.parameters);
    let batchDepth = 0;
    let batchSnapshot = null;
    const dirtyKeys = new Set();

    function save(key, value, eventType = key) {
        if (batchDepth) {
            dirtyKeys.add(key);
            return;
        }
        A.writeJSON(key, value);
        window.dispatchEvent(new CustomEvent("atlas:hr-operation-changed", { detail: { type: eventType } }));
    }

    function beginBatch() {
        if (!batchDepth) batchSnapshot = {
            branches: structuredClone(branches), areas: structuredClone(areas), positions: structuredClone(positions),
            assignments: structuredClone(assignments), audit: structuredClone(audit), importJobs: structuredClone(importJobs),
            parameters: structuredClone(parameters)
        };
        batchDepth += 1;
    }

    function endBatch() {
        batchDepth = Math.max(0, batchDepth - 1);
        if (batchDepth) return;
        const values = {
            [KEYS.branches]: branches,
            [KEYS.areas]: areas,
            [KEYS.positions]: positions,
            [KEYS.assignments]: assignments,
            [KEYS.audit]: audit,
            [KEYS.imports]: importJobs,
            [KEYS.parameters]: parameters
        };
        dirtyKeys.forEach(key => A.writeJSON(key, values[key]));
        if (dirtyKeys.size) window.dispatchEvent(new CustomEvent("atlas:hr-operation-changed", { detail: { type: "batch" } }));
        dirtyKeys.clear();
        batchSnapshot = null;
    }

    function cancelBatch() {
        if (batchSnapshot) {
            ({ branches, areas, positions, assignments, audit, importJobs, parameters } = batchSnapshot);
        }
        batchDepth = 0;
        dirtyKeys.clear();
        batchSnapshot = null;
    }

    function appendAudit(input) {
        const entry = Core.auditEvent({
            ...input,
            companyId: C.active.companyId,
            clientId: input.clientId || (C.active.clientId === C.GENERAL_ID ? "" : C.active.clientId),
            branchId: input.branchId || (C.active.branchId === C.GENERAL_ID ? "" : C.active.branchId),
            userId: userId()
        });
        audit.unshift(entry);
        save(KEYS.audit, audit, "audit");
        return entry;
    }

    function catalogByName(list, value) {
        const wanted = Core.clean(value);
        return list.find(item => Core.clean(item.name) === wanted) || null;
    }

    function ensureCatalog(kind, name, clientId = "", branchId = "") {
        if (!String(name || "").trim()) return "";
        const list = kind === "area" ? areas : positions;
        const existing = catalogByName(list, name);
        if (existing) return existing.id;
        const item = Core.normalizeCatalog({
            id: createId(),
            name,
            clientId,
            branchId,
            createdAt: now(),
            updatedAt: now()
        }, kind);
        list.push(item);
        save(kind === "area" ? KEYS.areas : KEYS.positions, list, kind);
        return item.id;
    }

    function migrateV09() {
        const marker = A.readJSON(MIGRATION_KEY, null);
        const storedPeople = A.readArray("atlasHRPeople");
        const scheduleAssignments = A.readArray("atlasHRScheduleAssignments");
        const existingEmployeeIds = new Set(assignments.map(item => item.employeeId));
        let changedPeople = false;
        const people = storedPeople.map(person => {
            const next = { ...person };
            if (!next.positionId && next.position) next.positionId = ensureCatalog("position", next.position, next.clientId, next.branchId);
            if (!next.areaId && (next.area || next.department)) next.areaId = ensureCatalog("area", next.area || next.department, next.clientId, next.branchId);
            if (!Object.prototype.hasOwnProperty.call(next, "branchId")) next.branchId = "";
            if (next.positionId !== person.positionId || next.areaId !== person.areaId || next.branchId !== person.branchId) changedPeople = true;
            if (!existingEmployeeIds.has(String(next.id)) && next.clientId) {
                const schedule = scheduleAssignments
                    .filter(item => String(item.employeeId) === String(next.id))
                    .sort((a, b) => String(b.from).localeCompare(String(a.from)))[0];
                assignments.push(Core.normalizeAssignment({
                    id: createId(),
                    employeeId: next.id,
                    clientId: next.clientId,
                    branchId: next.branchId,
                    areaId: next.areaId,
                    positionId: next.positionId,
                    scheduleId: schedule?.scheduleId || "",
                    from: next.startDate || today(),
                    status: next.status === "active" ? "active" : "historical",
                    to: next.status === "active" ? "" : next.endDate,
                    reason: "Migración controlada desde v0.8",
                    changedBy: userId()
                }));
                existingEmployeeIds.add(String(next.id));
            }
            return next;
        });
        if (changedPeople) A.writeJSON("atlasHRPeople", people);
        save(KEYS.branches, branches, "branches");
        save(KEYS.areas, areas, "areas");
        save(KEYS.positions, positions, "positions");
        save(KEYS.assignments, assignments, "assignments");
        if (!parameters.length) {
            parameters = [{
                id: createId(),
                version: 1,
                effectiveFrom: "2000-01-01",
                effectiveTo: "",
                source: "Valores heredados de v0.8; la administración debe verificar su vigencia legal antes de utilizarlos.",
                note: "Configuración inicial migrada, pendiente de verificación.",
                status: "review_required",
                values: { ...INHERITED_PARAMETER_SEED },
                createdAt: now(),
                createdBy: userId()
            }];
            save(KEYS.parameters, parameters, "parameters");
        }
        if (!marker) {
            appendAudit({
                entityType: "system",
                entityId: "v0.9-migration",
                action: "migration",
                reason: "Separación de identidad y asignación operativa",
                changes: [{ field: "assignments", before: 0, after: assignments.length }]
            });
            A.writeJSON(MIGRATION_KEY, { version: "0.9.0", at: now(), employees: people.length, assignments: assignments.length });
        }
    }

    function activeParameters(date = today()) {
        return parameters
            .filter(item => item.effectiveFrom <= date && (!item.effectiveTo || item.effectiveTo >= date))
            .sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)) || Number(b.version || 0) - Number(a.version || 0))[0] || null;
    }

    function saveParameterVersion(input) {
        const effectiveFrom = Core.isoDate(input.effectiveFrom);
        if (!effectiveFrom) throw new Error("Indicá una fecha de vigencia válida.");
        if (!String(input.source || "").trim()) throw new Error("Indicá la fuente u observación legal.");
        const values = Object.fromEntries(Object.keys(INHERITED_PARAMETER_SEED).map(key => {
            const value = Number(input.values?.[key]);
            if (!Number.isFinite(value) || value < 0) throw new Error("Todos los parámetros deben ser números válidos no negativos.");
            return [key, value];
        }));
        parameters = parameters.map(item => item.effectiveFrom < effectiveFrom && (!item.effectiveTo || item.effectiveTo >= effectiveFrom)
            ? { ...item, effectiveTo: Core.addDays(effectiveFrom, -1) }
            : item);
        const next = {
            id: createId(),
            version: Math.max(0, ...parameters.map(item => Number(item.version || 0))) + 1,
            effectiveFrom,
            effectiveTo: "",
            source: String(input.source).trim(),
            note: String(input.note || "").trim(),
            status: "verified",
            values,
            createdAt: now(),
            createdBy: userId()
        };
        parameters = [next, ...parameters];
        save(KEYS.parameters, parameters, "parameters");
        appendAudit({
            entityType: "parameter",
            entityId: next.id,
            action: "version",
            reason: "Nueva vigencia de parámetros legales",
            changes: [{ field: "version", before: next.version - 1 || "", after: next.version }]
        });
        return next;
    }

    function branchById(id) {
        return branches.find(item => String(item.id) === String(id)) || null;
    }

    function areaById(id) {
        return areas.find(item => String(item.id) === String(id)) || null;
    }

    function positionById(id) {
        return positions.find(item => String(item.id) === String(id)) || null;
    }

    function currentAssignment(employeeId, date = today()) {
        return Core.assignmentAt(assignments, employeeId, date);
    }

    function resolvePerson(person, date = today()) {
        const assignment = currentAssignment(person?.id, date);
        return {
            ...person,
            clientId: assignment?.clientId || person?.clientId || "",
            branchId: assignment?.branchId || person?.branchId || "",
            areaId: assignment?.areaId || person?.areaId || "",
            positionId: assignment?.positionId || person?.positionId || "",
            supervisorId: assignment?.supervisorId || person?.supervisorId || "",
            scheduleId: assignment?.scheduleId || person?.scheduleId || "",
            assignment
        };
    }

    function assertAssignmentContext(data) {
        if (!data.clientId || !C.clientById(data.clientId)) throw new Error("Seleccioná un cliente válido.");
        if (data.branchId) {
            const branch = branchById(data.branchId);
            if (!branch || branch.clientId !== data.clientId) throw new Error("La sucursal no pertenece al cliente seleccionado.");
        }
        if (data.supervisorId && data.supervisorId === data.id) throw new Error("Una persona no puede supervisarse a sí misma.");
    }

    function recordPersonChange(before, after, options = {}) {
        const next = { ...after };
        next.positionId = next.positionId || ensureCatalog("position", next.position, next.clientId, next.branchId);
        next.areaId = next.areaId || ensureCatalog("area", next.area, next.clientId, next.branchId);
        assertAssignmentContext(next);
        const previousResolved = before ? resolvePerson(before, options.effectiveFrom) : null;
        const transition = Core.transitionAssignments(assignments, previousResolved, next, {
            effectiveFrom: options.effectiveFrom || next.startDate || today(),
            reason: before ? options.reason : "Alta inicial",
            note: options.note,
            userId: userId(),
            createId
        });
        if (transition.changed) {
            assignments = transition.assignments;
            save(KEYS.assignments, assignments, "assignments");
            appendAudit({
                entityType: "assignment",
                entityId: transition.created.id,
                action: before ? "transfer" : "assign",
                reason: transition.created.reason,
                clientId: transition.created.clientId,
                branchId: transition.created.branchId,
                changes: Core.diff(transition.closed || {}, transition.created, ["clientId", "branchId", "areaId", "positionId", "supervisorId", "scheduleId", "from", "to"])
            });
        }
        const employeeChanges = Core.diff(before || {}, next, [
            "ci", "fullName", "clockId", "status", "workerType", "salary", "startDate", "endDate",
            "birthDate", "sex", "civilStatus", "nationality", "profession", "city", "address", "phone", "email"
        ]);
        if (employeeChanges.length) appendAudit({
            entityType: "employee",
            entityId: next.id,
            action: before ? "update" : "create",
            reason: options.reason || (before ? "Actualización de legajo" : "Alta de funcionario"),
            clientId: next.clientId,
            branchId: next.branchId,
            changes: employeeChanges
        });
        return { ...next, positionId: next.positionId, areaId: next.areaId };
    }

    function updatePersonCache(employeeId, assignment) {
        const people = A.readArray("atlasHRPeople").map(person => String(person.id) === String(employeeId) ? {
            ...person,
            clientId: assignment.clientId,
            branchId: assignment.branchId,
            areaId: assignment.areaId,
            positionId: assignment.positionId,
            supervisorId: assignment.supervisorId,
            scheduleId: assignment.scheduleId,
            position: positionById(assignment.positionId)?.name || person.position,
            updatedAt: now()
        } : person);
        A.writeJSON("atlasHRPeople", people);
        window.dispatchEvent(new CustomEvent("atlas:hr-data-changed", { detail: { type: "people-import" } }));
    }

    function transfer(employeeId, data) {
        const people = A.readArray("atlasHRPeople");
        const person = people.find(item => String(item.id) === String(employeeId));
        if (!person) throw new Error("Funcionario no encontrado.");
        const before = resolvePerson(person, data.effectiveFrom);
        const after = { ...person, ...data, id: person.id };
        assertAssignmentContext(after);
        const transition = Core.transitionAssignments(assignments, before, after, {
            effectiveFrom: data.effectiveFrom,
            reason: data.reason,
            note: data.note,
            userId: userId(),
            createId
        });
        if (!transition.changed) throw new Error("La nueva asignación es igual a la vigente.");
        assignments = transition.assignments;
        save(KEYS.assignments, assignments, "assignments");
        updatePersonCache(person.id, transition.created);
        appendAudit({
            entityType: "assignment",
            entityId: transition.created.id,
            action: "transfer",
            reason: data.reason,
            clientId: transition.created.clientId,
            branchId: transition.created.branchId,
            changes: Core.diff(transition.closed || {}, transition.created, ["clientId", "branchId", "areaId", "positionId", "supervisorId", "scheduleId", "from", "to"])
        });
        return transition.created;
    }

    function upsertBranch(input) {
        if (!C.clientById(input.clientId)) throw new Error("Seleccioná un cliente válido.");
        const duplicate = branches.find(item => item.id !== input.id && item.clientId === input.clientId && Core.clean(item.name) === Core.clean(input.name));
        if (duplicate) throw new Error("Ya existe una sucursal con ese nombre para el cliente.");
        const existing = branches.find(item => item.id === input.id);
        const next = Core.normalizeBranch({ ...existing, ...input, id: existing?.id || createId(), updatedAt: now() });
        branches = existing ? branches.map(item => item.id === existing.id ? next : item) : [next, ...branches];
        save(KEYS.branches, branches, "branches");
        appendAudit({
            entityType: "branch",
            entityId: next.id,
            action: existing ? "update" : "create",
            reason: existing ? "Actualización de sucursal" : "Alta de sucursal",
            clientId: next.clientId,
            branchId: next.id,
            changes: Core.diff(existing || {}, next, ["name", "code", "city", "address", "costCenter", "active"])
        });
        return next;
    }

    function upsertCatalog(kind, input) {
        const key = kind === "area" ? KEYS.areas : KEYS.positions;
        let list = kind === "area" ? areas : positions;
        const duplicate = list.find(item => item.id !== input.id && Core.clean(item.name) === Core.clean(input.name));
        if (duplicate) throw new Error(`Ya existe ${kind === "area" ? "un área" : "un cargo"} con ese nombre.`);
        const existing = list.find(item => item.id === input.id);
        const next = Core.normalizeCatalog({ ...existing, ...input, id: existing?.id || createId(), updatedAt: now() }, kind);
        list = existing ? list.map(item => item.id === existing.id ? next : item) : [next, ...list];
        if (kind === "area") areas = list; else positions = list;
        save(key, list, kind);
        appendAudit({
            entityType: kind,
            entityId: next.id,
            action: existing ? "update" : "create",
            reason: existing ? "Actualización de catálogo" : "Alta de catálogo",
            changes: Core.diff(existing || {}, next, ["name", "code", "active"])
        });
        return next;
    }

    function toggleBranch(id) {
        const item = branchById(id);
        if (!item) return;
        const active = item.active === false;
        branches = branches.map(branch => branch.id === id ? { ...branch, active, updatedAt: now() } : branch);
        save(KEYS.branches, branches, "branches");
        appendAudit({
            entityType: "branch", entityId: id, action: active ? "restore" : "archive",
            reason: active ? "Reactivación de sucursal" : "Archivo de sucursal sin borrar historial",
            clientId: item.clientId, branchId: id, changes: Core.diff(item, { ...item, active }, ["active"])
        });
    }

    function toggleCatalog(kind, id) {
        const key = kind === "area" ? KEYS.areas : KEYS.positions;
        const list = kind === "area" ? areas : positions;
        const item = list.find(record => record.id === id);
        if (!item) return;
        const active = item.active === false;
        const next = list.map(record => record.id === id ? { ...record, active, updatedAt: now() } : record);
        if (kind === "area") areas = next; else positions = next;
        save(key, next, kind);
        appendAudit({
            entityType: kind, entityId: id, action: active ? "restore" : "archive",
            reason: active ? "Reactivación de catálogo" : "Archivo de catálogo sin borrar historial",
            changes: Core.diff(item, { ...item, active }, ["active"])
        });
    }

    function clientOptions(selected = "") {
        return `<option value="">Seleccionar cliente</option>${C.company.clients.filter(item => item.active !== false).map(item => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.name)}</option>`).join("")}`;
    }

    function branchOptions(clientId, selected = "", allowAll = false) {
        const list = branches.filter(item => item.active !== false && (!clientId || item.clientId === clientId));
        return `${allowAll ? '<option value="all">Todas las sucursales</option>' : '<option value="">Sin sucursal</option>'}${list.map(item => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.name)}</option>`).join("")}`;
    }

    function catalogOptions(list, selected = "", empty = "Sin asignar") {
        return `<option value="">${esc(empty)}</option>${list.filter(item => item.active !== false).map(item => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.name)}</option>`).join("")}`;
    }

    function peopleOptions(selected = "", includeSelf = true) {
        return `<option value="">Sin supervisor</option>${A.readArray("atlasHRPeople").filter(item => item.status === "active" && (includeSelf || item.id !== selected)).sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "es")).map(item => `<option value="${esc(item.id)}">${esc(item.fullName)} · CI ${esc(item.ci)}</option>`).join("")}`;
    }

    function scheduleOptions(selected = "") {
        return `<option value="">Sin horario</option>${A.readArray("atlasHRSchedules").filter(item => item.active !== false).map(item => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.name)}</option>`).join("")}`;
    }

    function renderBranchContext() {
        const button = q("#hrChangeBranch");
        if (button) {
            button.disabled = C.isGeneral;
            button.textContent = C.branch ? `Sucursal: ${C.branch.name}` : C.isGeneral ? "Elegí un cliente" : "Todas las sucursales";
        }
        const target = q("#hrBranchContextList");
        if (!target) return;
        const list = branches.filter(item => item.active !== false && item.clientId === C.active.clientId);
        target.innerHTML = C.isGeneral ? '<div class="empty-state">Primero elegí un cliente.</div>' : `
            <button type="button" class="hr-scope-choice ${C.active.branchId === C.GENERAL_ID ? "selected" : ""}" data-select-branch="all"><strong>Todas las sucursales</strong><small>Vista consolidada del cliente</small></button>
            ${list.map(item => `<button type="button" class="hr-scope-choice ${C.active.branchId === item.id ? "selected" : ""}" data-select-branch="${esc(item.id)}"><strong>${esc(item.name)}</strong><small>${esc(item.city || item.code || "Sucursal operativa")}</small></button>`).join("")}
            ${list.length ? "" : '<div class="empty-state">Este cliente todavía no tiene sucursales. Podés crear la primera en Operación.</div>'}`;
    }

    function renderStructure() {
        if (!q("#hrBranchList")) return;
        q("#hrBranchClient").innerHTML = clientOptions(q("#hrBranchClient").value || (C.isGeneral ? "" : C.active.clientId));
        const visibleBranches = C.isGeneral ? branches : branches.filter(item => item.clientId === C.active.clientId);
        q("#hrBranchList").innerHTML = visibleBranches.length ? visibleBranches.map(item => `<article class="hr-structure-card ${item.active === false ? "archived" : ""}"><div><small>${esc(C.clientById(item.clientId)?.name || "Cliente")}${item.active === false ? " · Archivada" : ""}</small><strong>${esc(item.name)}</strong><span>${esc([item.code, item.city, item.address].filter(Boolean).join(" · ") || "Sin detalle")}</span></div><span class="hr-structure-actions"><button data-edit-branch="${esc(item.id)}" type="button">Editar</button><button data-toggle-branch="${esc(item.id)}" type="button">${item.active === false ? "Reactivar" : "Archivar"}</button></span></article>`).join("") : '<div class="empty-state">No hay sucursales en este alcance.</div>';
        q("#hrAreaList").innerHTML = areas.length ? areas.map(item => `<span class="${item.active === false ? "archived" : ""}">${esc(item.name)}${item.active === false ? " · archivada" : ""} <button data-edit-area="${esc(item.id)}" type="button" aria-label="Editar área">✎</button><button data-toggle-area="${esc(item.id)}" type="button">${item.active === false ? "Reactivar" : "Archivar"}</button></span>`).join("") : '<small>Sin áreas.</small>';
        q("#hrPositionList").innerHTML = positions.length ? positions.map(item => `<span class="${item.active === false ? "archived" : ""}">${esc(item.name)}${item.active === false ? " · archivado" : ""} <button data-edit-position="${esc(item.id)}" type="button" aria-label="Editar cargo">✎</button><button data-toggle-position="${esc(item.id)}" type="button">${item.active === false ? "Reactivar" : "Archivar"}</button></span>`).join("") : '<small>Sin cargos.</small>';
    }

    function assignmentLabel(item) {
        return [C.clientById(item.clientId)?.name, branchById(item.branchId)?.name, areaById(item.areaId)?.name, positionById(item.positionId)?.name].filter(Boolean).join(" · ") || "Sin estructura";
    }

    function renderAssignments() {
        const target = q("#hrOperationalAssignments");
        if (!target) return;
        const people = A.readArray("atlasHRPeople");
        const visible = Core.scopePeople(people, assignments, C.active, today()).sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "es"));
        target.innerHTML = visible.length ? `<table class="hr-simple-table"><thead><tr><th>Funcionario</th><th>Asignación vigente</th><th>Desde</th><th>Supervisor</th><th>Horario</th><th></th></tr></thead><tbody>${visible.map(person => {
            const current = currentAssignment(person.id);
            const supervisor = people.find(item => item.id === current?.supervisorId);
            const schedule = A.readArray("atlasHRSchedules").find(item => item.id === current?.scheduleId);
            return `<tr><td><strong>${esc(person.fullName)}</strong><small>CI ${esc(person.ci)}</small></td><td>${esc(current ? assignmentLabel(current) : "Sin asignación")}</td><td>${esc(current?.from || "—")}</td><td>${esc(supervisor?.fullName || "—")}</td><td>${esc(schedule?.name || "—")}</td><td><button data-transfer-person="${esc(person.id)}" type="button">Trasladar</button></td></tr>`;
        }).join("")}</tbody></table>` : '<div class="empty-state">No hay funcionarios en este alcance.</div>';
    }

    const auditLabels = {
        employee: "Funcionario", assignment: "Asignación", branch: "Sucursal", area: "Área", position: "Cargo", import: "Importación", attendance: "Marcación", news: "Novedad", parameter: "Parámetro", system: "Sistema"
    };

    function percent(value) {
        return `${Math.round(Number(value || 0) * 100)} %`;
    }

    function renderParameters() {
        const current = activeParameters();
        const target = q("#hrRateList");
        if (target) target.innerHTML = current ? `
            <span><small>Nocturnidad ordinaria</small><strong>+${esc(percent(current.values.nightPremium))}</strong></span>
            <span><small>Extra diurna</small><strong>${esc(percent(current.values.extraDayMultiplier - 1))} adicional</strong></span>
            <span><small>Extra nocturna</small><strong>${esc(percent(current.values.extraNightMultiplier - 1))} adicional</strong></span>
            <span><small>Domingo / feriado</small><strong>× ${esc(current.values.sundayHolidayMultiplier)}</strong></span>` : '<small>Sin parámetros vigentes.</small>';
        const status = q("#hrParameterStatus");
        if (status) status.textContent = current
            ? `Versión ${current.version} · vigente desde ${current.effectiveFrom} · ${current.status === "verified" ? "verificada" : "requiere revisión"}`
            : "No existe una versión vigente.";
        const history = q("#hrParameterHistory");
        if (history) history.innerHTML = parameters.length ? `<table class="hr-simple-table"><thead><tr><th>Versión</th><th>Vigencia</th><th>Estado</th><th>Fuente</th><th>Responsable</th></tr></thead><tbody>${parameters
            .slice().sort((a, b) => Number(b.version || 0) - Number(a.version || 0))
            .map(item => `<tr><td>v${esc(item.version)}</td><td>${esc(item.effectiveFrom)} → ${esc(item.effectiveTo || "vigente")}</td><td>${esc(item.status === "verified" ? "Verificada" : "Revisar")}</td><td>${esc(item.source)}</td><td>${esc(item.createdBy || "—")}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state">Sin historial.</div>';
        if (current && q("#hrParameterForm") && !q("#hrParameterFrom").value) {
            const fieldMap = { monthlyHours: "MonthlyHours", dailyHours: "DailyHours", nightPremium: "NightPremium", extraDayMultiplier: "ExtraDay", extraNightMultiplier: "ExtraNight", sundayHolidayMultiplier: "Sunday", sundayHolidayNightMultiplier: "SundayNight", absenceDivisor: "AbsenceDivisor" };
            Object.entries(fieldMap).forEach(([key, suffix]) => { q(`#hrParameter${suffix}`).value = current.values[key]; });
        }
    }

    function renderAudit() {
        const target = q("#hrAuditList");
        if (!target) return;
        const type = q("#hrAuditType")?.value || "all";
        const query = String(q("#hrAuditSearch")?.value || "").toLowerCase();
        const filtered = audit.filter(item => (type === "all" || item.entityType === type)
            && (!query || `${item.reason} ${item.action} ${item.entityId} ${item.userLabel}`.toLowerCase().includes(query))).slice(0, 300);
        target.innerHTML = filtered.length ? `<table class="hr-simple-table"><thead><tr><th>Fecha</th><th>Área</th><th>Acción</th><th>Motivo</th><th>Cambios</th><th>Responsable</th></tr></thead><tbody>${filtered.map(item => `<tr><td>${esc(new Date(item.createdAt).toLocaleString("es-PY"))}</td><td>${esc(auditLabels[item.entityType] || item.entityType)}</td><td>${esc(item.action)}</td><td>${esc(item.reason || "—")}</td><td>${esc(String(item.changes?.length || 0))}</td><td>${esc(item.userLabel)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state">No hay movimientos con estos filtros.</div>';
    }

    function renderMetrics(attendance = window.AtlasHRAttendanceCurrent?.() || []) {
        const target = q("#hrOperationalMetrics");
        if (!target) return;
        const metrics = Core.operationalMetrics({
            today: today(),
            active: C.active,
            people: A.readArray("atlasHRPeople"),
            assignments,
            scheduleAssignments: A.readArray("atlasHRScheduleAssignments"),
            attendance,
            news: A.readArray("atlasHRAbsences"),
            imports: importJobs,
            audit
        });
        const definitions = [
            ["active", "Funcionarios activos", "people"], ["hires", "Altas del mes", "people"], ["exits", "Bajas del mes", "people"],
            ["transfers", "Traslados del mes", "operation"], ["withoutSchedule", "Sin horario", "schedules"], ["incomplete", "Marcaciones incompletas", "schedules"],
            ["absences", "Faltas", "schedules"], ["tardiness", "Tardanzas", "schedules"], ["pendingNews", "Novedades pendientes", "news"],
            ["upcomingVacations", "Vacaciones próximas", "news"], ["importErrors", "Errores de importación", "imports"], ["recentImports", "Importaciones recientes", "imports"]
        ];
        target.innerHTML = definitions.map(([key, label, tab]) => `<button type="button" data-metric-tab="${tab}" data-metric-key="${key}" class="hr-metric-card ${metrics[key] ? "has-value" : ""}"><span>${esc(label)}</span><strong>${Number(metrics[key]).toLocaleString("es-PY")}</strong><small>${metrics[key] ? "Abrir detalle" : "Sin pendientes"}</small></button>`).join("");
    }

    function renderAll() {
        renderBranchContext();
        renderStructure();
        renderAssignments();
        renderAudit();
        renderMetrics();
        renderParameters();
    }

    function openTransfer(employeeId) {
        const person = A.readArray("atlasHRPeople").find(item => String(item.id) === String(employeeId));
        if (!person) return;
        const current = currentAssignment(person.id) || resolvePerson(person);
        const dialog = q("#hrTransferDialog");
        q("#hrTransferEmployeeId").value = person.id;
        q("#hrTransferEmployee").textContent = `${person.fullName} · CI ${person.ci}`;
        q("#hrTransferClient").innerHTML = clientOptions(current.clientId);
        q("#hrTransferBranch").innerHTML = branchOptions(current.clientId, current.branchId);
        q("#hrTransferArea").innerHTML = catalogOptions(areas, current.areaId, "Sin área");
        q("#hrTransferPosition").innerHTML = catalogOptions(positions, current.positionId, "Sin cargo");
        q("#hrTransferSupervisor").innerHTML = peopleOptions(person.id, false);
        q("#hrTransferSupervisor").value = current.supervisorId || "";
        q("#hrTransferSchedule").innerHTML = scheduleOptions(current.scheduleId);
        q("#hrTransferFrom").value = today();
        q("#hrTransferReason").value = "";
        q("#hrTransferNote").value = "";
        dialog.showModal();
    }

    q("#hrChangeBranch")?.addEventListener("click", () => {
        renderBranchContext();
        q("#hrBranchContextDialog")?.showModal();
    });
    q("#hrBranchContextList")?.addEventListener("click", event => {
        const button = event.target.closest("[data-select-branch]");
        if (button) C.select(C.active.companyId, C.active.clientId, button.dataset.selectBranch);
    });
    q("#hrBranchContextClose")?.addEventListener("click", () => q("#hrBranchContextDialog").close());

    q("#hrBranchForm")?.addEventListener("submit", event => {
        event.preventDefault();
        try {
            upsertBranch({
                id: q("#hrBranchId").value,
                clientId: q("#hrBranchClient").value,
                name: q("#hrBranchName").value,
                code: q("#hrBranchCode").value,
                city: q("#hrBranchCity").value,
                address: q("#hrBranchAddress").value
            });
            event.currentTarget.reset();
            q("#hrBranchId").value = "";
            renderAll();
            A.notify("Sucursal guardada.");
        } catch (error) { A.notify(error.message, "error"); }
    });
    q("#hrAreaForm")?.addEventListener("submit", event => {
        event.preventDefault();
        try {
            upsertCatalog("area", { id: q("#hrAreaId").value, name: q("#hrAreaName").value });
            event.currentTarget.reset(); q("#hrAreaId").value = ""; renderAll(); A.notify("Área guardada.");
        } catch (error) { A.notify(error.message, "error"); }
    });
    q("#hrPositionForm")?.addEventListener("submit", event => {
        event.preventDefault();
        try {
            upsertCatalog("position", { id: q("#hrPositionId").value, name: q("#hrPositionName").value });
            event.currentTarget.reset(); q("#hrPositionId").value = ""; renderAll(); A.notify("Cargo guardado.");
        } catch (error) { A.notify(error.message, "error"); }
    });
    q("#hrParameterForm")?.addEventListener("submit", event => {
        event.preventDefault();
        try {
            saveParameterVersion({
                effectiveFrom: q("#hrParameterFrom").value,
                source: q("#hrParameterSource").value,
                note: q("#hrParameterNote").value,
                values: {
                    monthlyHours: q("#hrParameterMonthlyHours").value,
                    dailyHours: q("#hrParameterDailyHours").value,
                    nightPremium: q("#hrParameterNightPremium").value,
                    extraDayMultiplier: q("#hrParameterExtraDay").value,
                    extraNightMultiplier: q("#hrParameterExtraNight").value,
                    sundayHolidayMultiplier: q("#hrParameterSunday").value,
                    sundayHolidayNightMultiplier: q("#hrParameterSundayNight").value,
                    absenceDivisor: q("#hrParameterAbsenceDivisor").value
                }
            });
            q("#hrParameterFrom").value = "";
            q("#hrParameterSource").value = "";
            q("#hrParameterNote").value = "";
            renderAll();
            A.notify("Nueva vigencia guardada sin sobrescribir el historial.");
        } catch (error) { A.notify(error.message, "error"); }
    });
    q("#hrBranchList")?.addEventListener("click", event => {
        const toggle = event.target.closest("[data-toggle-branch]");
        if (toggle) {
            const item = branchById(toggle.dataset.toggleBranch);
            if (item && window.confirm(item.active === false ? "¿Reactivar esta sucursal?" : "¿Archivar esta sucursal? El historial y las asignaciones anteriores se conservarán.")) {
                toggleBranch(item.id); renderAll(); A.notify(item.active === false ? "Sucursal reactivada." : "Sucursal archivada.");
            }
            return;
        }
        const button = event.target.closest("[data-edit-branch]");
        const item = button && branchById(button.dataset.editBranch);
        if (!item) return;
        q("#hrBranchId").value = item.id; q("#hrBranchClient").value = item.clientId; q("#hrBranchName").value = item.name;
        q("#hrBranchCode").value = item.code; q("#hrBranchCity").value = item.city; q("#hrBranchAddress").value = item.address;
    });
    q("#hrAreaList")?.addEventListener("click", event => {
        const toggle = event.target.closest("[data-toggle-area]");
        if (toggle) {
            const item = areaById(toggle.dataset.toggleArea);
            if (item && window.confirm(item.active === false ? "¿Reactivar esta área?" : "¿Archivar esta área sin borrar su historial?")) {
                toggleCatalog("area", item.id); renderAll(); A.notify(item.active === false ? "Área reactivada." : "Área archivada.");
            }
            return;
        }
        const item = areaById(event.target.closest("[data-edit-area]")?.dataset.editArea);
        if (item) { q("#hrAreaId").value = item.id; q("#hrAreaName").value = item.name; }
    });
    q("#hrPositionList")?.addEventListener("click", event => {
        const toggle = event.target.closest("[data-toggle-position]");
        if (toggle) {
            const item = positionById(toggle.dataset.togglePosition);
            if (item && window.confirm(item.active === false ? "¿Reactivar este cargo?" : "¿Archivar este cargo sin borrar su historial?")) {
                toggleCatalog("position", item.id); renderAll(); A.notify(item.active === false ? "Cargo reactivado." : "Cargo archivado.");
            }
            return;
        }
        const item = positionById(event.target.closest("[data-edit-position]")?.dataset.editPosition);
        if (item) { q("#hrPositionId").value = item.id; q("#hrPositionName").value = item.name; }
    });
    q("#hrOperationalAssignments")?.addEventListener("click", event => {
        const button = event.target.closest("[data-transfer-person]");
        if (button) openTransfer(button.dataset.transferPerson);
    });
    q("#hrTransferClient")?.addEventListener("change", event => { q("#hrTransferBranch").innerHTML = branchOptions(event.target.value); });
    q("#hrTransferForm")?.addEventListener("submit", event => {
        event.preventDefault();
        try {
            transfer(q("#hrTransferEmployeeId").value, {
                clientId: q("#hrTransferClient").value,
                branchId: q("#hrTransferBranch").value,
                areaId: q("#hrTransferArea").value,
                positionId: q("#hrTransferPosition").value,
                supervisorId: q("#hrTransferSupervisor").value,
                scheduleId: q("#hrTransferSchedule").value,
                effectiveFrom: q("#hrTransferFrom").value,
                reason: q("#hrTransferReason").value,
                note: q("#hrTransferNote").value
            });
            q("#hrTransferDialog").close(); renderAll(); A.notify("Traslado registrado sin borrar el historial.");
        } catch (error) { A.notify(error.message, "error"); }
    });
    q("#hrTransferCancel")?.addEventListener("click", () => q("#hrTransferDialog").close());
    [q("#hrAuditType"), q("#hrAuditSearch")].forEach(control => control?.addEventListener("input", renderAudit));
    q("#hrOperationalMetrics")?.addEventListener("click", event => {
        const button = event.target.closest("[data-metric-tab]");
        if (!button) return;
        q(`[data-hr-tab="${button.dataset.metricTab}"]`)?.click();
    });
    window.addEventListener("atlas:hr-data-changed", renderAll);
    window.addEventListener("atlas:hr-attendance-loaded", event => renderMetrics(event.detail?.records || []));
    window.addEventListener("atlas:hr-import-completed", () => {
        importJobs = A.readArray(KEYS.imports);
        audit = A.readArray(KEYS.audit).map(Core.auditEvent);
        renderAll();
    });

    migrateV09();

    window.AtlasHROperation = {
        get branches() { return branches; },
        get areas() { return areas; },
        get positions() { return positions; },
        get assignments() { return assignments; },
        get audit() { return audit; },
        get parameters() { return parameters; },
        branchById,
        areaById,
        positionById,
        currentAssignment,
        resolvePerson,
        recordPersonChange,
        transfer,
        upsertBranch,
        upsertCatalog,
        appendAudit,
        activeParameters,
        saveParameterVersion,
        beginBatch,
        endBatch,
        cancelBatch,
        branchOptions,
        catalogOptions,
        renderAll
    };

    renderAll();
})();
