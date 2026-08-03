(function () {
    "use strict";

    const A = window.Atlas;
    const C = window.AtlasHRContext;
    const Calc = window.AtlasHRCalc;
    const Store = window.AtlasHRStorage;
    const XLSX = window.XLSX;
    const q = selector => document.querySelector(selector);
    const esc = A.escapeHTML;
    const MAX_SPREADSHEET_BYTES = 50 * 1024 * 1024;
    const MAX_SPREADSHEET_ROWS = 250000;
    const MAX_SPREADSHEET_COLUMNS = 200;
    const KEYS = {
        schedules: "atlasHRSchedules",
        assignments: "atlasHRScheduleAssignments",
        absences: "atlasHRAbsences",
        compliance: "atlasHRCompliance",
        holidays: "atlasHRHolidays",
        imports: "atlasHRAttendanceImports"
    };
    let schedules = A.readArray(KEYS.schedules).map(normalizeSchedule);
    let assignments = A.readArray(KEYS.assignments).map(normalizeAssignment);
    let attendance = [];
    let stagedAttendance = [];
    let stagedBaseAttendance = [];
    let stagedMappings = new Map();
    let calculations = [];
    let editingScheduleRules = [];

    function assertSpreadsheet(file, allowCSV = false) {
        if (!XLSX) throw new Error("El lector de planillas no está disponible. Recargá la página.");
        const extensions = allowCSV ? /\.(?:xlsx|xls|csv)$/i : /\.(?:xlsx|xls)$/i;
        if (!extensions.test(file?.name || "")) throw new Error("Seleccioná una planilla compatible.");
        if (file.size > MAX_SPREADSHEET_BYTES) throw new Error("La planilla supera el límite técnico de 50 MB.");
    }

    function assertSheetSize(sheet) {
        if (!sheet) throw new Error("La planilla no contiene una hoja legible.");
        if (!sheet["!ref"]) return;
        const range = XLSX.utils.decode_range(sheet["!ref"]);
        const rows = range.e.r - range.s.r + 1;
        const columns = range.e.c - range.s.c + 1;
        if (rows > MAX_SPREADSHEET_ROWS || columns > MAX_SPREADSHEET_COLUMNS) {
            throw new Error(`La hoja tiene ${rows.toLocaleString("es-PY")} filas y ${columns} columnas; dividila en archivos más pequeños.`);
        }
    }

    function people() { return window.AtlasHRPeople?.all() || A.readArray("atlasHRPeople"); }
    function visiblePeople() { return C.visible(people()); }
    function personById(id) { return people().find(item => String(item.id) === String(id)); }
    function clientName(person) { return C.clientById(person?.clientId)?.name || "Sin cliente"; }
    function save(key, value) { A.writeJSON(KEYS[key], value); }
    function id(prefix = "") { return `${prefix}${A.createId()}-${Math.floor(Math.random() * 100000)}`; }
    function todayPeriod() { return A.localDate().slice(0, 7); }

    function normalizeRules(item) {
        if (Array.isArray(item?.rules) && item.rules.length) return item.rules.map(rule => ({
            day: Number(rule.day),
            active: rule.active !== false,
            start: rule.start || item.start || "",
            end: rule.end || item.end || "",
            breakMinutes: Number(rule.breakMinutes ?? item.breakMinutes ?? 0),
            tolerance: Number(rule.tolerance ?? item.tolerance ?? 0)
        }));
        const days = Array.isArray(item?.days) && item.days.length ? item.days : [1, 2, 3, 4, 5, 6];
        return days.map(day => ({
            day: Number(day),
            active: true,
            start: item?.start || "",
            end: item?.end || "",
            breakMinutes: Number(item?.breakMinutes || 0),
            tolerance: Number(item?.tolerance || 0)
        }));
    }

    function normalizeSchedule(item) {
        const legacyRevision = {
            id: id("rev-"),
            effectiveFrom: item?.effectiveFrom || item?.createdAt?.slice(0, 10) || "2000-01-01",
            rules: normalizeRules(item),
            note: item?.note || "",
            createdAt: item?.createdAt || new Date().toISOString()
        };
        return {
            id: String(item?.id || id("sch-")),
            name: String(item?.name || "Horario sin nombre").trim(),
            active: item?.active !== false,
            revisions: Array.isArray(item?.revisions) && item.revisions.length
                ? item.revisions.map(revision => ({ ...revision, id: String(revision.id || id("rev-")), rules: normalizeRules(revision) }))
                : [legacyRevision],
            createdAt: item?.createdAt || new Date().toISOString(),
            updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString()
        };
    }

    function normalizeAssignment(item) {
        return {
            id: String(item?.id || id("asg-")),
            employeeId: String(item?.employeeId || ""),
            scheduleId: String(item?.scheduleId || ""),
            from: item?.from || item?.effectiveFrom || "2000-01-01",
            to: item?.to || "",
            note: String(item?.note || ""),
            createdAt: item?.createdAt || new Date().toISOString()
        };
    }

    function activeRevision(schedule, date = A.localDate()) {
        return [...(schedule?.revisions || [])]
            .filter(item => !item.effectiveFrom || item.effectiveFrom <= date)
            .sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)))[0]
            || schedule?.revisions?.[0]
            || null;
    }

    function scheduleView(schedule, date) {
        const revision = activeRevision(schedule, date);
        if (!revision) return null;
        const first = revision.rules?.[0] || {};
        return {
            id: schedule.id,
            name: schedule.name,
            start: first.start,
            end: first.end,
            breakMinutes: first.breakMinutes,
            tolerance: first.tolerance,
            rules: revision.rules,
            revisionId: revision.id,
            effectiveFrom: revision.effectiveFrom
        };
    }

    function assignmentFor(employeeId, date) {
        return assignments
            .filter(item => item.employeeId === String(employeeId) && item.from <= date && (!item.to || item.to >= date))
            .sort((a, b) => String(b.from).localeCompare(String(a.from)))[0] || null;
    }

    function scheduleFor(employeeId, date) {
        const assignment = assignmentFor(employeeId, date);
        return scheduleView(schedules.find(item => item.id === assignment?.scheduleId), date);
    }

    function activateTab(name) {
        document.querySelectorAll("[data-hr-tab]").forEach(button => button.classList.toggle("active", button.dataset.hrTab === name));
        document.querySelectorAll("[data-hr-panel]").forEach(panel => { panel.hidden = panel.dataset.hrPanel !== name; });
        history.replaceState(null, "", `#${name}`);
        if (name === "schedules") loadAttendance().catch(console.error);
        if (name === "calculations" && !q("#hrCalculationPeriod").value) q("#hrCalculationPeriod").value = q("#hrAttendancePeriod").value;
    }

    q(".hr-module-nav")?.addEventListener("click", event => {
        const button = event.target.closest("[data-hr-tab]");
        if (button) activateTab(button.dataset.hrTab);
    });

    function selectedDays() {
        return Array.from(q("#hrScheduleDays").querySelectorAll("input:checked"), input => Number(input.value));
    }

    function advancedRuleValues() {
        return new Map(Array.from(q("#hrScheduleAdvanced").querySelectorAll("[data-rule-day]"), row => [
            Number(row.dataset.ruleDay),
            {
                day: Number(row.dataset.ruleDay),
                active: true,
                start: row.querySelector("[data-rule-start]").value,
                end: row.querySelector("[data-rule-end]").value,
                breakMinutes: Number(row.querySelector("[data-rule-break]").value || 0),
                tolerance: Number(row.querySelector("[data-rule-tolerance]").value || 0)
            }
        ]));
    }

    function renderAdvancedRules() {
        const target = q("#hrScheduleAdvanced");
        const current = advancedRuleValues();
        const original = new Map(editingScheduleRules.map(rule => [Number(rule.day), rule]));
        const common = {
            start: q("#hrScheduleStart").value,
            end: q("#hrScheduleEnd").value,
            breakMinutes: Number(q("#hrScheduleBreak").value || 0),
            tolerance: Number(q("#hrScheduleTolerance").value || 0)
        };
        const labels = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        target.innerHTML = selectedDays().map(day => {
            const rule = current.get(day) || original.get(day) || common;
            return `<div data-rule-day="${day}" class="hr-schedule-rule-row">
                <strong>${labels[day]}</strong>
                <label><span>Entrada</span><input data-rule-start type="time" value="${esc(rule.start || "")}" required></label>
                <label><span>Salida</span><input data-rule-end type="time" value="${esc(rule.end || "")}" required></label>
                <label><span>Descanso</span><input data-rule-break type="number" min="0" max="300" value="${Number(rule.breakMinutes || 0)}"></label>
                <label><span>Tolerancia</span><input data-rule-tolerance type="number" min="0" max="120" value="${Number(rule.tolerance || 0)}"></label>
            </div>`;
        }).join("");
    }

    function updateAdvancedSchedule() {
        const enabled = q("#hrScheduleAdvancedToggle").checked;
        q("#hrScheduleAdvanced").hidden = !enabled;
        q("#hrScheduleStart").required = !enabled;
        q("#hrScheduleEnd").required = !enabled;
        if (enabled) renderAdvancedRules();
    }

    function resetScheduleForm() {
        q("#hrScheduleForm").reset();
        q("#hrScheduleId").value = "";
        q("#hrScheduleFrom").value = A.localDate();
        q("#hrScheduleDays").querySelectorAll("input").forEach(input => { input.checked = Number(input.value) !== 0; });
        editingScheduleRules = [];
        q("#hrScheduleAdvancedToggle").checked = false;
        q("#hrScheduleAdvanced").hidden = true;
        q("#hrScheduleAdvanced").replaceChildren();
        q("#hrScheduleStart").required = true;
        q("#hrScheduleEnd").required = true;
        q("#hrScheduleCancel").hidden = true;
    }

    function renderScheduleOptions() {
        const options = schedules.filter(item => item.active).sort((a, b) => a.name.localeCompare(b.name, "es"))
            .map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
        q("#hrAssignmentSchedule").innerHTML = `<option value="">Seleccionar horario</option>${options}`;
    }

    function renderEmployeeOptions() {
        const employees = visiblePeople().filter(item => item.status === "active").sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
        const options = employees.map(item => `<option value="${esc(item.id)}">${esc(item.fullName)} · CI ${esc(item.ci || "—")}</option>`).join("");
        ["#hrAssignmentEmployee", "#hrAttendanceEmployee"].forEach(selector => {
            const select = q(selector);
            const selected = select.value;
            select.innerHTML = `<option value="">Seleccionar funcionario</option>${options}`;
            if (employees.some(item => item.id === selected)) select.value = selected;
        });
    }

    function renderSchedules() {
        renderScheduleOptions();
        const target = q("#hrScheduleList");
        if (!schedules.length) {
            target.innerHTML = '<div class="empty-state">Creá el primer tipo de horario.</div>';
            return;
        }
        target.innerHTML = schedules.sort((a, b) => a.name.localeCompare(b.name, "es")).map(item => {
            const revision = activeRevision(item);
            const dayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
            const groups = new Map();
            (revision?.rules || []).forEach(rule => {
                const key = `${rule.start}|${rule.end}|${rule.breakMinutes}|${rule.tolerance}`;
                if (!groups.has(key)) groups.set(key, { ...rule, days: [] });
                groups.get(key).days.push(dayLabels[Number(rule.day)]);
            });
            const scheduleSummary = Array.from(groups.values()).map(rule =>
                `${rule.days.join(", ")} ${rule.start || "—"}–${rule.end || "—"}`
            ).join(" · ");
            return `<article class="hr-data-card hr-schedule-card">
                <div><small>${esc((revision?.rules || []).map(rule => dayLabels[Number(rule.day)]).join(", ") || "Sin días")}</small><strong>${esc(item.name)}</strong><span>${esc(scheduleSummary || "Sin horas")} · desde ${esc(revision?.effectiveFrom || "—")}</span></div>
                <p>${esc(revision?.note || "Sin observación")} · ${item.revisions.length} versión(es)</p>
                <button data-edit-schedule="${esc(item.id)}" type="button">Editar / nueva vigencia</button>
                <button data-toggle-schedule="${esc(item.id)}" class="hr-delete-link" type="button">${item.active ? "Desactivar" : "Reactivar"}</button>
            </article>`;
        }).join("");
    }

    q("#hrScheduleForm").addEventListener("submit", event => {
        event.preventDefault();
        const days = selectedDays();
        if (!days.length) return A.notify("Elegí al menos un día de trabajo.", "error");
        const scheduleId = q("#hrScheduleId").value;
        const advanced = q("#hrScheduleAdvancedToggle").checked;
        const rules = advanced
            ? Array.from(advancedRuleValues().values())
            : days.map(day => ({
                day,
                active: true,
                start: q("#hrScheduleStart").value,
                end: q("#hrScheduleEnd").value,
                breakMinutes: Number(q("#hrScheduleBreak").value || 0),
                tolerance: Number(q("#hrScheduleTolerance").value || 0)
            }));
        if (rules.some(rule => !rule.start || !rule.end)) return A.notify("Completá la entrada y salida de cada día seleccionado.", "error");
        const revision = {
            id: id("rev-"),
            effectiveFrom: q("#hrScheduleFrom").value,
            note: q("#hrScheduleNote").value.trim(),
            rules,
            createdAt: new Date().toISOString()
        };
        const current = schedules.find(item => item.id === scheduleId);
        if (current) {
            current.name = q("#hrScheduleName").value.trim();
            const sameDate = current.revisions.find(item => item.effectiveFrom === revision.effectiveFrom);
            if (sameDate) Object.assign(sameDate, revision, { id: sameDate.id });
            else current.revisions.push(revision);
            current.updatedAt = new Date().toISOString();
        } else {
            schedules.push(normalizeSchedule({
                id: id("sch-"),
                name: q("#hrScheduleName").value,
                revisions: [revision]
            }));
        }
        save("schedules", schedules);
        resetScheduleForm();
        renderSchedules();
        renderAssignments();
        A.notify(current ? "Nueva vigencia guardada sin modificar periodos anteriores." : "Horario creado.");
    });

    q("#hrScheduleList").addEventListener("click", event => {
        const edit = event.target.closest("[data-edit-schedule]");
        const toggle = event.target.closest("[data-toggle-schedule]");
        if (edit) {
            const item = schedules.find(schedule => schedule.id === edit.dataset.editSchedule);
            const revision = activeRevision(item);
            const rule = revision?.rules?.[0] || {};
            q("#hrScheduleId").value = item.id;
            q("#hrScheduleName").value = item.name;
            q("#hrScheduleStart").value = rule.start || "";
            q("#hrScheduleEnd").value = rule.end || "";
            q("#hrScheduleBreak").value = rule.breakMinutes || 0;
            q("#hrScheduleTolerance").value = rule.tolerance || 0;
            q("#hrScheduleFrom").value = A.localDate();
            q("#hrScheduleNote").value = revision?.note || "";
            const days = new Set((revision?.rules || []).map(entry => Number(entry.day)));
            q("#hrScheduleDays").querySelectorAll("input").forEach(input => { input.checked = days.has(Number(input.value)); });
            editingScheduleRules = (revision?.rules || []).map(ruleEntry => ({ ...ruleEntry }));
            const signatures = new Set(editingScheduleRules.map(ruleEntry =>
                `${ruleEntry.start}|${ruleEntry.end}|${ruleEntry.breakMinutes}|${ruleEntry.tolerance}`
            ));
            q("#hrScheduleAdvancedToggle").checked = signatures.size > 1;
            updateAdvancedSchedule();
            q("#hrScheduleCancel").hidden = false;
            q("#hrScheduleName").focus();
        }
        if (toggle) {
            schedules = schedules.map(item => item.id === toggle.dataset.toggleSchedule ? { ...item, active: !item.active, updatedAt: new Date().toISOString() } : item);
            save("schedules", schedules); renderSchedules();
        }
    });
    q("#hrScheduleCancel").addEventListener("click", resetScheduleForm);
    q("#hrScheduleAdvancedToggle").addEventListener("change", updateAdvancedSchedule);
    q("#hrScheduleDays").addEventListener("change", () => {
        if (q("#hrScheduleAdvancedToggle").checked) renderAdvancedRules();
    });

    function renderAssignments() {
        renderEmployeeOptions();
        const ids = new Set(visiblePeople().map(item => item.id));
        const visible = assignments.filter(item => ids.has(item.employeeId)).sort((a, b) => String(b.from).localeCompare(String(a.from)));
        if (!visible.length) {
            q("#hrAssignmentList").innerHTML = '<div class="empty-state">Todavía no hay horarios asignados.</div>';
            return;
        }
        q("#hrAssignmentList").innerHTML = `<table class="hr-simple-table"><thead><tr><th>Funcionario</th><th>Horario</th><th>Desde</th><th>Hasta</th><th>Observación</th><th></th></tr></thead><tbody>${visible.map(item => `
            <tr><td>${esc(personById(item.employeeId)?.fullName || "No encontrado")}</td><td>${esc(schedules.find(schedule => schedule.id === item.scheduleId)?.name || "Horario no encontrado")}</td>
            <td>${esc(item.from)}</td><td>${esc(item.to || "Vigente")}</td><td>${esc(item.note || "—")}</td><td><button data-delete-assignment="${esc(item.id)}" type="button">Finalizar</button></td></tr>`).join("")}</tbody></table>`;
    }

    function previousDate(date) {
        const parsed = A.parseDate(date);
        parsed.setDate(parsed.getDate() - 1);
        return A.localDate(parsed);
    }

    function assignSchedule(employeeId, scheduleId, from, to = "", note = "") {
        assignments.forEach(item => {
            if (item.employeeId === employeeId && item.from < from && (!item.to || item.to >= from)) item.to = previousDate(from);
        });
        const duplicate = assignments.find(item => item.employeeId === employeeId && item.from === from);
        const next = normalizeAssignment({ id: duplicate?.id || id("asg-"), employeeId, scheduleId, from, to, note, createdAt: duplicate?.createdAt });
        if (duplicate) assignments = assignments.map(item => item.id === duplicate.id ? next : item);
        else assignments.push(next);
    }

    q("#hrAssignmentForm").addEventListener("submit", event => {
        event.preventDefault();
        const from = q("#hrAssignmentFrom").value;
        const to = q("#hrAssignmentTo").value;
        if (to && to < from) return A.notify("La fecha hasta no puede ser anterior a la fecha desde.", "error");
        assignSchedule(q("#hrAssignmentEmployee").value, q("#hrAssignmentSchedule").value, from, to, q("#hrAssignmentNote").value);
        save("assignments", assignments);
        event.target.reset();
        q("#hrAssignmentFrom").value = A.localDate();
        renderAssignments();
        A.notify("Horario asignado.");
    });
    q("#hrAssignmentList").addEventListener("click", event => {
        const button = event.target.closest("[data-delete-assignment]");
        if (!button) return;
        const current = assignments.find(item => item.id === button.dataset.deleteAssignment);
        if (!current) return;
        if (current.from > A.localDate()) return A.notify("La asignación todavía no comenzó. Editala o reemplazala con otra vigencia.", "error");
        assignments = assignments.map(item => item.id === current.id ? { ...item, to: A.localDate() } : item);
        save("assignments", assignments); renderAssignments();
    });

    function workbookRows(rows, name) {
        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, sheet, name);
        return workbook;
    }

    q("#hrExportAssignments").addEventListener("click", () => {
        const ids = new Set(visiblePeople().map(item => item.id));
        const rows = assignments.filter(item => ids.has(item.employeeId)).map(item => {
            const person = personById(item.employeeId);
            return {
                "Cédula": person?.ci || "",
                "Nombre": person?.fullName || "",
                "Denominación del horario": schedules.find(schedule => schedule.id === item.scheduleId)?.name || "",
                "Desde": item.from,
                "Hasta": item.to,
                "Observación": item.note
            };
        });
        if (!rows.length) return A.notify("No hay asignaciones para exportar.", "error");
        XLSX.writeFile(workbookRows(rows, "ASIGNACIONES"), `ATLAS_HORARIOS_${C.company.name}_${C.client?.name || C.company.rosterName}.xlsx`.replace(/[^\w.-]+/g, "_"));
    });

    q("#hrAssignmentFile").addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            assertSpreadsheet(file);
            const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            assertSheetSize(sheet);
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
            let imported = 0;
            const errors = [];
            rows.forEach((row, index) => {
                const value = aliases => Object.entries(row).find(([key]) => aliases.some(alias => clean(key).includes(clean(alias))))?.[1] ?? "";
                const document = String(value(["cedula", "c.i"])).replace(/\D/g, "");
                const person = people().find(item => item.ci === document);
                const scheduleName = String(value(["denominacion del horario", "horario"])).trim();
                const schedule = schedules.find(item => item.name.toLowerCase() === scheduleName.toLowerCase());
                if (!person || !schedule) {
                    errors.push(`Fila ${index + 2}: ${!person ? "cédula no encontrada" : "horario no encontrado"}`);
                    return;
                }
                assignSchedule(person.id, schedule.id, Calc.dateISO(value(["desde"])) || A.localDate(), Calc.dateISO(value(["hasta"])), String(value(["observacion"])));
                imported += 1;
            });
            save("assignments", assignments); renderAssignments();
            A.notify(`${imported} asignación(es) importada(s)${errors.length ? `; ${errors.length} fila(s) omitida(s)` : ""}.`, errors.length ? "error" : "success");
        } catch (error) {
            A.notify(error.message || "No se pudo leer el Excel.", "error");
        } finally {
            event.target.value = "";
        }
    });

    function clean(value) {
        return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function periodRecords() {
        return C.visible(attendance);
    }

    async function loadAttendance() {
        const period = q("#hrAttendancePeriod").value || todayPeriod();
        q("#hrAttendancePeriod").value = period;
        attendance = await Store.getMonth(C.active.companyId, period);
        renderAttendance();
    }

    function renderAttendance() {
        renderEmployeeOptions();
        const records = periodRecords().sort((a, b) => `${b.date}${b.in}`.localeCompare(`${a.date}${a.in}`));
        const pending = records.filter(item => item.rawStatus === "FALTA" && !item.resolvedStatus).length;
        const incomplete = records.filter(item => (item.in && !item.out) || (!item.in && item.out)).length;
        q("#hrAttendanceSummary").innerHTML = `<span><strong>${records.length.toLocaleString("es-PY")}</strong> registros</span><span><strong>${pending}</strong> FALTA pendiente</span><span><strong>${incomplete}</strong> incompletas</span>`;
        if (!records.length) {
            q("#hrAttendanceList").innerHTML = '<div class="empty-state">No hay marcaciones en este periodo.</div>';
            return;
        }
        const shown = records.slice(0, 500);
        q("#hrAttendanceList").innerHTML = `${records.length > shown.length ? `<p class="hr-table-note">Se muestran 500 de ${records.length.toLocaleString("es-PY")}; la exportación y el cálculo usan todos.</p>` : ""}<table class="hr-simple-table"><thead><tr><th>Funcionario</th><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Estado</th><th></th></tr></thead><tbody>${shown.map(item => {
            const raw = item.rawStatus === "FALTA" ? "FALTA pendiente" : item.resolvedStatus || "Marcación";
            return `<tr><td>${esc(personById(item.employeeId)?.fullName || item.sourceName || "No vinculado")}</td><td>${esc(item.date)}</td><td>${esc(item.in || "—")}</td><td>${esc(item.out || (item.rawStatus === "FALTA" ? "FALTA" : "—"))}</td><td>${esc(Calc.STATUS[item.resolvedStatus || (item.rawStatus === "FALTA" ? "raw_missing" : "worked")] || raw)}</td><td><button data-delete-attendance="${esc(item.id)}" type="button">Eliminar</button></td></tr>`;
        }).join("")}</tbody></table>`;
    }

    function parseAttendanceWorkbook(workbook) {
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        assertSheetSize(sheet);
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", cellDates: true, raw: true });
        const headerIndex = matrix.findIndex(row => {
            const cells = row.map(clean);
            return cells.some(cell => cell === "nombre") && cells.some(cell => cell === "id") && cells.some(cell => cell === "fecha");
        });
        if (headerIndex < 0) throw new Error("No encontré las columnas Nombre, ID, Fecha, Entrada y Salida.");
        const headers = matrix[headerIndex].map(clean);
        const indexFor = aliases => headers.findIndex(header => aliases.some(alias => header === clean(alias)));
        const indexes = {
            name: indexFor(["nombre"]),
            clockId: indexFor(["id"]),
            date: indexFor(["fecha"]),
            in: indexFor(["entrada"]),
            out: indexFor(["salida"])
        };
        return matrix.slice(headerIndex + 1).filter(row => row.some(value => String(value).trim())).map((row, offset) => ({
            sourceRow: headerIndex + offset + 2,
            sourceName: String(row[indexes.name] || "").trim(),
            clockId: String(row[indexes.clockId] ?? "").trim(),
            date: Calc.dateISO(row[indexes.date]),
            in: normalizeTime(row[indexes.in]),
            out: String(row[indexes.out] || "").toUpperCase() === "FALTA" ? "" : normalizeTime(row[indexes.out]),
            rawStatus: String(row[indexes.out] || "").toUpperCase() === "FALTA" ? "FALTA" : ""
        })).filter(item => item.date);
    }

    function normalizeTime(value) {
        const minutes = Calc.timeMinutes(value);
        if (minutes === null) return "";
        return `${String(Math.floor((minutes % 1440) / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    }

    function linkAttendance(rows) {
        const roster = people();
        stagedMappings = new Map();
        return rows.map(row => {
            const compactName = clean(row.sourceName);
            const person = roster.find(item => item.clockId && String(item.clockId) === row.clockId)
                || roster.find(item => item.ci && item.ci === row.clockId.replace(/\D/g, ""))
                || roster.find(item => clean(item.fullName) === compactName);
            if (!person && row.clockId) stagedMappings.set(row.clockId, "");
            return {
                ...row,
                id: id("att-"),
                employeeId: person?.id || "",
                clientId: person?.clientId || "",
                resolvedStatus: "",
                updatedAt: new Date().toISOString()
            };
        });
    }

    function renderAttendanceStage() {
        const unknownRows = stagedAttendance.filter(item => !item.employeeId);
        const periods = new Set(stagedAttendance.map(item => item.date.slice(0, 7)));
        const selectedPeriod = periods.size === 1 ? Array.from(periods)[0] : "";
        const current = selectedPeriod === q("#hrAttendancePeriod").value ? attendance : stagedBaseAttendance;
        const previewMerge = Store.mergeRecords(current, stagedAttendance.filter(item => item.employeeId));
        const missingClock = stagedAttendance.filter(item => !item.clockId).length;
        const mappedClockIds = new Map();
        stagedAttendance.filter(item => item.clockId && item.employeeId).forEach(item => {
            if (!mappedClockIds.has(item.employeeId)) mappedClockIds.set(item.employeeId, new Set());
            mappedClockIds.get(item.employeeId).add(item.clockId);
        });
        const mappingConflicts = Array.from(mappedClockIds.values()).filter(ids => ids.size > 1).length;
        q("#hrAttendanceImportSummary").innerHTML = `<span><strong>${stagedAttendance.length.toLocaleString("es-PY")}</strong> filas</span><span><strong>${previewMerge.counts.new}</strong> nuevas</span><span><strong>${previewMerge.counts.updated}</strong> actualizadas</span><span><strong>${previewMerge.counts.equal}</strong> iguales</span><span><strong>${unknownRows.length}</strong> sin vincular</span>`;
        q("#hrAttendanceUnknown").innerHTML = stagedMappings.size ? `<strong>Vinculá estos ID del reloj una sola vez:</strong>${Array.from(stagedMappings).map(([clockId]) => {
            const example = stagedAttendance.find(item => item.clockId === clockId);
            return `<label class="hr-clock-map"><span>ID ${esc(clockId)} · ${esc(example?.sourceName || "")}</span><select data-map-clock="${esc(clockId)}"><option value="">Seleccionar funcionario</option>${visiblePeople().map(person => `<option value="${esc(person.id)}">${esc(person.fullName)} · CI ${esc(person.ci)}</option>`).join("")}</select></label>`;
        }).join("")}` : '<div class="hr-import-ok">✓ Todos los ID del reloj están vinculados.</div>';
        q("#hrAttendancePreview").innerHTML = `<table class="hr-simple-table"><thead><tr><th>Fila</th><th>Nombre del reloj</th><th>ID</th><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Vínculo</th></tr></thead><tbody>${stagedAttendance.slice(0, 100).map(item => `<tr class="${item.employeeId ? "" : "hr-row-error"}"><td>${item.sourceRow}</td><td>${esc(item.sourceName)}</td><td>${esc(item.clockId)}</td><td>${esc(item.date)}</td><td>${esc(item.in || "—")}</td><td>${esc(item.rawStatus || item.out || "—")}</td><td>${esc(personById(item.employeeId)?.fullName || "Pendiente")}</td></tr>`).join("")}</tbody></table>`;
        q("#hrAttendanceImportResult").hidden = false;
        q("#hrAttendanceProcess").disabled = periods.size !== 1 || unknownRows.length > 0 || mappingConflicts > 0;
        if (periods.size !== 1) q("#hrAttendanceUnknown").insertAdjacentHTML("afterbegin", '<p>El archivo debe contener un solo mes.</p>');
        if (missingClock) q("#hrAttendanceUnknown").insertAdjacentHTML("afterbegin", `<p>${missingClock} fila(s) no tienen ID del reloj y no pueden vincularse.</p>`);
        if (mappingConflicts) q("#hrAttendanceUnknown").insertAdjacentHTML("afterbegin", `<p>${mappingConflicts} funcionario(s) quedaron vinculados a más de un ID del reloj. Elegí un solo ID por persona.</p>`);
    }

    q("#hrAttendanceFile").addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            assertSpreadsheet(file, true);
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: "array", cellDates: true });
            stagedAttendance = linkAttendance(parseAttendanceWorkbook(workbook));
            const periods = new Set(stagedAttendance.map(item => item.date.slice(0, 7)));
            const period = periods.size === 1 ? Array.from(periods)[0] : "";
            stagedBaseAttendance = period && period !== q("#hrAttendancePeriod").value
                ? await Store.getMonth(C.active.companyId, period)
                : attendance;
            renderAttendanceStage();
        } catch (error) {
            A.notify(error.message || "No se pudo leer el archivo del reloj.", "error");
        } finally {
            event.target.value = "";
        }
    });

    q("#hrAttendanceUnknown").addEventListener("change", event => {
        const select = event.target.closest("[data-map-clock]");
        if (!select) return;
        stagedMappings.set(select.dataset.mapClock, select.value);
        stagedAttendance = stagedAttendance.map(item => item.clockId === select.dataset.mapClock && select.value
            ? { ...item, employeeId: select.value, clientId: personById(select.value)?.clientId || "" }
            : item);
        renderAttendanceStage();
    });

    q("#hrAttendanceProcess").addEventListener("click", async () => {
        const period = stagedAttendance[0]?.date.slice(0, 7);
        if (!period || stagedAttendance.some(item => !item.employeeId)) return;
        const importId = id("imp-");
        const linkedIds = new Map();
        stagedAttendance.forEach(item => {
            if (item.clockId && item.employeeId) linkedIds.set(item.clockId, item.employeeId);
        });
        const clockByEmployee = new Map(Array.from(linkedIds, ([clockId, employeeId]) => [employeeId, clockId]));
        const roster = people().map(person => {
            const clockId = clockByEmployee.get(person.id);
            return clockId && person.clockId !== clockId ? { ...person, clockId, updatedAt: new Date().toISOString() } : person;
        });
        if (roster.some((person, index) => person.clockId !== people()[index]?.clockId)) {
            A.writeJSON("atlasHRPeople", roster);
            window.dispatchEvent(new CustomEvent("atlas:hr-data-changed", { detail: { type: "people-import" } }));
        }
        const result = await Store.upsertMonth(C.active.companyId, period, stagedAttendance.map(item => ({ ...item, sourceImportId: importId })));
        const imports = A.readArray(KEYS.imports);
        imports.unshift({ id: importId, companyId: C.active.companyId, clientId: C.active.clientId, period, rows: stagedAttendance.length, counts: result.counts, importedAt: new Date().toISOString() });
        A.writeJSON(KEYS.imports, imports);
        q("#hrAttendancePeriod").value = period;
        stagedAttendance = [];
        stagedBaseAttendance = [];
        q("#hrAttendanceImportResult").hidden = true;
        await loadAttendance();
        A.notify(
            `Importación guardada: ${result.counts.new} nuevas, ${result.counts.updated} actualizadas y ${result.counts.equal} iguales.${result.cloudSynced === false ? " La copia en nube quedó pendiente." : ""}`,
            result.cloudSynced === false ? "warning" : "success"
        );
    });
    q("#hrAttendanceCancel").addEventListener("click", () => { stagedAttendance = []; stagedBaseAttendance = []; q("#hrAttendanceImportResult").hidden = true; });

    q("#hrAttendanceForm").addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const person = personById(q("#hrAttendanceEmployee").value);
        if (!person) return A.notify("Seleccioná un funcionario.", "error");
        const date = q("#hrAttendanceDate").value;
        const status = q("#hrAttendanceStatus").value;
        const item = {
            id: id("att-"),
            employeeId: person.id,
            clientId: person.clientId,
            clockId: person.clockId,
            sourceName: person.fullName,
            date,
            in: q("#hrAttendanceIn").value,
            out: q("#hrAttendanceOut").value,
            rawStatus: status === "raw_missing" ? "FALTA" : "",
            resolvedStatus: status === "raw_missing" ? "" : status,
            updatedAt: new Date().toISOString()
        };
        const result = await Store.upsertMonth(C.active.companyId, date.slice(0, 7), [item]);
        q("#hrAttendancePeriod").value = date.slice(0, 7);
        form.reset();
        await loadAttendance();
        A.notify(result.cloudSynced === false ? "Marcación guardada en este dispositivo; la nube quedó pendiente." : "Marcación guardada.", result.cloudSynced === false ? "warning" : "success");
    });
    q("#hrAttendanceList").addEventListener("click", async event => {
        const button = event.target.closest("[data-delete-attendance]");
        if (!button || !window.confirm("¿Eliminar esta marcación?")) return;
        attendance = await Store.remove(C.active.companyId, q("#hrAttendancePeriod").value, button.dataset.deleteAttendance);
        renderAttendance();
    });
    q("#hrAttendancePeriod").addEventListener("change", () => loadAttendance().catch(console.error));
    q("#hrExportAttendance").addEventListener("click", () => {
        const rows = periodRecords().map(item => ({
            "Nombre": personById(item.employeeId)?.fullName || item.sourceName,
            "ID": item.clockId,
            "Fecha": item.date,
            "Entrada": item.in,
            "Salida": item.rawStatus === "FALTA" && !item.resolvedStatus ? "FALTA" : item.out,
            "Clasificación": Calc.STATUS[item.resolvedStatus] || ""
        }));
        if (!rows.length) return A.notify("No hay marcaciones para exportar.", "error");
        XLSX.writeFile(workbookRows(rows, "MARCACIONES"), `ATLAS_MARCACIONES_${q("#hrAttendancePeriod").value}.xlsx`);
    });

    function datesInPeriod(period) {
        const [year, month] = period.split("-").map(Number);
        const last = new Date(year, month, 0).getDate();
        const limit = period === todayPeriod() ? Math.min(last, Number(A.localDate().slice(-2))) : last;
        return Array.from({ length: limit }, (_, index) => `${period}-${String(index + 1).padStart(2, "0")}`);
    }

    function absenceFor(employeeId, date) {
        return A.readArray(KEYS.absences).find(item => String(item.employeeId) === String(employeeId) && !item.cancelled && item.startDate <= date && item.endDate >= date);
    }

    function holidaySet() {
        return new Set(A.readArray(KEYS.holidays).map(item => item.date || item));
    }

    function resolvedRecord(person, date, record) {
        const absence = absenceFor(person.id, date);
        const mapped = { vacation: "vacation", medical: "medical", maternity: "maternity", permission: "permission" }[absence?.type];
        if (mapped && (!record || record.rawStatus === "FALTA" || (!record.in && !record.out))) return { ...(record || {}), date, resolvedStatus: mapped };
        return record || { id: id("virtual-"), employeeId: person.id, clientId: person.clientId, date, rawStatus: "FALTA" };
    }

    async function runCalculations() {
        const period = q("#hrCalculationPeriod").value || todayPeriod();
        q("#hrCalculationPeriod").value = period;
        const records = await Store.getMonth(C.active.companyId, period);
        const visibleRecords = C.visible(records);
        const byEmployeeDate = new Map(visibleRecords.map(item => [`${item.employeeId}:${item.date}`, item]));
        const holidays = holidaySet();
        const dates = datesInPeriod(period);
        const periodEnd = Store.periodEnd(period);
        const roster = visiblePeople().filter(person => (!person.startDate || person.startDate <= periodEnd) && (!person.endDate || person.endDate >= `${period}-01`));
        calculations = roster.map(person => {
            const details = dates.map(date => {
                if (person.startDate && date < person.startDate) return null;
                if (person.endDate && date > person.endDate) return null;
                const schedule = scheduleFor(person.id, date);
                const record = resolvedRecord(person, date, byEmployeeDate.get(`${person.id}:${date}`));
                if (!schedule && !byEmployeeDate.has(`${person.id}:${date}`) && !absenceFor(person.id, date)) return null;
                return Calc.calculateDay({ record, schedule, holiday: holidays.has(date) });
            }).filter(Boolean);
            const totals = Calc.summarize(details);
            const currentAssignment = assignmentFor(person.id, `${period}-28`) || assignmentFor(person.id, `${period}-01`);
            const schedule = schedules.find(item => item.id === currentAssignment?.scheduleId);
            const pending = details.filter(day => day.status === "raw_missing").length;
            const incomplete = details.filter(day => day.status === "incomplete").length;
            return {
                person,
                scheduleName: schedule?.name || "",
                totals,
                details,
                pending,
                incomplete
            };
        });
        renderCalculations();
        q("#hrExportCalculation").disabled = !calculations.length;
    }

    function totalField(name) {
        return calculations.reduce((sum, item) => sum + Number(item.totals[name] || 0), 0);
    }

    function renderCalculations() {
        const pending = calculations.reduce((sum, item) => sum + item.pending, 0);
        const incomplete = calculations.reduce((sum, item) => sum + item.incomplete, 0);
        const noSchedule = calculations.filter(item => !item.scheduleName).length;
        q("#hrCalculationSummary").innerHTML = `<span><strong>${calculations.length}</strong> funcionarios</span><span><strong>${Calc.hours(totalField("actualMinutes"))}</strong> horas registradas</span><span><strong>${Calc.hours(totalField("extraDayMinutes"))}</strong> extra 50 %</span><span><strong>${Calc.hours(totalField("extraNightMinutes"))}</strong> extra 100 %</span><span><strong>${pending}</strong> FALTA pendiente</span>`;
        const warnings = [];
        if (pending) warnings.push(`${pending} FALTA deben justificarse o confirmarse.`);
        if (incomplete) warnings.push(`${incomplete} marcaciones tienen entrada o salida faltante.`);
        if (noSchedule) warnings.push(`${noSchedule} funcionario(s) no tienen horario asignado en el periodo.`);
        q("#hrCalculationWarnings").innerHTML = warnings.length ? `<strong>Antes de cerrar:</strong><ul>${warnings.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : '<div class="hr-import-ok">✓ El periodo no tiene bloqueos detectados.</div>';
        if (!calculations.length) {
            q("#hrCalculationList").innerHTML = '<div class="empty-state">No hay funcionarios o asignaciones para calcular.</div>';
            return;
        }
        q("#hrCalculationList").innerHTML = `<table class="hr-simple-table hr-calculation-table"><thead><tr><th>Funcionario</th><th>CI</th><th>Modalidad</th><th>Horario</th><th>Total horas</th><th>Días</th><th>Noct. 30 %</th><th>Extra 50 %</th><th>Extra 100 %</th><th>Dom./fer.</th><th>Dom./fer. noct.</th><th>Ausente</th><th>Horas faltantes</th><th>Vacaciones</th><th>Pendientes</th></tr></thead><tbody>${calculations.map(item => `<tr>
            <td><strong>${esc(item.person.fullName)}</strong><small>${esc(clientName(item.person))}</small></td><td>${esc(item.person.ci)}</td><td>${esc(item.person.workerType)}</td><td>${esc(item.scheduleName || "Sin asignar")}</td>
            <td>${Calc.hours(item.totals.actualMinutes)}</td><td>${item.details.filter(day => day.actualMinutes > 0).length}</td><td>${Calc.hours(item.totals.nightPremiumMinutes)}</td><td>${Calc.hours(item.totals.extraDayMinutes)}</td><td>${Calc.hours(item.totals.extraNightMinutes)}</td>
            <td>${Calc.hours(item.totals.sundayHolidayMinutes)}</td><td>${Calc.hours(item.totals.sundayHolidayNightMinutes)}</td><td>${item.totals.absentDays}</td><td>${Calc.hours(item.totals.missingMinutes)}</td><td>${item.totals.vacationDays}</td><td>${item.pending + item.incomplete}</td>
        </tr>`).join("")}</tbody></table>`;
    }

    q("#hrRunCalculation").addEventListener("click", () => runCalculations().catch(error => { console.error(error); A.notify("No se pudo calcular el periodo.", "error"); }));
    q("#hrExportCalculation").addEventListener("click", () => {
        if (!calculations.length) return;
        const summary = calculations.map(item => ({
            "Funcionario": item.person.fullName,
            "Cédula": item.person.ci,
            "Cliente": clientName(item.person),
            "Centro de costo": item.person.costCenter || C.clientById(item.person.clientId)?.costCenter || "",
            "Modalidad": item.person.workerType,
            "Horario": item.scheduleName,
            "Total horas": Calc.hours(item.totals.actualMinutes),
            "Días trabajados": item.details.filter(day => day.actualMinutes > 0).length,
            "Nocturnas 30%": Calc.hours(item.totals.nightPremiumMinutes),
            "Extras 50%": Calc.hours(item.totals.extraDayMinutes),
            "Extras 100%": Calc.hours(item.totals.extraNightMinutes),
            "Domingos/Feriados": Calc.hours(item.totals.sundayHolidayMinutes),
            "Domingos/Feriados nocturnas": Calc.hours(item.totals.sundayHolidayNightMinutes),
            "Ausente": item.totals.absentDays,
            "Horas faltantes": Calc.hours(item.totals.missingMinutes),
            "Vacaciones": item.totals.vacationDays,
            "Maternidad": item.totals.maternityDays,
            "Permiso": item.totals.permissionDays,
            "Reposo": item.totals.medicalDays,
            "FALTA pendiente": item.pending,
            "Marcación incompleta": item.incomplete
        }));
        const detail = calculations.flatMap(item => item.details.map(day => ({
            "Funcionario": item.person.fullName,
            "Cédula": item.person.ci,
            "Fecha": day.date,
            "Estado": day.statusLabel,
            "Horario previsto": Calc.hours(day.scheduledMinutes),
            "Horas registradas": Calc.hours(day.actualMinutes),
            "Nocturnas 30%": Calc.hours(day.nightPremiumMinutes),
            "Extras 50%": Calc.hours(day.extraDayMinutes),
            "Extras 100%": Calc.hours(day.extraNightMinutes),
            "Domingo/Feriado": Calc.hours(day.sundayHolidayMinutes),
            "Horas faltantes": Calc.hours(day.missingMinutes),
            "Observación": day.warnings.join(" ")
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), "RESUMEN");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detail), "DETALLE");
        XLSX.writeFile(workbook, `ATLAS_CALCULO_HORAS_${q("#hrCalculationPeriod").value}.xlsx`);
    });

    function renderCompliance() {
        const records = C.visible(A.readArray(KEYS.compliance)).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
        const pending = records.filter(item => item.status !== "done");
        q("#hrComplianceAlerts").innerHTML = pending.length ? pending.slice(0, 5).map(item => `<button data-go-compliance type="button"><strong>${esc(item.type === "entry" ? "Alta" : item.type === "exit" ? "Baja" : item.type)}</strong><span>${esc(personById(item.employeeId)?.fullName || "Funcionario")} · ${esc(item.dueDate || "")}</span></button>`).join("") : '<div class="empty-state">Sin pendientes generados.</div>';
        q("#hrComplianceList").innerHTML = records.length ? `<table class="hr-simple-table"><thead><tr><th>Funcionario</th><th>Gestión</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>${records.map(item => `<tr><td>${esc(personById(item.employeeId)?.fullName || "No encontrado")}</td><td>${esc(item.type === "entry" ? "Alta de funcionario" : item.type === "exit" ? "Baja de funcionario" : item.type)}</td><td>${esc(item.dueDate || "—")}</td><td>${item.status === "done" ? "Completado" : "Pendiente"}</td><td><button data-compliance="${esc(item.id)}" type="button">${item.status === "done" ? "Reabrir" : "Completar"}</button></td></tr>`).join("")}</tbody></table>` : '<div class="empty-state">No hay controles registrados.</div>';
    }
    q("#hrComplianceList").addEventListener("click", event => {
        const button = event.target.closest("[data-compliance]");
        if (!button) return;
        const records = A.readArray(KEYS.compliance).map(item => item.id === button.dataset.compliance ? { ...item, status: item.status === "done" ? "pending" : "done", completedAt: item.status === "done" ? "" : new Date().toISOString() } : item);
        save("compliance", records); renderCompliance();
    });
    q("#hrComplianceAlerts").addEventListener("click", event => { if (event.target.closest("[data-go-compliance]")) activateTab("compliance"); });

    q("#hrScheduleFrom").value = A.localDate();
    q("#hrAssignmentFrom").value = A.localDate();
    q("#hrAttendancePeriod").value = todayPeriod();
    q("#hrCalculationPeriod").value = todayPeriod();
    q("#hrAttendanceDate").value = A.localDate();
    renderSchedules();
    renderAssignments();
    renderCompliance();
    loadAttendance().catch(console.error);
    const requested = location.hash.slice(1);
    if (q(`[data-hr-tab="${CSS.escape(requested)}"]`)) activateTab(requested);
    window.addEventListener("atlas:hr-data-changed", () => { renderEmployeeOptions(); renderAssignments(); renderCompliance(); });

    window.AtlasHRSchedules = {
        all: () => schedules,
        assignments: () => assignments,
        scheduleFor,
        assignmentFor,
        activeRevision
    };
})();
