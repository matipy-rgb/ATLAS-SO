(function () {
    "use strict";

    const A = window.Atlas;
    const C = window.AtlasHRContext;
    const PEOPLE_KEY = "atlasHRPeople";
    const ABSENCES_KEY = "atlasHRAbsences";
    const PAGE_SIZE = 100;
    const typeLabels = {
        vacation: "Vacaciones",
        medical: "Reposo médico",
        maternity: "Maternidad",
        permission: "Permiso",
        suspension: "Suspensión",
        other: "Otro"
    };
    const q = selector => document.querySelector(selector);
    const esc = A.escapeHTML;
    let page = 1;

    function derivedStatus(item) {
        const raw = item?.status || (item?.active === false ? "inactive" : "active");
        if (raw === "active") return "active";
        return String(item?.endDate || "").slice(0, 7) === A.localDate().slice(0, 7)
            ? "inactive-month"
            : "inactive";
    }

    function normalizePerson(item) {
        const legacyClient = String(item?.client || item?.department || "").trim().toLowerCase();
        const linkedClient = item?.clientId || C.company.clients.find(client =>
            client.name.toLowerCase() === legacyClient || client.id === legacyClient
        )?.id || (C.isGeneral ? "" : C.active.clientId);
        const status = derivedStatus(item);
        const salary = Number(item?.salary);
        return {
            id: String(item?.id || A.createId()),
            ci: String(item?.ci || "").replace(/\D/g, ""),
            fullName: String(item?.fullName || item?.name || "").trim(),
            clientId: String(linkedClient || ""),
            position: String(item?.position || "").trim(),
            costCenter: String(item?.costCenter || "").trim(),
            clockId: String(item?.clockId || "").trim(),
            startDate: item?.startDate || "",
            endDate: item?.endDate || "",
            status,
            statusNote: String(item?.statusNote || ""),
            active: status === "active",
            workerType: item?.workerType || "monthly",
            salary: Number.isFinite(salary) && salary >= 0 ? salary : 0,
            birthDate: item?.birthDate || "",
            sex: String(item?.sex || ""),
            civilStatus: String(item?.civilStatus || ""),
            nationality: String(item?.nationality || "Paraguaya"),
            profession: String(item?.profession || ""),
            city: String(item?.city || ""),
            address: String(item?.address || ""),
            phone: String(item?.phone || ""),
            email: String(item?.email || ""),
            sourceData: item?.sourceData || {},
            createdAt: item?.createdAt || new Date().toISOString(),
            updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString()
        };
    }

    function normalizeAbsence(item) {
        return {
            id: String(item?.id || A.createId()),
            employeeId: String(item?.employeeId || ""),
            type: typeLabels[item?.type] ? item.type : "other",
            startDate: item?.startDate || "",
            endDate: item?.endDate || "",
            returnDate: item?.returnDate || "",
            note: String(item?.note || item?.notes || "").trim(),
            actualReturnDate: item?.actualReturnDate || "",
            cancelled: Boolean(item?.cancelled),
            createdAt: item?.createdAt || new Date().toISOString(),
            updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString()
        };
    }

    const storedPeople = A.readArray(PEOPLE_KEY);
    let people = storedPeople.map(normalizePerson);
    let absences = A.readArray(ABSENCES_KEY).map(normalizeAbsence);
    if (JSON.stringify(storedPeople) !== JSON.stringify(people)) A.writeJSON(PEOPLE_KEY, people);
    if (absences.length) A.writeJSON(ABSENCES_KEY, absences);

    function savePeople() {
        A.writeJSON(PEOPLE_KEY, people);
        window.dispatchEvent(new CustomEvent("atlas:hr-data-changed", { detail: { type: "people" } }));
    }
    function saveAbsences() {
        A.writeJSON(ABSENCES_KEY, absences);
        window.dispatchEvent(new CustomEvent("atlas:hr-data-changed", { detail: { type: "absences" } }));
    }
    function personById(id) { return people.find(item => String(item.id) === String(id)); }
    function clientName(person) { return C.clientById(person?.clientId)?.name || "Sin cliente"; }
    function scopedPeople() { return C.visible(people); }
    function scopedAbsences() {
        const ids = new Set(scopedPeople().map(person => String(person.id)));
        return absences.filter(item => ids.has(String(item.employeeId)));
    }

    function statusLabel(status) {
        return status === "inactive-month" ? "Inactivo del mes" : status === "inactive" ? "Inactivo" : "Activo";
    }

    function addDays(value, amount) {
        const date = A.parseDate(value);
        if (!date) return "";
        date.setDate(date.getDate() + amount);
        return A.localDate(date);
    }

    function firstWorkdayAfter(endDate, employeeId = "") {
        let date = addDays(endDate, 1);
        for (let count = 0; count < 14; count += 1) {
            const day = A.parseDate(date)?.getDay();
            const assigned = employeeId ? window.AtlasHRSchedules?.scheduleFor(employeeId, date) : null;
            if (assigned ? window.AtlasHRCalc?.scheduleRule(assigned, date) : day !== 0) return date;
            date = addDays(date, 1);
        }
        return date;
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

    function renderSummary() {
        const visiblePeople = scopedPeople();
        const active = visiblePeople.filter(item => item.status === "active");
        const inactiveMonth = visiblePeople.filter(item => item.status === "inactive-month" || (item.status !== "active" && item.endDate.slice(0, 7) === A.localDate().slice(0, 7)));
        const visibleAbsences = scopedAbsences();
        const absentToday = visibleAbsences.filter(item => absenceStatus(item).key === "active");
        const overdue = visibleAbsences.filter(item => absenceStatus(item).key === "overdue");
        q("#hrPeopleCount").textContent = active.length;
        q("#hrPeopleCaption").textContent = `${visiblePeople.length.toLocaleString("es-PY")} en la nómina`;
        q("#hrInactiveMonthCount").textContent = inactiveMonth.length;
        q("#hrActiveCount").textContent = absentToday.length;
        q("#hrActiveCaption").textContent = absentToday.length ? "Con novedad vigente" : "Sin ausencias activas";
        q("#hrOverdueCount").textContent = overdue.length;
        q("#hrNextReturn").textContent = overdue.length ? "Requieren confirmación" : "Sin pendientes";
        const attention = q("#hrAttention");
        if (overdue.length) {
            attention.hidden = false;
            attention.innerHTML = `<strong>${overdue.length} reintegro(s) necesitan confirmación.</strong> Revisalos en Novedades.`;
        } else attention.hidden = true;
    }

    function filteredPeople() {
        const query = q("#hrPeopleSearch").value.trim().toLocaleLowerCase("es");
        const status = q("#hrPeopleStatus").value;
        const client = q("#hrPeopleClient").value;
        return scopedPeople().filter(item => {
            const text = `${item.fullName} ${item.ci} ${item.clockId} ${item.position} ${clientName(item)}`.toLocaleLowerCase("es");
            return (!query || text.includes(query))
                && (status === "all" || item.status === status || (status === "inactive-month" && item.status !== "active" && item.endDate.slice(0, 7) === A.localDate().slice(0, 7)))
                && (client === "all" || item.clientId === client);
        }).sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
    }

    function renderPeopleFilters() {
        const select = q("#hrPeopleClient");
        const selected = select.value;
        select.innerHTML = `<option value="all">Todos los clientes</option>${C.company.clients.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}`;
        select.value = C.isGeneral ? (C.company.clients.some(item => item.id === selected) ? selected : "all") : C.active.clientId;
        select.disabled = !C.isGeneral;
    }

    function renderPeople() {
        renderPeopleFilters();
        const filtered = filteredPeople();
        const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        page = Math.min(page, maxPage);
        const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        q("#hrPeopleListCaption").textContent = `${filtered.length.toLocaleString("es-PY")} registro(s) · mostrando hasta ${PAGE_SIZE} por página`;
        q("#hrPeoplePage").textContent = `Página ${page} de ${maxPage}`;
        q("#hrPeoplePrev").disabled = page <= 1;
        q("#hrPeopleNext").disabled = page >= maxPage;
        if (!slice.length) {
            q("#hrEmployeeList").innerHTML = '<div class="empty-state">No hay funcionarios con estos filtros.</div>';
            return;
        }
        q("#hrEmployeeList").innerHTML = `<table class="hr-simple-table"><thead><tr><th>Funcionario</th><th>Cédula</th><th>Reloj</th><th>Cliente</th><th>Cargo</th><th>Ingreso</th><th>Estado</th><th></th></tr></thead><tbody>${slice.map(item => `
            <tr class="${item.status === "active" ? "" : "hr-row-inactive"}">
                <td><strong>${esc(item.fullName)}</strong></td><td>${esc(item.ci || "—")}</td><td>${esc(item.clockId || "—")}</td>
                <td>${esc(clientName(item))}</td><td>${esc(item.position || "—")}</td><td>${esc(item.startDate || "—")}</td>
                <td><span class="hr-person-status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></td>
                <td><button data-person-edit="${esc(item.id)}" type="button">Editar</button></td>
            </tr>`).join("")}</tbody></table>`;
    }

    function renderEmployeeClientOptions(selected = "") {
        q("#employeeClient").innerHTML = `<option value="">Seleccionar cliente</option>${C.company.clients.filter(item => item.active !== false).map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}`;
        q("#employeeClient").value = selected || (C.isGeneral ? "" : C.active.clientId);
    }

    function setField(id, value) {
        const element = q(id);
        if (element) element.value = value ?? "";
    }

    function updateSalaryHelp() {
        const type = q("#employeeWorkerType").value;
        q("#employeeSalaryHelp").textContent = type === "daily"
            ? "Ingresá el jornal nominal por día."
            : type === "parttime"
                ? "Ingresá el monto mensual acordado para tiempo parcial."
                : "Ingresá el salario nominal mensual.";
    }

    function openEmployee(item = null) {
        q("#employeeForm").reset();
        setField("#employeeId", item?.id);
        setField("#employeeCI", item?.ci);
        setField("#employeeName", item?.fullName);
        setField("#employeeClockId", item?.clockId);
        renderEmployeeClientOptions(item?.clientId);
        setField("#employeePosition", item?.position);
        setField("#employeeCostCenter", item?.costCenter);
        setField("#employeeStartDate", item?.startDate);
        setField("#employeeEndDate", item?.endDate);
        setField("#employeeStatus", item?.status === "active" || !item ? "active" : "inactive");
        setField("#employeeWorkerType", item?.workerType || "monthly");
        setField("#employeeSalary", item ? item.salary : 0);
        updateSalaryHelp();
        setField("#employeeBirthDate", item?.birthDate);
        setField("#employeeSex", item?.sex);
        setField("#employeeCivilStatus", item?.civilStatus);
        setField("#employeeNationality", item?.nationality || "Paraguaya");
        setField("#employeeProfession", item?.profession);
        setField("#employeeCity", item?.city);
        setField("#employeeAddress", item?.address);
        setField("#employeePhone", item?.phone);
        setField("#employeeEmail", item?.email);
        setField("#employeeStatusNote", item?.statusNote);
        q("#employeeDialogTitle").textContent = item ? "Editar funcionario" : "Nuevo funcionario";
        q("#employeeDialog").showModal();
        q("#employeeCI").focus();
    }

    function closeEmployee() {
        if (q("#employeeDialog").open) q("#employeeDialog").close();
        q("#employeeForm").reset();
    }

    function addCompliance(person, type) {
        const list = A.readArray("atlasHRCompliance");
        const today = A.localDate();
        const duplicate = list.some(item => item.employeeId === person.id && item.type === type && item.status !== "done");
        if (!duplicate) {
            list.unshift({
                id: String(A.createId()),
                employeeId: person.id,
                clientId: person.clientId,
                type,
                status: "pending",
                dueDate: today,
                createdAt: new Date().toISOString()
            });
            A.writeJSON("atlasHRCompliance", list);
        }
    }

    q("#employeeForm").addEventListener("submit", event => {
        event.preventDefault();
        const id = q("#employeeId").value;
        const ci = q("#employeeCI").value.replace(/\D/g, "");
        if (people.some(item => item.ci && item.ci === ci && item.id !== id)) return A.notify("Ya existe un funcionario con esa cédula.", "error");
        if (people.some(item => item.clockId && q("#employeeClockId").value.trim() && item.clockId === q("#employeeClockId").value.trim() && item.id !== id)) return A.notify("Ese ID del reloj ya está vinculado.", "error");
        const current = people.find(item => item.id === id);
        const status = q("#employeeStatus").value;
        const startDate = q("#employeeStartDate").value;
        const endDate = q("#employeeEndDate").value;
        if (status !== "active" && !endDate) return A.notify("Indicá la fecha de salida para inactivar al funcionario.", "error");
        if (startDate && endDate && A.parseDate(endDate) < A.parseDate(startDate)) return A.notify("La fecha de salida no puede ser anterior al ingreso.", "error");
        const next = normalizePerson({
            ...current,
            id: current?.id || String(A.createId()),
            ci,
            fullName: q("#employeeName").value,
            clockId: q("#employeeClockId").value,
            clientId: q("#employeeClient").value,
            position: q("#employeePosition").value,
            costCenter: q("#employeeCostCenter").value,
            startDate,
            endDate,
            status,
            statusNote: q("#employeeStatusNote").value,
            workerType: q("#employeeWorkerType").value,
            salary: q("#employeeSalary").value,
            birthDate: q("#employeeBirthDate").value,
            sex: q("#employeeSex").value,
            civilStatus: q("#employeeCivilStatus").value,
            nationality: q("#employeeNationality").value,
            profession: q("#employeeProfession").value,
            city: q("#employeeCity").value,
            address: q("#employeeAddress").value,
            phone: q("#employeePhone").value,
            email: q("#employeeEmail").value,
            updatedAt: new Date().toISOString()
        });
        if (!next.clientId) return A.notify("Seleccioná el cliente real del funcionario.", "error");
        people = current ? people.map(item => item.id === current.id ? next : item) : [next, ...people];
        savePeople();
        if (!current && next.status === "active") addCompliance(next, "entry");
        if (current?.status === "active" && next.status !== "active") addCompliance(next, "exit");
        if (current?.status !== "active" && next.status === "active") addCompliance(next, "entry");
        closeEmployee();
        renderAll();
        A.notify(current ? "Funcionario actualizado." : "Funcionario agregado.");
    });

    function visibleAbsences() {
        const query = q("#hrSearch").value.trim().toLocaleLowerCase("es");
        return scopedAbsences().filter(item => {
            const person = personById(item.employeeId) || {};
            const status = absenceStatus(item);
            const text = `${person.fullName || ""} ${person.ci || ""} ${clientName(person)} ${person.position || ""}`.toLocaleLowerCase("es");
            const wantedStatus = q("#hrStatusFilter").value;
            const statusOk = wantedStatus === "all"
                || (wantedStatus === "open" && !item.actualReturnDate && !item.cancelled)
                || wantedStatus === status.key
                || (wantedStatus === "return" && status.group === "return")
                || (wantedStatus === "completed" && status.group === "completed");
            return (!query || text.includes(query)) && (q("#hrTypeFilter").value === "all" || item.type === q("#hrTypeFilter").value) && statusOk;
        }).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
    }

    function renderAbsences() {
        const records = visibleAbsences();
        q("#hrListCaption").textContent = `${records.length} registro(s)`;
        if (!records.length) {
            q("#hrAbsenceList").innerHTML = '<div class="empty-state">No hay novedades con estos filtros.</div>';
            return;
        }
        q("#hrAbsenceList").innerHTML = records.map(item => {
            const person = personById(item.employeeId) || {};
            const state = absenceStatus(item);
            return `<article class="hr-absence-card" data-state="${esc(state.key)}">
                <div><div class="hr-context"><span>${esc(clientName(person))}</span><span>CI ${esc(person.ci || "—")}</span></div>
                <h3>${esc(person.fullName || "Funcionario no encontrado")}</h3>
                <p><span class="hr-type-badge">${esc(typeLabels[item.type])}</span> <span class="hr-status-badge ${esc(state.key)}">${esc(state.label)}</span></p>
                <p class="hr-date-line">${A.formatDate(item.startDate)} → ${A.formatDate(item.endDate)} · reintegro ${A.formatDate(item.returnDate)}</p>
                ${item.note ? `<p class="hr-note">${esc(item.note)}</p>` : ""}</div>
                <div class="hr-card-actions">
                    ${!item.actualReturnDate && !item.cancelled && state.key !== "upcoming" ? `<button data-absence-return="${esc(item.id)}" type="button">Confirmar reintegro</button>` : ""}
                    ${!item.actualReturnDate && !item.cancelled ? `<button data-absence-edit="${esc(item.id)}" type="button">Editar</button>` : ""}
                    <button data-absence-cancel="${esc(item.id)}" type="button">${item.cancelled ? "Reactivar" : "Anular"}</button>
                </div></article>`;
        }).join("");
    }

    function renderAbsenceOptions(selected = "") {
        q("#absenceEmployee").innerHTML = `<option value="">Seleccionar funcionario</option>${scopedPeople().filter(item => item.status === "active" || item.id === selected).sort((a, b) => a.fullName.localeCompare(b.fullName, "es")).map(item => `<option value="${esc(item.id)}">${esc(item.fullName)} · CI ${esc(item.ci)}</option>`).join("")}`;
        q("#absenceEmployee").value = selected;
    }

    function openAbsence(item = null) {
        if (!scopedPeople().some(person => person.status === "active")) return A.notify("Primero agregá un funcionario activo en esta vista.", "error");
        q("#absenceForm").reset();
        setField("#absenceId", item?.id);
        renderAbsenceOptions(item?.employeeId || "");
        setField("#absenceType", item?.type || "vacation");
        setField("#absenceStart", item?.startDate || A.localDate());
        setField("#absenceEnd", item?.endDate || A.localDate());
        setField("#absenceReturn", item?.returnDate || firstWorkdayAfter(A.localDate(), item?.employeeId));
        setField("#absenceNote", item?.note);
        q("#absenceDialogTitle").textContent = item ? "Editar novedad" : "Registrar ausencia";
        updateAbsencePreview();
        q("#absenceDialog").showModal();
    }

    function updateAbsencePreview(autoReturn = false) {
        const start = q("#absenceStart").value;
        const end = q("#absenceEnd").value;
        if (autoReturn && end) q("#absenceReturn").value = firstWorkdayAfter(end, q("#absenceEmployee").value);
        const total = calendarDays(start, end);
        q("#absencePreview").textContent = total ? `${total} día(s) calendario · reintegro ${A.formatDate(q("#absenceReturn").value)}` : "Revisá el rango de fechas.";
    }

    q("#absenceForm").addEventListener("submit", event => {
        event.preventDefault();
        const id = q("#absenceId").value;
        if (!calendarDays(q("#absenceStart").value, q("#absenceEnd").value)) return A.notify("El rango de fechas no es válido.", "error");
        if (A.parseDate(q("#absenceReturn").value) <= A.parseDate(q("#absenceEnd").value)) return A.notify("El reintegro debe ser posterior al último día.", "error");
        const current = absences.find(item => item.id === id);
        const overlaps = absences.some(item => item.id !== id
            && item.employeeId === q("#absenceEmployee").value
            && !item.cancelled
            && item.startDate <= q("#absenceEnd").value
            && item.endDate >= q("#absenceStart").value);
        if (overlaps) return A.notify("Ese funcionario ya tiene una novedad que se superpone con estas fechas.", "error");
        const next = normalizeAbsence({
            ...current,
            id: current?.id || String(A.createId()),
            employeeId: q("#absenceEmployee").value,
            type: q("#absenceType").value,
            startDate: q("#absenceStart").value,
            endDate: q("#absenceEnd").value,
            returnDate: q("#absenceReturn").value,
            note: q("#absenceNote").value,
            updatedAt: new Date().toISOString()
        });
        absences = current ? absences.map(item => item.id === id ? next : item) : [next, ...absences];
        saveAbsences();
        q("#absenceDialog").close();
        renderAll();
        A.notify(current ? "Novedad actualizada." : "Novedad registrada.");
    });

    function renderAll() {
        renderSummary();
        renderPeople();
        renderAbsences();
    }

    [q("#openEmployeeDialog"), q("#openEmployeeDialogInline")].forEach(button => button?.addEventListener("click", () => openEmployee()));
    q("#closeEmployeeDialog").addEventListener("click", closeEmployee);
    q("#cancelEmployee").addEventListener("click", closeEmployee);
    q("#openAbsenceDialog").addEventListener("click", () => openAbsence());
    q("#closeAbsenceDialog").addEventListener("click", () => q("#absenceDialog").close());
    q("#cancelAbsence").addEventListener("click", () => q("#absenceDialog").close());
    q("#hrEmployeeList").addEventListener("click", event => {
        const button = event.target.closest("[data-person-edit]");
        if (button) openEmployee(personById(button.dataset.personEdit));
    });
    q("#hrAbsenceList").addEventListener("click", event => {
        const edit = event.target.closest("[data-absence-edit]");
        const returned = event.target.closest("[data-absence-return]");
        const cancelled = event.target.closest("[data-absence-cancel]");
        if (edit) openAbsence(absences.find(item => item.id === edit.dataset.absenceEdit));
        if (returned) {
            absences = absences.map(item => item.id === returned.dataset.absenceReturn ? { ...item, actualReturnDate: A.localDate(), updatedAt: new Date().toISOString() } : item);
            saveAbsences(); renderAll();
        }
        if (cancelled && window.confirm(cancelled.textContent.trim() === "Reactivar" ? "¿Reactivar esta novedad?" : "¿Anular esta novedad sin borrar su historial?")) {
            absences = absences.map(item => item.id === cancelled.dataset.absenceCancel
                ? { ...item, cancelled: !item.cancelled, updatedAt: new Date().toISOString() }
                : item);
            saveAbsences(); renderAll();
        }
    });
    ["#hrPeopleSearch", "#hrPeopleStatus", "#hrPeopleClient"].forEach(selector => q(selector).addEventListener("input", () => { page = 1; renderPeople(); }));
    q("#employeeWorkerType").addEventListener("change", updateSalaryHelp);
    ["#hrSearch", "#hrStatusFilter", "#hrTypeFilter"].forEach(selector => q(selector).addEventListener("input", renderAbsences));
    q("#hrPeoplePrev").addEventListener("click", () => { page = Math.max(1, page - 1); renderPeople(); });
    q("#hrPeopleNext").addEventListener("click", () => { page += 1; renderPeople(); });
    q("#absenceEnd").addEventListener("change", () => updateAbsencePreview(true));
    q("#absenceEmployee").addEventListener("change", () => updateAbsencePreview(true));
    ["#absenceStart", "#absenceReturn"].forEach(selector => q(selector).addEventListener("change", () => updateAbsencePreview(false)));
    window.addEventListener("atlas:hr-data-changed", event => {
        if (event.detail?.type === "people-import") {
            people = A.readArray(PEOPLE_KEY).map(normalizePerson);
            renderAll();
        }
    });

    window.AtlasHRPeople = {
        all: () => people,
        visible: scopedPeople,
        byId: personById,
        clientName,
        normalize: normalizePerson,
        refresh() {
            people = A.readArray(PEOPLE_KEY).map(normalizePerson);
            absences = A.readArray(ABSENCES_KEY).map(normalizeAbsence);
            renderAll();
        }
    };
    renderAll();
})();
