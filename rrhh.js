(function () {
    const A = window.Atlas;
    const PEOPLE_KEY = "atlasHRPeople";
    const ABSENCES_KEY = "atlasHRAbsences";
    const typeLabels = {
        vacation: "Vacaciones",
        medical: "Reposo médico",
        maternity: "Reposo por maternidad",
        permission: "Permiso",
        suspension: "Suspensión",
        other: "Otro"
    };

    const elements = {
        peopleCount: document.querySelector("#hrPeopleCount"),
        peopleCaption: document.querySelector("#hrPeopleCaption"),
        activeCount: document.querySelector("#hrActiveCount"),
        activeCaption: document.querySelector("#hrActiveCaption"),
        weekReturns: document.querySelector("#hrWeekReturns"),
        nextReturn: document.querySelector("#hrNextReturn"),
        overdueCount: document.querySelector("#hrOverdueCount"),
        attention: document.querySelector("#hrAttention"),
        listCaption: document.querySelector("#hrListCaption"),
        absenceList: document.querySelector("#hrAbsenceList"),
        employeeList: document.querySelector("#hrEmployeeList"),
        search: document.querySelector("#hrSearch"),
        statusFilter: document.querySelector("#hrStatusFilter"),
        typeFilter: document.querySelector("#hrTypeFilter"),
        employeeDialog: document.querySelector("#employeeDialog"),
        employeeForm: document.querySelector("#employeeForm"),
        absenceDialog: document.querySelector("#absenceDialog"),
        absenceForm: document.querySelector("#absenceForm"),
        absenceEmployee: document.querySelector("#absenceEmployee"),
        absencePreview: document.querySelector("#absencePreview")
    };

    let people = A.readArray(PEOPLE_KEY).map(normalizePerson);
    let absences = A.readArray(ABSENCES_KEY).map(normalizeAbsence);
    let renderedDate = A.localDate();

    function normalizePerson(item) {
        return {
            id: item.id || A.createId(),
            ci: String(item.ci || "").replace(/\D/g, ""),
            fullName: String(item.fullName || item.name || "").trim(),
            client: String(item.client || item.department || "").trim(),
            position: String(item.position || "").trim(),
            workDays: Array.isArray(item.workDays) && item.workDays.length ? item.workDays.map(Number) : [1, 2, 3, 4, 5, 6],
            active: item.active !== false,
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
        };
    }

    function normalizeAbsence(item) {
        return {
            id: item.id || A.createId(),
            employeeId: item.employeeId,
            type: typeLabels[item.type] ? item.type : "other",
            startDate: item.startDate || "",
            endDate: item.endDate || "",
            returnDate: item.returnDate || "",
            note: String(item.note || item.notes || "").trim(),
            actualReturnDate: item.actualReturnDate || "",
            cancelled: Boolean(item.cancelled),
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
        };
    }

    function savePeople() { A.writeJSON(PEOPLE_KEY, people); }
    function saveAbsences() { A.writeJSON(ABSENCES_KEY, absences); }
    function personById(id) { return people.find(item => String(item.id) === String(id)); }

    function addDays(value, amount) {
        const date = A.parseDate(value);
        date.setDate(date.getDate() + amount);
        return A.localDate(date);
    }

    function firstWorkdayAfter(endDate, workDays) {
        let candidate = addDays(endDate, 1);
        const allowed = new Set((workDays || [1, 2, 3, 4, 5, 6]).map(Number));
        for (let index = 0; index < 14; index += 1) {
            if (allowed.has(A.parseDate(candidate).getDay())) return candidate;
            candidate = addDays(candidate, 1);
        }
        return addDays(endDate, 1);
    }

    function calendarDays(start, end) {
        const first = A.parseDate(start);
        const last = A.parseDate(end);
        if (!first || !last || last < first) return 0;
        return Math.round((last - first) / 86400000) + 1;
    }

    function absenceStatus(item) {
        if (item.cancelled) return { key: "cancelled", label: "Anulada", group: "completed" };
        if (item.actualReturnDate) return { key: "completed", label: `Reintegrado · ${A.formatDate(item.actualReturnDate)}`, group: "completed" };
        const start = A.daysUntil(item.startDate);
        const end = A.daysUntil(item.endDate);
        const returns = A.daysUntil(item.returnDate || item.endDate);
        if (returns < 0) return { key: "overdue", label: `Reintegro pendiente · ${Math.abs(returns)} día(s)`, group: "return" };
        if (returns === 0) return { key: "return-today", label: "Debe presentarse hoy", group: "return" };
        if (start > 0) return { key: "upcoming", label: `Comienza en ${start} día(s)`, group: "upcoming" };
        if (end >= 0) return { key: "active", label: end === 0 ? "Último día" : `${end + 1} día(s) restantes`, group: "active" };
        return { key: "return", label: `Se presenta en ${returns} día(s)`, group: "return" };
    }

    function counterFor(item, status) {
        const total = calendarDays(item.startDate, item.endDate);
        if (status.key === "completed") return { value: total, label: "día(s) registrados" };
        if (status.key === "upcoming") return { value: total, label: "día(s) programados" };
        if (status.key === "overdue") return { value: Math.abs(A.daysUntil(item.returnDate)), label: "día(s) sin confirmar" };
        if (status.group === "return") return { value: Math.max(0, A.daysUntil(item.returnDate)), label: "día(s) para presentarse" };
        return { value: Math.max(0, A.daysUntil(item.endDate) + 1), label: "día(s) de ausencia" };
    }

    function renderSummary() {
        const activePeople = people.filter(item => item.active);
        const statuses = absences.map(item => ({ item, status: absenceStatus(item) }));
        const active = statuses.filter(entry => entry.status.key === "active");
        const overdue = statuses.filter(entry => entry.status.key === "overdue");
        const returns = statuses.filter(entry => {
            const days = A.daysUntil(entry.item.returnDate || entry.item.endDate);
            return !entry.item.actualReturnDate && !entry.item.cancelled && days >= 0 && days <= 7;
        }).sort((a, b) => String(a.item.returnDate).localeCompare(String(b.item.returnDate)));

        elements.peopleCount.textContent = activePeople.length;
        elements.peopleCaption.textContent = people.length === activePeople.length ? `${people.length} en el directorio` : `${people.length - activePeople.length} inactivo(s)`;
        elements.activeCount.textContent = active.length;
        elements.activeCaption.textContent = active.length ? active.map(entry => personById(entry.item.employeeId)?.fullName).filter(Boolean).slice(0, 2).join(" · ") : "Sin ausencias activas";
        elements.weekReturns.textContent = returns.length;
        elements.nextReturn.textContent = returns[0] ? `${personById(returns[0].item.employeeId)?.fullName || "Funcionario"} · ${A.formatDate(returns[0].item.returnDate)}` : "Agenda despejada";
        elements.overdueCount.textContent = overdue.length;

        if (!overdue.length && !returns.some(entry => A.daysUntil(entry.item.returnDate) === 0)) {
            elements.attention.hidden = true;
            return;
        }
        const messages = [
            ...overdue.map(entry => `${personById(entry.item.employeeId)?.fullName || "Funcionario"}: confirmar reintegro pendiente.`),
            ...returns.filter(entry => A.daysUntil(entry.item.returnDate) === 0).map(entry => `${personById(entry.item.employeeId)?.fullName || "Funcionario"}: debe presentarse hoy.`)
        ];
        elements.attention.innerHTML = `<strong>Requiere atención hoy</strong><ul class="hr-attention-list">${messages.map(item => `<li>${A.escapeHTML(item)}</li>`).join("")}</ul>`;
        elements.attention.hidden = false;
    }

    function visibleAbsences() {
        const query = elements.search.value.trim().toLocaleLowerCase("es");
        return absences.filter(item => {
            const person = personById(item.employeeId) || {};
            const status = absenceStatus(item);
            const searchable = `${person.fullName || ""} ${person.ci || ""} ${person.client || ""} ${person.position || ""}`.toLocaleLowerCase("es");
            const matchesQuery = !query || searchable.includes(query);
            const matchesType = elements.typeFilter.value === "all" || item.type === elements.typeFilter.value;
            const selectedStatus = elements.statusFilter.value;
            let matchesStatus = true;
            if (selectedStatus === "open") matchesStatus = !item.actualReturnDate && !item.cancelled;
            else if (selectedStatus === "active") matchesStatus = status.key === "active";
            else if (selectedStatus === "upcoming") matchesStatus = status.key === "upcoming";
            else if (selectedStatus === "return") matchesStatus = status.group === "return";
            else if (selectedStatus === "completed") matchesStatus = status.group === "completed";
            return matchesQuery && matchesType && matchesStatus;
        }).sort((a, b) => {
            const order = { overdue: 0, "return-today": 1, active: 2, return: 3, upcoming: 4, completed: 5, cancelled: 6 };
            const stateDifference = order[absenceStatus(a).key] - order[absenceStatus(b).key];
            return stateDifference || String(a.returnDate || a.endDate).localeCompare(String(b.returnDate || b.endDate));
        });
    }

    function renderAbsences() {
        const visible = visibleAbsences();
        elements.listCaption.textContent = `${visible.length} registro${visible.length === 1 ? "" : "s"}`;
        if (!visible.length) {
            elements.absenceList.innerHTML = `<div class="empty-state">${absences.length ? "No hay coincidencias con estos filtros." : "Todavía no registraste ausencias."}</div>`;
            return;
        }
        elements.absenceList.innerHTML = visible.map(item => {
            const person = personById(item.employeeId) || { fullName: "Funcionario no encontrado" };
            const status = absenceStatus(item);
            const counter = counterFor(item, status);
            const canReturn = !item.actualReturnDate && !item.cancelled && status.key !== "upcoming";
            return `
                <article class="hr-absence-card" data-state="${status.key}">
                    <div>
                        <div class="hr-context"><span>${A.escapeHTML(person.client || "Sin área")}</span><span>CI ${A.escapeHTML(person.ci || "—")}</span><span>${A.escapeHTML(person.position || "Sin cargo")}</span></div>
                        <h3>${A.escapeHTML(person.fullName)}</h3>
                        <div class="hr-context"><span class="hr-type-badge">${A.escapeHTML(typeLabels[item.type])}</span><span class="hr-status-badge ${status.key === "return-today" ? "active" : status.key}">${A.escapeHTML(status.label)}</span></div>
                        <p class="hr-date-line">Desde ${A.formatDate(item.startDate)} hasta ${A.formatDate(item.endDate)} · <strong>se presenta ${A.formatDate(item.returnDate)}</strong></p>
                        ${item.note ? `<p class="hr-note">${A.escapeHTML(item.note)}</p>` : ""}
                    </div>
                    <div class="hr-absence-side">
                        <div class="hr-day-counter"><strong>${counter.value}</strong><span>${counter.label}</span></div>
                        <div class="hr-card-actions">
                            ${canReturn ? `<button class="confirm-return" data-action="return" data-id="${item.id}" type="button">Confirmar reintegro</button>` : ""}
                            ${!item.actualReturnDate && !item.cancelled ? `<button data-action="edit" data-id="${item.id}" type="button">Editar / extender</button>` : ""}
                            <button class="delete-absence" data-action="delete" data-id="${item.id}" type="button">Eliminar</button>
                        </div>
                    </div>
                </article>`;
        }).join("");
    }

    function renderEmployees() {
        if (!people.length) {
            elements.employeeList.innerHTML = '<div class="empty-state">Agregá el primer funcionario para registrar novedades.</div>';
            return;
        }
        elements.employeeList.innerHTML = [...people].sort((a, b) => a.fullName.localeCompare(b.fullName, "es")).map(item => `
            <article class="hr-employee-card ${item.active ? "" : "inactive"}">
                <span class="hr-employee-avatar">${A.escapeHTML(item.fullName.slice(0, 1).toUpperCase() || "?")}</span>
                <span class="hr-employee-copy"><strong>${A.escapeHTML(item.fullName)}</strong><span>CI ${A.escapeHTML(item.ci || "—")} · ${A.escapeHTML(item.client || "Sin área")}</span></span>
                <span class="hr-employee-menu">
                    <button data-person-action="edit" data-id="${item.id}" type="button" title="Editar">✎</button>
                    <button data-person-action="toggle" data-id="${item.id}" type="button" title="${item.active ? "Desactivar" : "Reactivar"}">${item.active ? "–" : "+"}</button>
                </span>
            </article>`).join("");
    }

    function renderEmployeeOptions(selected = "") {
        const active = people.filter(item => item.active || String(item.id) === String(selected));
        elements.absenceEmployee.innerHTML = `<option value="">Seleccionar funcionario</option>${active.sort((a, b) => a.fullName.localeCompare(b.fullName, "es")).map(item => `<option value="${item.id}">${A.escapeHTML(item.fullName)} · CI ${A.escapeHTML(item.ci || "—")}</option>`).join("")}`;
        elements.absenceEmployee.value = String(selected || "");
    }

    function renderAll() {
        renderSummary();
        renderAbsences();
        renderEmployees();
        renderEmployeeOptions();
        A.updateNavCounts();
    }

    function closeEmployeeDialog() { if (elements.employeeDialog.open) elements.employeeDialog.close(); elements.employeeForm.reset(); document.querySelector("#employeeId").value = ""; }
    function openEmployee(item = null) {
        elements.employeeForm.reset();
        document.querySelectorAll('[name="workday"]').forEach(input => { input.checked = (item?.workDays || [1, 2, 3, 4, 5, 6]).includes(Number(input.value)); });
        document.querySelector("#employeeId").value = item?.id || "";
        document.querySelector("#employeeCI").value = item?.ci || "";
        document.querySelector("#employeeName").value = item?.fullName || "";
        document.querySelector("#employeeClient").value = item?.client || "";
        document.querySelector("#employeePosition").value = item?.position || "";
        document.querySelector("#employeeDialogTitle").textContent = item ? "Editar funcionario" : "Nuevo funcionario";
        elements.employeeDialog.showModal();
        document.querySelector("#employeeCI").focus();
    }

    elements.employeeForm.addEventListener("submit", event => {
        event.preventDefault();
        const id = document.querySelector("#employeeId").value;
        const ci = document.querySelector("#employeeCI").value.replace(/\D/g, "");
        const duplicate = people.find(item => item.ci && item.ci === ci && String(item.id) !== String(id));
        if (duplicate) { A.notify("Ya existe un funcionario con esa cédula.", "error"); return; }
        const current = people.find(item => String(item.id) === String(id));
        const next = normalizePerson({
            ...current,
            id: current?.id || A.createId(),
            ci,
            fullName: document.querySelector("#employeeName").value,
            client: document.querySelector("#employeeClient").value,
            position: document.querySelector("#employeePosition").value,
            workDays: Array.from(document.querySelectorAll('[name="workday"]:checked'), input => Number(input.value)),
            active: current?.active !== false,
            updatedAt: new Date().toISOString()
        });
        if (!next.workDays.length) { A.notify("Elegí al menos un día habitual de trabajo.", "error"); return; }
        people = current ? people.map(item => String(item.id) === String(current.id) ? next : item) : [...people, next];
        savePeople();
        closeEmployeeDialog();
        renderAll();
        A.notify(current ? "Funcionario actualizado." : "Funcionario agregado.");
    });

    function updateAbsencePreview(forceReturn = false) {
        const employee = personById(elements.absenceEmployee.value);
        const start = document.querySelector("#absenceStart").value;
        const end = document.querySelector("#absenceEnd").value;
        if (end && employee && forceReturn) document.querySelector("#absenceReturn").value = firstWorkdayAfter(end, employee.workDays);
        const total = calendarDays(start, end);
        const returnDate = document.querySelector("#absenceReturn").value;
        elements.absencePreview.textContent = total ? `${total} día(s) calendario · reintegro previsto: ${A.formatDate(returnDate)}` : "Elegí fechas válidas para calcular la duración.";
    }

    function closeAbsenceDialog() { if (elements.absenceDialog.open) elements.absenceDialog.close(); elements.absenceForm.reset(); document.querySelector("#absenceId").value = ""; }
    function openAbsence(item = null) {
        if (!people.some(person => person.active)) { A.notify("Primero agregá un funcionario activo.", "error"); openEmployee(); return; }
        elements.absenceForm.reset();
        document.querySelector("#absenceId").value = item?.id || "";
        renderEmployeeOptions(item?.employeeId || "");
        document.querySelector("#absenceType").value = item?.type || "vacation";
        document.querySelector("#absenceStart").value = item?.startDate || A.localDate();
        document.querySelector("#absenceEnd").value = item?.endDate || A.localDate();
        document.querySelector("#absenceReturn").value = item?.returnDate || firstWorkdayAfter(A.localDate(), personById(elements.absenceEmployee.value)?.workDays);
        document.querySelector("#absenceNote").value = item?.note || "";
        document.querySelector("#absenceDialogTitle").textContent = item ? "Editar o extender ausencia" : "Registrar ausencia";
        updateAbsencePreview(!item);
        elements.absenceDialog.showModal();
        elements.absenceEmployee.focus();
    }

    elements.absenceForm.addEventListener("submit", event => {
        event.preventDefault();
        const id = document.querySelector("#absenceId").value;
        const startDate = document.querySelector("#absenceStart").value;
        const endDate = document.querySelector("#absenceEnd").value;
        const returnDate = document.querySelector("#absenceReturn").value;
        if (!calendarDays(startDate, endDate)) { A.notify("La fecha final no puede ser anterior a la inicial.", "error"); return; }
        if (A.parseDate(returnDate) <= A.parseDate(endDate)) { A.notify("El reintegro debe ser posterior al último día de ausencia.", "error"); return; }
        const current = absences.find(item => String(item.id) === String(id));
        const next = normalizeAbsence({
            ...current,
            id: current?.id || A.createId(),
            employeeId: elements.absenceEmployee.value,
            type: document.querySelector("#absenceType").value,
            startDate,
            endDate,
            returnDate,
            note: document.querySelector("#absenceNote").value,
            updatedAt: new Date().toISOString()
        });
        absences = current ? absences.map(item => String(item.id) === String(current.id) ? next : item) : [...absences, next];
        saveAbsences();
        closeAbsenceDialog();
        renderAll();
        A.notify(current ? "Ausencia actualizada." : "Ausencia registrada.");
    });

    elements.absenceList.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const item = absences.find(entry => String(entry.id) === String(button.dataset.id));
        if (!item) return;
        if (button.dataset.action === "edit") openAbsence(item);
        if (button.dataset.action === "return") {
            if (!confirm(`¿Confirmar que ${personById(item.employeeId)?.fullName || "el funcionario"} se reintegró hoy?`)) return;
            item.actualReturnDate = A.localDate();
            item.updatedAt = new Date().toISOString();
            saveAbsences(); renderAll(); A.notify("Reintegro confirmado.");
        }
        if (button.dataset.action === "delete") {
            if (!confirm("¿Eliminar definitivamente este registro de ausencia?")) return;
            absences = absences.filter(entry => String(entry.id) !== String(item.id));
            saveAbsences(); renderAll(); A.notify("Registro eliminado.");
        }
    });

    elements.employeeList.addEventListener("click", event => {
        const button = event.target.closest("button[data-person-action]");
        if (!button) return;
        const item = personById(button.dataset.id);
        if (!item) return;
        if (button.dataset.personAction === "edit") openEmployee(item);
        if (button.dataset.personAction === "toggle") {
            item.active = !item.active;
            item.updatedAt = new Date().toISOString();
            savePeople(); renderAll(); A.notify(item.active ? "Funcionario reactivado." : "Funcionario desactivado.");
        }
    });

    document.querySelector("#openEmployeeDialog").addEventListener("click", () => openEmployee());
    document.querySelector("#openAbsenceDialog").addEventListener("click", () => openAbsence());
    ["#closeEmployeeDialog", "#cancelEmployee"].forEach(selector => document.querySelector(selector).addEventListener("click", closeEmployeeDialog));
    ["#closeAbsenceDialog", "#cancelAbsence"].forEach(selector => document.querySelector(selector).addEventListener("click", closeAbsenceDialog));
    [elements.search, elements.statusFilter, elements.typeFilter].forEach(control => control.addEventListener(control === elements.search ? "input" : "change", renderAbsences));
    elements.absenceEmployee.addEventListener("change", () => updateAbsencePreview(true));
    document.querySelector("#absenceStart").addEventListener("change", () => updateAbsencePreview(false));
    document.querySelector("#absenceEnd").addEventListener("change", () => updateAbsencePreview(true));
    document.querySelector("#absenceReturn").addEventListener("change", () => updateAbsencePreview(false));
    [elements.employeeDialog, elements.absenceDialog].forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); }));

    window.setInterval(() => {
        const today = A.localDate();
        if (today !== renderedDate) { renderedDate = today; renderAll(); }
    }, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) renderAll(); });
    renderAll();
})();
