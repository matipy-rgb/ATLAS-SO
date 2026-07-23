(function () {
    const A = window.Atlas;
    const KEYS = {
        clients: "atlasHRClients",
        branches: "atlasHRBranches",
        schedules: "atlasHRSchedules",
        attendance: "atlasHRAttendance",
        compliance: "atlasHRCompliance"
    };
    const read = key => A.readArray(KEYS[key]);
    const write = (key, value) => A.writeJSON(KEYS[key], value);
    const money = value => `G. ${Math.round(Number(value) || 0).toLocaleString("es-PY")}`;
    const esc = A.escapeHTML;
    let clients = read("clients");
    let branches = read("branches");
    let schedules = read("schedules");
    let attendance = read("attendance");
    let compliance = read("compliance");

    function people() { return A.readArray("atlasHRPeople"); }
    function id() { return A.createId(); }
    function personName(personId) {
        return people().find(item => String(item.id) === String(personId))?.fullName || "Funcionario";
    }

    function activateTab(name) {
        document.querySelectorAll("[data-hr-tab]").forEach(button => {
            button.classList.toggle("active", button.dataset.hrTab === name);
        });
        document.querySelectorAll("[data-hr-panel]").forEach(panel => {
            panel.hidden = panel.dataset.hrPanel !== name;
        });
        const layout = document.querySelector(".hr-layout");
        const directory = document.querySelector(".hr-directory-panel");
        const main = document.querySelector(".hr-main-panel");
        if (name === "people") {
            layout.hidden = false;
            main.hidden = true;
            directory.hidden = false;
        } else if (name === "news") {
            layout.hidden = false;
            main.hidden = false;
            directory.hidden = false;
        } else {
            main.hidden = false;
        }
        history.replaceState(null, "", `#${name}`);
    }

    document.querySelector(".hr-module-nav")?.addEventListener("click", event => {
        const button = event.target.closest("[data-hr-tab]");
        if (button) activateTab(button.dataset.hrTab);
    });

    function renderClientOptions() {
        const options = clients
            .sort((a, b) => a.name.localeCompare(b.name, "es"))
            .map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join("");
        const select = document.querySelector("#hrBranchClient");
        if (select) select.innerHTML = `<option value="">Seleccionar cliente</option>${options}`;
        renderEmployeeStructureOptions();
    }

    function renderEmployeeStructureOptions() {
        const clientSelect = document.querySelector("#employeeClient");
        const branchSelect = document.querySelector("#employeeBranch");
        const scheduleSelect = document.querySelector("#employeeSchedule");
        if (!clientSelect || !branchSelect || !scheduleSelect) return;
        const selectedClient = clientSelect.value;
        const selectedBranch = branchSelect.value;
        const selectedSchedule = scheduleSelect.value;
        clientSelect.innerHTML = `<option value="">Sin cliente asignado</option>${clients.map(item => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("")}`;
        if (clients.some(item => item.name === selectedClient)) clientSelect.value = selectedClient;
        const client = clients.find(item => item.name === clientSelect.value);
        const availableBranches = branches.filter(item => !client || item.clientId === client.id);
        branchSelect.innerHTML = `<option value="">Sin sucursal asignada</option>${availableBranches.map(item => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("")}`;
        if (availableBranches.some(item => item.name === selectedBranch)) branchSelect.value = selectedBranch;
        scheduleSelect.innerHTML = `<option value="">Sin horario asignado</option>${schedules.map(item => `<option value="${item.id}">${esc(item.name)} · ${esc(item.start)}–${esc(item.end)}</option>`).join("")}`;
        if (schedules.some(item => item.id === selectedSchedule)) scheduleSelect.value = selectedSchedule;
    }

    function renderStructure() {
        renderClientOptions();
        const target = document.querySelector("#hrStructureList");
        if (!target) return;
        if (!clients.length) {
            target.innerHTML = '<div class="empty-state">Todavía no cargaste clientes ni sucursales.</div>';
            return;
        }
        target.innerHTML = clients.map(client => {
            const items = branches.filter(branch => branch.clientId === client.id);
            return `<article class="hr-data-card">
                <div><small>${esc(client.code || "SIN CÓDIGO")}</small><strong>${esc(client.name)}</strong>
                <span>${items.length} sucursal${items.length === 1 ? "" : "es"}</span></div>
                <ul>${items.length ? items.map(branch => `<li><b>${esc(branch.name)}</b><span>${esc(branch.address || "Sin ubicación")}</span><button data-delete-branch="${branch.id}" type="button">Eliminar</button></li>`).join("") : "<li>Sin sucursales registradas</li>"}</ul>
                <button data-delete-client="${client.id}" class="hr-delete-link" type="button">Eliminar cliente</button>
            </article>`;
        }).join("");
    }

    document.querySelector("#hrClientForm")?.addEventListener("submit", event => {
        event.preventDefault();
        const name = document.querySelector("#hrClientName").value.trim();
        if (clients.some(item => item.name.toLowerCase() === name.toLowerCase())) {
            A.notify("Ese cliente ya existe.", "error"); return;
        }
        clients.push({ id: id(), name, code: document.querySelector("#hrClientCode").value.trim(), active: true });
        write("clients", clients); event.target.reset(); renderStructure();
        A.notify("Cliente guardado.", "success");
    });

    document.querySelector("#hrBranchForm")?.addEventListener("submit", event => {
        event.preventDefault();
        branches.push({
            id: id(),
            clientId: document.querySelector("#hrBranchClient").value,
            name: document.querySelector("#hrBranchName").value.trim(),
            address: document.querySelector("#hrBranchAddress").value.trim()
        });
        write("branches", branches); event.target.reset(); renderStructure();
        A.notify("Sucursal guardada.", "success");
    });

    document.querySelector("#hrStructureList")?.addEventListener("click", event => {
        const branchId = event.target.dataset.deleteBranch;
        const clientId = event.target.dataset.deleteClient;
        if (branchId) {
            branches = branches.filter(item => item.id !== branchId); write("branches", branches);
        }
        if (clientId) {
            if (branches.some(item => item.clientId === clientId)) {
                A.notify("Eliminá primero las sucursales de este cliente.", "error"); return;
            }
            clients = clients.filter(item => item.id !== clientId); write("clients", clients);
        }
        renderStructure();
    });
    document.querySelector("#employeeClient")?.addEventListener("change", renderEmployeeStructureOptions);

    function minutes(time) {
        const [hour, minute] = String(time || "00:00").split(":").map(Number);
        return hour * 60 + minute;
    }
    function scheduleDuration(item) {
        let total = minutes(item.end) - minutes(item.start);
        if (total <= 0) total += 1440;
        return Math.max(0, total - Number(item.breakMinutes || 0));
    }
    function scheduleSegments(item) {
        let start = minutes(item.start), end = minutes(item.end);
        if (end <= start) end += 1440;
        let night = 0;
        for (let point = start; point < end; point += 1) {
            const minuteOfDay = point % 1440;
            if (minuteOfDay >= 1200 || minuteOfDay < 360) night += 1;
        }
        return { night, day: end - start - night };
    }
    function renderSchedules() {
        const target = document.querySelector("#hrScheduleList");
        if (!target) return;
        target.innerHTML = schedules.length ? schedules.map(item => {
            const total = scheduleDuration(item);
            const segments = scheduleSegments(item);
            const warning = total > 8 * 60 ? "Jornada extensa: revisar extras y descanso." : (minutes(item.end) <= minutes(item.start) ? "Cruza medianoche." : "Jornada dentro del mismo día.");
            return `<article class="hr-data-card hr-schedule-card">
                <div><small>HORARIO</small><strong>${esc(item.name)}</strong><span>${esc(item.start)}–${esc(item.end)} · ${(total / 60).toFixed(2)} h netas</span></div>
                <p>Diurnas: ${(segments.day / 60).toFixed(2)} h · nocturnas: ${(segments.night / 60).toFixed(2)} h. ${esc(warning)} Tolerancia: ${item.tolerance || 0} min.</p>
                <button data-delete-schedule="${item.id}" class="hr-delete-link" type="button">Eliminar</button>
            </article>`;
        }).join("") : '<div class="empty-state">Creá el primer tipo de horario.</div>';
        renderEmployeeStructureOptions();
    }

    document.querySelector("#hrScheduleForm")?.addEventListener("submit", event => {
        event.preventDefault();
        schedules.push({
            id: id(),
            name: document.querySelector("#hrScheduleName").value.trim(),
            start: document.querySelector("#hrScheduleStart").value,
            end: document.querySelector("#hrScheduleEnd").value,
            breakMinutes: Number(document.querySelector("#hrScheduleBreak").value || 0),
            tolerance: Number(document.querySelector("#hrScheduleTolerance").value || 0)
        });
        write("schedules", schedules); event.target.reset(); renderSchedules();
        A.notify("Horario creado.", "success");
    });
    document.querySelector("#hrScheduleList")?.addEventListener("click", event => {
        const targetId = event.target.dataset.deleteSchedule;
        if (!targetId) return;
        schedules = schedules.filter(item => item.id !== targetId);
        write("schedules", schedules); renderSchedules();
    });

    function renderEmployeeOptions() {
        const options = people().filter(item => item.active !== false)
            .map(item => `<option value="${item.id}">${esc(item.fullName)} · CI ${esc(item.ci || "—")}</option>`).join("");
        const select = document.querySelector("#hrAttendanceEmployee");
        if (select) select.innerHTML = `<option value="">Seleccionar funcionario</option>${options}`;
    }
    function renderAttendance() {
        renderEmployeeOptions();
        const visible = [...attendance].sort((a, b) => `${b.date}${b.in || ""}`.localeCompare(`${a.date}${a.in || ""}`));
        const summary = document.querySelector("#hrAttendanceSummary");
        if (summary) {
            const missing = visible.filter(item => item.status === "missing").length;
            const incomplete = visible.filter(item => item.status === "worked" && (!item.in || !item.out)).length;
            summary.innerHTML = `<span><strong>${visible.length}</strong> registros</span><span><strong>${missing}</strong> faltas</span><span><strong>${incomplete}</strong> incompletas</span>`;
        }
        const target = document.querySelector("#hrAttendanceList");
        if (!target) return;
        if (!visible.length) { target.innerHTML = '<div class="empty-state">No hay marcaciones cargadas.</div>'; return; }
        target.innerHTML = `<table class="hr-simple-table"><thead><tr><th>Funcionario</th><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Estado</th><th></th></tr></thead><tbody>${visible.map(item => `
            <tr><td>${esc(personName(item.employeeId))}</td><td>${esc(item.date)}</td><td>${esc(item.in || "—")}</td><td>${esc(item.out || "—")}</td><td>${esc(item.status === "missing" ? "FALTA" : item.status === "holiday" ? "FERIADO" : item.status === "leave" ? "JUSTIFICADA" : "TRABAJÓ")}</td><td><button data-delete-attendance="${item.id}" type="button">Eliminar</button></td></tr>`).join("")}</tbody></table>`;
    }

    document.querySelector("#hrAttendanceForm")?.addEventListener("submit", event => {
        event.preventDefault();
        attendance.push({
            id: id(),
            employeeId: document.querySelector("#hrAttendanceEmployee").value,
            date: document.querySelector("#hrAttendanceDate").value,
            in: document.querySelector("#hrAttendanceIn").value,
            out: document.querySelector("#hrAttendanceOut").value,
            status: document.querySelector("#hrAttendanceStatus").value
        });
        write("attendance", attendance); event.target.reset(); renderAttendance();
        A.notify("Marcación guardada.", "success");
    });
    document.querySelector("#hrAttendanceList")?.addEventListener("click", event => {
        const targetId = event.target.dataset.deleteAttendance;
        if (!targetId) return;
        attendance = attendance.filter(item => item.id !== targetId);
        write("attendance", attendance); renderAttendance();
    });

    function splitCSV(line, separator) {
        const result = []; let current = ""; let quoted = false;
        for (let i = 0; i < line.length; i += 1) {
            const char = line[i];
            if (char === '"') quoted = !quoted;
            else if (char === separator && !quoted) { result.push(current.trim()); current = ""; }
            else current += char;
        }
        result.push(current.trim()); return result;
    }
    document.querySelector("#hrAttendanceFile")?.addEventListener("change", async event => {
        const file = event.target.files?.[0]; if (!file) return;
        const text = await file.text(); const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) { A.notify("El CSV no contiene registros.", "error"); return; }
        const separator = lines[0].includes(";") ? ";" : ",";
        const headers = splitCSV(lines[0], separator).map(item => item.toLowerCase());
        const column = names => headers.findIndex(header => names.some(name => header.includes(name)));
        const idx = { name: column(["nombre"]), employeeId: column(["id"]), date: column(["fecha"]), in: column(["entrada"]), out: column(["salida"]) };
        let imported = 0;
        lines.slice(1).forEach(line => {
            const values = splitCSV(line, separator);
            const person = people().find(item => String(item.clockId || "") === values[idx.employeeId] || item.fullName?.toLowerCase() === values[idx.name]?.toLowerCase());
            if (!person || !values[idx.date]) return;
            const status = String(values[idx.out] || "").toUpperCase() === "FALTA" ? "missing" : "worked";
            attendance.push({ id: id(), employeeId: person.id, date: values[idx.date], in: values[idx.in] || "", out: status === "missing" ? "" : values[idx.out] || "", status });
            imported += 1;
        });
        write("attendance", attendance); renderAttendance();
        A.notify(`${imported} marcación${imported === 1 ? "" : "es"} importada${imported === 1 ? "" : "s"}.`, imported ? "success" : "error");
        event.target.value = "";
    });

    function ensureCompliance() {
        const existing = new Set(compliance.map(item => `${item.employeeId}:${item.agency}:${item.action}`));
        people().forEach(person => {
            const action = person.active === false ? "Salida" : "Ingreso";
            ["IPS", "MTESS"].forEach(agency => {
                const key = `${person.id}:${agency}:${action}`;
                if (!existing.has(key)) compliance.push({ id: id(), employeeId: person.id, agency, action, status: "pending", date: "", reference: "" });
            });
        });
        write("compliance", compliance);
    }
    function renderCompliance() {
        ensureCompliance();
        const target = document.querySelector("#hrComplianceList");
        const alerts = document.querySelector("#hrComplianceAlerts");
        const pending = compliance.filter(item => item.status !== "confirmed");
        if (alerts) alerts.innerHTML = pending.length ? pending.slice(0, 6).map(item => `<button data-open-compliance type="button"><strong>${esc(item.agency)} · ${esc(item.action)}</strong><span>${esc(personName(item.employeeId))}</span></button>`).join("") : '<div class="empty-state">No hay ingresos ni salidas pendientes.</div>';
        if (!target) return;
        target.innerHTML = compliance.length ? `<table class="hr-simple-table"><thead><tr><th>Funcionario</th><th>Institución</th><th>Gestión</th><th>Estado</th><th>Fecha</th><th>Documento</th></tr></thead><tbody>${compliance.map(item => `
            <tr><td>${esc(personName(item.employeeId))}</td><td>${esc(item.agency)}</td><td>${esc(item.action)}</td><td><select data-compliance-status="${item.id}"><option value="pending" ${item.status === "pending" ? "selected" : ""}>Pendiente</option><option value="submitted" ${item.status === "submitted" ? "selected" : ""}>Presentado</option><option value="confirmed" ${item.status === "confirmed" ? "selected" : ""}>Confirmado</option><option value="na" ${item.status === "na" ? "selected" : ""}>No corresponde</option></select></td><td><input data-compliance-date="${item.id}" type="date" value="${esc(item.date || "")}"></td><td><input data-compliance-ref="${item.id}" value="${esc(item.reference || "")}" placeholder="N.º o referencia"></td></tr>`).join("")}</tbody></table>` : '<div class="empty-state">Cargá funcionarios para generar controles.</div>';
    }
    document.querySelector("#hrComplianceList")?.addEventListener("change", event => {
        const element = event.target;
        const targetId = element.dataset.complianceStatus || element.dataset.complianceDate || element.dataset.complianceRef;
        const item = compliance.find(row => row.id === targetId); if (!item) return;
        if (element.dataset.complianceStatus) item.status = element.value;
        if (element.dataset.complianceDate) item.date = element.value;
        if (element.dataset.complianceRef) item.reference = element.value.trim();
        write("compliance", compliance); renderCompliance();
    });
    document.querySelector("#hrComplianceAlerts")?.addEventListener("click", () => activateTab("compliance"));

    document.querySelector("#hrPayrollForm")?.addEventListener("submit", event => {
        event.preventDefault();
        const salary = Number(document.querySelector("#hrSalary").value || 0);
        const type = document.querySelector("#hrWorkerType").value;
        const baseDay = type === "parttime" ? salary / 208 : salary / 240;
        const baseNight = baseDay * 1.30 * (8 / 7);
        const values = {
            day: Number(document.querySelector("#hrDayHours").value || 0) * baseDay,
            night: Number(document.querySelector("#hrNightHours").value || 0) * baseNight,
            extraDay: Number(document.querySelector("#hrExtraDay").value || 0) * baseDay * 1.5,
            extraNight: Number(document.querySelector("#hrExtraNight").value || 0) * baseNight * 2,
            holiday: Number(document.querySelector("#hrHolidayHours").value || 0) * baseDay * 2,
            absence: Number(document.querySelector("#hrAbsentDays").value || 0) * (salary / 30)
        };
        const earnings = values.day + values.night + values.extraDay + values.extraNight + values.holiday;
        const total = Math.max(0, earnings - values.absence);
        document.querySelector("#hrPayrollResult").innerHTML = `
            <div><span>Valor hora diurna</span><strong>${money(baseDay)}</strong></div>
            <div><span>Valor hora nocturna</span><strong>${money(baseNight)}</strong></div>
            <div><span>Ordinarias diurnas</span><strong>${money(values.day)}</strong></div>
            <div><span>Ordinarias nocturnas</span><strong>${money(values.night)}</strong></div>
            <div><span>Extras diurnas +50 %</span><strong>${money(values.extraDay)}</strong></div>
            <div><span>Extras nocturnas +100 %</span><strong>${money(values.extraNight)}</strong></div>
            <div><span>Domingos / feriados</span><strong>${money(values.holiday)}</strong></div>
            <div class="negative"><span>Descuento por ausencias</span><strong>− ${money(values.absence)}</strong></div>
            <div class="total"><span>Total calculado</span><strong>${money(total)}</strong></div>`;
    });

    const originalWrite = A.writeJSON;
    A.writeJSON = function (key, value) {
        originalWrite(key, value);
        if (key === "atlasHRPeople") setTimeout(() => { renderEmployeeOptions(); renderCompliance(); }, 0);
    };

    renderStructure();
    renderSchedules();
    renderAttendance();
    renderCompliance();
    document.querySelector("#hrAttendanceDate").value = A.localDate();
    activateTab(location.hash.replace("#", "") || "overview");
})();
