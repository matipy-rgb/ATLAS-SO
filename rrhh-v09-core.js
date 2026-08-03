(function () {
    "use strict";

    const DAY_MS = 86400000;
    const GENERAL_ID = "all";
    const KEYS = Object.freeze({
        branches: "atlasHRBranches",
        areas: "atlasHRAreas",
        positions: "atlasHRPositions",
        assignments: "atlasHRAssignments",
        audit: "atlasHRAuditLog",
        imports: "atlasHRImportJobs",
        parameters: "atlasHRLegalParameters"
    });

    const IMPORT_SCHEMAS = Object.freeze({
        people: {
            label: "Funcionarios",
            columns: [
                ["ci", "Cédula", ["ci", "cedula", "c.i.n°", "documento"], true],
                ["fullName", "Apellidos y nombres", ["apellidos y nombres", "nombre completo", "funcionario", "nombre"], true],
                ["clockId", "ID del reloj", ["id del reloj", "id reloj", "reloj"], false],
                ["client", "Cliente", ["cliente", "centro de costo"], true],
                ["branch", "Sucursal", ["sucursal", "local", "puesto"], false],
                ["area", "Área", ["area", "departamento", "sector"], false],
                ["position", "Cargo", ["cargo", "puesto laboral"], false],
                ["startDate", "Fecha de ingreso", ["fecha de ingreso", "ingreso", "fecha de ingeso"], false],
                ["workerType", "Modalidad", ["modalidad", "modalidad contractual"], false],
                ["status", "Estado", ["estado", "situacion"], false]
            ]
        },
        clients: {
            label: "Clientes",
            columns: [
                ["name", "Cliente", ["cliente", "nombre", "razon social"], true],
                ["costCenter", "Centro de costo", ["centro de costo", "codigo", "cc"], false],
                ["workplace", "Lugar de trabajo", ["lugar de trabajo", "direccion", "domicilio"], false],
                ["detail", "Descripción", ["descripcion", "detalle"], false]
            ]
        },
        branches: {
            label: "Sucursales",
            columns: [
                ["client", "Cliente", ["cliente", "centro de costo"], true],
                ["name", "Sucursal", ["sucursal", "local", "nombre"], true],
                ["code", "Código", ["codigo", "cod", "id sucursal"], false],
                ["city", "Ciudad", ["ciudad", "localidad"], false],
                ["address", "Dirección", ["direccion", "domicilio"], false]
            ]
        },
        assignments: {
            label: "Asignaciones",
            columns: [
                ["ci", "Cédula", ["ci", "cedula", "documento"], true],
                ["client", "Cliente", ["cliente", "centro de costo"], true],
                ["branch", "Sucursal", ["sucursal", "local"], false],
                ["area", "Área", ["area", "departamento", "sector"], false],
                ["position", "Cargo", ["cargo", "puesto"], false],
                ["supervisorCI", "CI supervisor", ["ci supervisor", "supervisor ci"], false],
                ["schedule", "Horario", ["horario", "turno"], false],
                ["from", "Desde", ["desde", "vigente desde", "fecha desde"], true],
                ["to", "Hasta", ["hasta", "vigente hasta", "fecha hasta"], false],
                ["note", "Observación", ["observacion", "motivo", "nota"], false]
            ]
        },
        schedules: {
            label: "Horarios",
            columns: [
                ["name", "Horario", ["horario", "turno", "denominacion"], true],
                ["start", "Entrada", ["entrada", "hora entrada", "desde"], true],
                ["end", "Salida", ["salida", "hora salida", "hasta"], true],
                ["days", "Días", ["dias", "dias laborales"], false],
                ["breakMinutes", "Descanso (min)", ["descanso", "descanso min"], false],
                ["tolerance", "Tolerancia (min)", ["tolerancia", "tolerancia min"], false],
                ["effectiveFrom", "Vigente desde", ["vigente desde", "fecha desde"], true]
            ]
        },
        attendance: {
            label: "Marcaciones",
            columns: [
                ["ci", "Cédula", ["ci", "cedula", "documento"], false],
                ["clockId", "ID del reloj", ["id", "id reloj", "id del reloj"], false],
                ["date", "Fecha", ["fecha", "dia"], true],
                ["in", "Entrada", ["entrada", "hora entrada"], false],
                ["out", "Salida", ["salida", "hora salida"], false],
                ["status", "Estado", ["estado", "clasificacion", "novedad"], false]
            ]
        },
        news: {
            label: "Novedades",
            columns: [
                ["ci", "Cédula", ["ci", "cedula", "documento"], true],
                ["type", "Tipo", ["tipo", "novedad", "concepto"], true],
                ["startDate", "Desde", ["desde", "fecha inicio", "fecha"], true],
                ["endDate", "Hasta", ["hasta", "fecha fin"], true],
                ["returnDate", "Retorno", ["retorno", "reintegro", "fecha retorno"], false],
                ["hours", "Horas", ["horas", "cantidad horas"], false],
                ["note", "Observación", ["observacion", "motivo", "nota"], false],
                ["documentRef", "Respaldo", ["respaldo", "documento", "referencia"], false]
            ]
        }
    });

    function text(value) {
        return String(value ?? "").trim();
    }

    function clean(value) {
        return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function normalizeCI(value) {
        return text(value).replace(/\D/g, "");
    }

    function id(value, prefix = "registro") {
        const normalized = clean(value).slice(0, 45);
        return `${normalized || prefix}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function isoDate(value) {
        if (!value) return "";
        if (value instanceof Date && !Number.isNaN(value.valueOf())) {
            return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
        }
        if (typeof value === "number" && value > 0) {
            const epoch = new Date(Date.UTC(1899, 11, 30));
            return isoDate(new Date(epoch.getTime() + value * DAY_MS));
        }
        const raw = text(value);
        const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
        const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
        if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
        return "";
    }

    function addDays(value, amount) {
        const date = new Date(`${isoDate(value)}T12:00:00`);
        if (Number.isNaN(date.valueOf())) return "";
        date.setDate(date.getDate() + amount);
        return isoDate(date);
    }

    function normalizeBranch(item, now = new Date().toISOString()) {
        return {
            id: text(item?.id) || id(item?.name, "sucursal"),
            clientId: text(item?.clientId),
            name: text(item?.name) || "Sucursal sin nombre",
            code: text(item?.code),
            city: text(item?.city),
            address: text(item?.address),
            costCenter: text(item?.costCenter),
            active: item?.active !== false,
            createdAt: item?.createdAt || now,
            updatedAt: item?.updatedAt || item?.createdAt || now
        };
    }

    function normalizeCatalog(item, kind, now = new Date().toISOString()) {
        return {
            id: text(item?.id) || id(item?.name, kind),
            name: text(item?.name) || (kind === "area" ? "Área sin nombre" : "Cargo sin nombre"),
            code: text(item?.code),
            clientId: text(item?.clientId),
            branchId: text(item?.branchId),
            active: item?.active !== false,
            createdAt: item?.createdAt || now,
            updatedAt: item?.updatedAt || item?.createdAt || now
        };
    }

    function normalizeAssignment(item, now = new Date().toISOString()) {
        const from = isoDate(item?.from || item?.effectiveFrom) || isoDate(new Date());
        const to = isoDate(item?.to || item?.effectiveTo);
        return {
            id: text(item?.id) || id(`${item?.employeeId}-${from}`, "asignacion"),
            employeeId: text(item?.employeeId),
            clientId: text(item?.clientId),
            branchId: text(item?.branchId),
            areaId: text(item?.areaId),
            positionId: text(item?.positionId),
            supervisorId: text(item?.supervisorId),
            scheduleId: text(item?.scheduleId),
            from,
            to,
            status: text(item?.status) || (to ? "historical" : "active"),
            note: text(item?.note),
            reason: text(item?.reason),
            changedBy: text(item?.changedBy),
            createdAt: item?.createdAt || now,
            updatedAt: item?.updatedAt || item?.createdAt || now
        };
    }

    function assignmentAt(assignments, employeeId, date = isoDate(new Date())) {
        const wanted = isoDate(date) || isoDate(new Date());
        return (assignments || []).map(item => normalizeAssignment(item))
            .filter(item => item.employeeId === String(employeeId) && item.from <= wanted && (!item.to || item.to >= wanted))
            .sort((a, b) => b.from.localeCompare(a.from) || b.updatedAt.localeCompare(a.updatedAt))[0] || null;
    }

    function assignmentIndex(assignments, date = isoDate(new Date())) {
        const wanted = isoDate(date) || isoDate(new Date());
        const index = new Map();
        (assignments || []).forEach(raw => {
            const item = normalizeAssignment(raw);
            if (!item.employeeId || item.from > wanted || (item.to && item.to < wanted)) return;
            const previous = index.get(item.employeeId);
            if (!previous || item.from > previous.from || (item.from === previous.from && item.updatedAt > previous.updatedAt)) index.set(item.employeeId, item);
        });
        return index;
    }

    const ASSIGNMENT_FIELDS = ["clientId", "branchId", "areaId", "positionId", "supervisorId", "scheduleId"];

    function personAssignmentData(person) {
        return Object.fromEntries(ASSIGNMENT_FIELDS.map(field => [field, text(person?.[field])]));
    }

    function assignmentChanged(before, after) {
        return ASSIGNMENT_FIELDS.some(field => text(before?.[field]) !== text(after?.[field]));
    }

    function diff(before, after, fields) {
        return (fields || Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})])))
            .filter(field => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after?.[field] ?? null))
            .map(field => ({ field, before: before?.[field] ?? null, after: after?.[field] ?? null }));
    }

    function auditEvent(input, now = new Date().toISOString()) {
        return {
            id: text(input?.id) || id(`${input?.entityType}-${now}`, "auditoria"),
            entityType: text(input?.entityType),
            entityId: text(input?.entityId),
            action: text(input?.action),
            reason: text(input?.reason),
            changes: Array.isArray(input?.changes) ? input.changes : [],
            companyId: text(input?.companyId),
            clientId: text(input?.clientId),
            branchId: text(input?.branchId),
            userId: text(input?.userId),
            userLabel: text(input?.userLabel) || "Cuenta administradora",
            createdAt: input?.createdAt || now
        };
    }

    function transitionAssignments(assignments, beforePerson, afterPerson, options = {}) {
        const now = options.now || new Date().toISOString();
        const effectiveFrom = isoDate(options.effectiveFrom) || isoDate(new Date());
        const existing = (assignments || []).map(item => normalizeAssignment(item, now));
        const current = assignmentAt(existing, afterPerson?.id || beforePerson?.id, effectiveFrom);
        const target = personAssignmentData(afterPerson);
        const hasTarget = Boolean(target.clientId);
        if (!hasTarget || (current && !assignmentChanged(current, target))) {
            return { assignments: existing, current, created: null, closed: null, changed: false };
        }
        if (beforePerson && !text(options.reason)) throw new Error("Indicá el motivo del traslado o cambio de asignación.");
        const employeeId = text(afterPerson?.id || beforePerson?.id);
        let closed = null;
        const nextAssignments = existing.map(item => {
            if (item.employeeId !== employeeId || item.from > effectiveFrom || (item.to && item.to < effectiveFrom)) return item;
            const nextTo = addDays(effectiveFrom, -1);
            if (nextTo < item.from) return item;
            closed = { ...item, to: nextTo, status: "historical", updatedAt: now };
            return closed;
        });
        const created = normalizeAssignment({
            id: options.createId?.() || id(`${employeeId}-${effectiveFrom}`, "asignacion"),
            employeeId,
            ...target,
            from: effectiveFrom,
            status: "active",
            note: options.note,
            reason: options.reason || "Asignación inicial",
            changedBy: options.userId,
            createdAt: now,
            updatedAt: now
        }, now);
        nextAssignments.unshift(created);
        return { assignments: nextAssignments, current: created, created, closed, changed: true };
    }

    function recordContext(record, assignments, date) {
        if (record?.employeeId) return assignmentAt(assignments, record.employeeId, date || record.date || record.startDate);
        if (record?.id) return assignmentAt(assignments, record.id, date);
        return null;
    }

    function matchesContext(record, active, assignments, date) {
        const context = active || {};
        if (!context.companyId) return true;
        const assignment = recordContext(record, assignments, date);
        const clientId = text(record?.clientId || assignment?.clientId);
        const branchId = text(record?.branchId || assignment?.branchId);
        if (context.clientId && context.clientId !== GENERAL_ID && clientId !== context.clientId) return false;
        if (context.branchId && context.branchId !== GENERAL_ID && branchId !== context.branchId) return false;
        return true;
    }

    function scopePeople(people, assignments, active, date) {
        const index = assignmentIndex(assignments, date);
        return (people || []).filter(person => {
            const assignment = index.get(String(person.id));
            const context = active || {};
            const clientId = text(assignment?.clientId || person?.clientId);
            const branchId = text(assignment?.branchId || person?.branchId);
            return (!context.clientId || context.clientId === GENERAL_ID || clientId === context.clientId)
                && (!context.branchId || context.branchId === GENERAL_ID || branchId === context.branchId);
        });
    }

    function comparable(value) {
        if (Array.isArray(value)) return value.map(comparable);
        if (value && typeof value === "object") {
            return Object.fromEntries(Object.keys(value).sort().map(key => [key, comparable(value[key])]));
        }
        return value;
    }

    function stableStringify(value) {
        return JSON.stringify(comparable(value));
    }

    function naturalKey(type, row) {
        if (type === "people") return `ci:${normalizeCI(row.ci)}`;
        if (type === "clients") return `cliente:${clean(row.name || row.client)}`;
        if (type === "branches") return `sucursal:${clean(row.client)}:${clean(row.name)}`;
        if (type === "assignments") return `asignacion:${normalizeCI(row.ci)}:${isoDate(row.from)}:${clean(row.client)}:${clean(row.branch)}`;
        if (type === "schedules") return `horario:${clean(row.name)}:${isoDate(row.effectiveFrom)}`;
        if (type === "attendance") return `marcacion:${normalizeCI(row.ci) || clean(row.clockId)}:${isoDate(row.date)}`;
        if (type === "news") return `novedad:${normalizeCI(row.ci)}:${clean(row.type)}:${isoDate(row.startDate)}:${isoDate(row.endDate)}`;
        return stableStringify(row);
    }

    function autoMap(headers, type) {
        const schema = IMPORT_SCHEMAS[type];
        if (!schema) return {};
        const normalizedHeaders = (headers || []).map(header => ({ header, clean: clean(header) }));
        return Object.fromEntries(schema.columns.map(([field, , aliases]) => {
            const candidates = [field, ...aliases].map(clean);
            const exact = normalizedHeaders.find(item => candidates.includes(item.clean));
            const partial = exact || normalizedHeaders.find(item => candidates.some(alias => alias.length > 3 && (item.clean.includes(alias) || alias.includes(item.clean))));
            return [field, partial?.header || ""];
        }));
    }

    function mappedRow(raw, mapping, type, sourceRow) {
        const schema = IMPORT_SCHEMAS[type];
        const output = { sourceRow };
        schema.columns.forEach(([field]) => { output[field] = raw?.[mapping?.[field]] ?? ""; });
        ["ci", "supervisorCI"].forEach(field => { if (field in output) output[field] = normalizeCI(output[field]); });
        ["date", "startDate", "endDate", "returnDate", "from", "to", "effectiveFrom"].forEach(field => {
            if (field in output) output[field] = isoDate(output[field]);
        });
        ["breakMinutes", "tolerance", "hours"].forEach(field => {
            if (field in output) output[field] = Number(output[field] || 0);
        });
        Object.keys(output).forEach(field => { if (typeof output[field] === "string") output[field] = text(output[field]); });
        output.naturalKey = naturalKey(type, output);
        return output;
    }

    function indexByClean(items, fields = ["id", "name", "costCenter", "code"]) {
        const map = new Map();
        (items || []).forEach(item => fields.forEach(field => {
            const value = clean(item?.[field]);
            if (value) map.set(value, item);
        }));
        return map;
    }

    function validateImportRows(type, rows, context = {}) {
        const schema = IMPORT_SCHEMAS[type];
        if (!schema) throw new Error("Tipo de importación no compatible.");
        const counts = new Map();
        (rows || []).forEach(row => counts.set(row.naturalKey, (counts.get(row.naturalKey) || 0) + 1));
        const peopleByCI = new Map((context.people || []).map(person => [normalizeCI(person.ci), person]));
        const peopleByClock = new Map((context.people || []).filter(person => text(person.clockId)).map(person => [text(person.clockId), person]));
        const clients = indexByClean(context.clients);
        const branches = indexByClean(context.branches);
        const schedules = indexByClean(context.schedules);
        return (rows || []).map(row => {
            const issues = [];
            const warnings = [];
            schema.columns.forEach(([field, label, , required]) => {
                if (required && (row[field] === "" || row[field] === null || row[field] === undefined)) issues.push(`Falta ${label}`);
            });
            if (counts.get(row.naturalKey) > 1) issues.push("Registro repetido dentro del archivo");
            if (["people", "assignments", "news"].includes(type) && row.ci && row.ci.length < 5) issues.push("Cédula inválida");
            const client = row.client ? clients.get(clean(row.client)) : null;
            const branch = row.branch ? branches.get(clean(row.branch)) : null;
            if (["people", "branches", "assignments"].includes(type) && row.client && !client) issues.push(`Cliente no reconocido: ${row.client}`);
            if (["people", "assignments"].includes(type) && row.branch && !branch) issues.push(`Sucursal no reconocida: ${row.branch}`);
            if (["people", "assignments"].includes(type) && client && branch && branch.clientId !== client.id) issues.push("La sucursal no pertenece al cliente indicado");
            if (["assignments", "news"].includes(type) && row.ci && !peopleByCI.has(row.ci)) issues.push(`Funcionario no encontrado: CI ${row.ci}`);
            if (type === "assignments" && row.schedule && !schedules.has(clean(row.schedule))) issues.push(`Horario no reconocido: ${row.schedule}`);
            if (type === "attendance" && !row.ci && !row.clockId) issues.push("Falta cédula o ID del reloj");
            if (type === "attendance" && row.ci && !peopleByCI.has(row.ci)) issues.push(`Funcionario no encontrado: CI ${row.ci}`);
            if (type === "attendance" && !row.ci && row.clockId && !peopleByClock.has(text(row.clockId))) issues.push(`ID del reloj no vinculado: ${row.clockId}`);
            if (type === "attendance" && !row.in && !row.out && !row.status) warnings.push("Día sin horas ni clasificación");
            if (type === "attendance" && ((row.in && !row.out) || (!row.in && row.out))) warnings.push("Marcación incompleta");
            if ((row.startDate && row.endDate && row.endDate < row.startDate) || (row.from && row.to && row.to < row.from)) issues.push("La fecha final es anterior a la inicial");
            if (type === "schedules" && (!/^\d{1,2}:\d{2}$/.test(row.start) || !/^\d{1,2}:\d{2}$/.test(row.end))) issues.push("Entrada y salida deben tener formato HH:mm");
            const exists = Boolean((context.existingNaturalKeys || new Set()).has(row.naturalKey));
            return { ...row, issues, warnings, action: issues.length ? "error" : exists ? "update" : "new" };
        });
    }

    function mergeByNaturalKey(type, existing, incoming) {
        const map = new Map((existing || []).map(item => [naturalKey(type, item), item]));
        const counts = { new: 0, updated: 0, equal: 0 };
        (incoming || []).forEach(raw => {
            const key = raw.naturalKey || naturalKey(type, raw);
            const item = { ...raw };
            delete item.naturalKey;
            delete item.sourceRow;
            delete item.issues;
            delete item.warnings;
            delete item.action;
            const previous = map.get(key);
            if (!previous) {
                counts.new += 1;
                map.set(key, item);
            } else if (stableStringify(previous) === stableStringify({ ...previous, ...item })) {
                counts.equal += 1;
            } else {
                counts.updated += 1;
                map.set(key, { ...previous, ...item, id: previous.id || item.id });
            }
        });
        return { records: Array.from(map.values()), counts };
    }

    function operationalMetrics(input = {}) {
        const today = isoDate(input.today || new Date());
        const period = today.slice(0, 7);
        const assignments = input.assignments || [];
        const people = scopePeople(input.people, assignments, input.active, today);
        const peopleIds = new Set(people.map(person => String(person.id)));
        const currentAssignments = assignmentIndex(assignments, today);
        const attendance = (input.attendance || []).filter(item => peopleIds.has(String(item.employeeId)) && String(item.date).startsWith(period));
        const news = (input.news || []).filter(item => peopleIds.has(String(item.employeeId)));
        const imports = input.imports || [];
        const audit = input.audit || [];
        const activePeople = people.filter(person => person.status === "active" || person.active === true);
        return {
            active: activePeople.length,
            hires: people.filter(person => String(person.startDate).startsWith(period)).length,
            exits: people.filter(person => String(person.endDate).startsWith(period)).length,
            transfers: audit.filter(item => item.entityType === "assignment" && item.action === "transfer" && String(item.createdAt).startsWith(period)).length,
            withoutSchedule: activePeople.filter(person => !currentAssignments.get(String(person.id))?.scheduleId
                && !(input.scheduleAssignments || []).some(item => item.employeeId === String(person.id) && item.from <= today && (!item.to || item.to >= today))).length,
            incomplete: attendance.filter(item => (item.in && !item.out) || (!item.in && item.out)).length,
            absences: attendance.filter(item => ["raw_missing", "unexcused"].includes(item.resolvedStatus || item.rawStatus)).length,
            tardiness: attendance.filter(item => (item.flags || []).includes("late") || item.resolvedStatus === "late").length,
            pendingNews: news.filter(item => !item.cancelled && !item.actualReturnDate && (item.status || "pending") === "pending").length,
            upcomingVacations: news.filter(item => item.type === "vacation" && item.startDate >= today && item.startDate <= addDays(today, 30)).length,
            importErrors: imports.reduce((total, item) => total + Number(item.errors || 0), 0),
            recentImports: imports.filter(item => String(item.createdAt).slice(0, 10) >= addDays(today, -30)).length
        };
    }

    window.AtlasHRV09Core = Object.freeze({
        GENERAL_ID,
        KEYS,
        IMPORT_SCHEMAS,
        text,
        clean,
        normalizeCI,
        isoDate,
        addDays,
        normalizeBranch,
        normalizeCatalog,
        normalizeAssignment,
        assignmentAt,
        assignmentIndex,
        personAssignmentData,
        assignmentChanged,
        diff,
        auditEvent,
        transitionAssignments,
        matchesContext,
        scopePeople,
        stableStringify,
        naturalKey,
        autoMap,
        mappedRow,
        indexByClean,
        validateImportRows,
        mergeByNaturalKey,
        operationalMetrics
    });
})();
