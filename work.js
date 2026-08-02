(function () {
    const A = window.Atlas;
    const KEY = "atlasWorkRecords";
    const SETTINGS_KEY = "atlasWorkSettings";
    let records = A.readArray(KEY).map(normalizeRecord);
    let settings = { defaultHours: 8, hourlyRate: 0, discountRate: 0, ...A.readJSON(SETTINGS_KEY, {}) };
    let writingWorkData = false;

    const form = document.querySelector("#workForm");
    const idInput = document.querySelector("#workId");
    const dateInput = document.querySelector("#workDate");
    const descriptionInput = document.querySelector("#workDescription");
    const hoursInput = document.querySelector("#workHoursInput");
    const rateInput = document.querySelector("#workRate");
    const discountInput = document.querySelector("#workDiscountRate");
    const noteInput = document.querySelector("#workNote");
    const monthFilter = document.querySelector("#workMonthFilter");
    const list = document.querySelector("#workList");

    function normalizeRecord(item) {
        const hours = Number(item.hours || 0);
        const hourlyRate = Number(item.hourlyRate ?? item.rate ?? 0);
        const discountRate = Number(item.discountRate ?? item.discount ?? 0);
        const gross = Number(item.gross ?? hours * hourlyRate);
        const discountAmount = Number(item.discountAmount ?? gross * discountRate / 100);
        return {
            ...item,
            id: item.id || A.createId(),
            date: String(item.date || A.localDate()).slice(0, 10),
            description: item.description || item.client || "Jornada de trabajo",
            hours,
            hourlyRate,
            discountRate,
            gross,
            discountAmount,
            net: Number(item.net ?? gross - discountAmount)
        };
    }

    function save() {
        writingWorkData = true;
        try {
            A.writeJSON(KEY, records);
        } finally {
            writingWorkData = false;
        }
    }

    function reload() {
        records = A.readArray(KEY).map(normalizeRecord);
        settings = { defaultHours: 8, hourlyRate: 0, discountRate: 0, ...A.readJSON(SETTINGS_KEY, {}) };
        applySettings();
        render();
    }

    function resetForm() {
        form.reset();
        idInput.value = "";
        dateInput.value = A.localDate();
        applySettings();
        document.querySelector("#workFormTitle").textContent = "Registrar trabajo";
        document.querySelector("#workSaveButton").textContent = "Guardar jornada";
        document.querySelector("#workCancelEdit").hidden = true;
    }

    function editRecord(item) {
        idInput.value = item.id;
        dateInput.value = item.date;
        descriptionInput.value = item.description;
        hoursInput.value = item.hours;
        rateInput.value = item.hourlyRate;
        discountInput.value = item.discountRate;
        noteInput.value = item.note || "";
        document.querySelector("#workFormTitle").textContent = "Editar jornada";
        document.querySelector("#workSaveButton").textContent = "Guardar cambios";
        document.querySelector("#workCancelEdit").hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function applySettings() {
        hoursInput.value = settings.defaultHours;
        rateInput.value = settings.hourlyRate;
        discountInput.value = settings.discountRate;
        document.querySelector("#defaultHours").value = settings.defaultHours;
        document.querySelector("#defaultRate").value = settings.hourlyRate;
        document.querySelector("#defaultDiscount").value = settings.discountRate;
    }

    function render() {
        const month = monthFilter.value || A.localDate().slice(0, 7);
        const filtered = records.filter(item => item.date.slice(0, 7) === month).sort((a, b) => b.date.localeCompare(a.date));
        const hours = filtered.reduce((sum, item) => sum + item.hours, 0);
        const gross = filtered.reduce((sum, item) => sum + item.gross, 0);
        const discount = filtered.reduce((sum, item) => sum + item.discountAmount, 0);
        const net = filtered.reduce((sum, item) => sum + item.net, 0);

        document.querySelector("#workHours").textContent = `${hours.toLocaleString("es-PY")} h`;
        document.querySelector("#workDays").textContent = `${filtered.length} jornada(s)`;
        document.querySelector("#workGross").textContent = A.formatMoney(gross);
        document.querySelector("#workDiscount").textContent = A.formatMoney(discount);
        document.querySelector("#workNet").textContent = A.formatMoney(net);
        document.querySelector("#workListCaption").textContent = `${filtered.length} registro(s) en el mes`;

        const projection = document.querySelector("#workProjection");
        const average = filtered.length ? net / filtered.length : settings.defaultHours * settings.hourlyRate * (1 - settings.discountRate / 100);
        projection.innerHTML = settings.hourlyRate > 0
            ? `<strong>Referencia:</strong> una jornada habitual de ${settings.defaultHours} h deja aproximadamente <strong>${A.formatMoney(average)}</strong> netos.`
            : "<strong>Primer paso:</strong> configurá tu tarifa por hora y el descuento habitual.";

        if (!filtered.length) {
            list.innerHTML = '<div class="empty-state">No hay jornadas registradas en este mes.</div>';
        } else {
            list.innerHTML = filtered.map(item => `
                <article class="record-item">
                    <div class="record-main"><h3>${A.escapeHTML(item.description)}</h3><p><span>${A.formatDate(item.date)}</span><span>${item.hours} h × ${A.formatMoney(item.hourlyRate)}</span>${item.note ? `<span>${A.escapeHTML(item.note)}</span>` : ""}</p></div>
                    <div class="record-value"><strong>${A.formatMoney(item.net)}</strong><span>Bruto ${A.formatMoney(item.gross)} · −${item.discountRate}%</span></div>
                    <div class="record-actions"><button class="small-button" data-edit="${A.escapeHTML(String(item.id))}" type="button">Editar</button><button class="danger-button" data-delete="${A.escapeHTML(String(item.id))}" type="button">Eliminar</button></div>
                </article>
            `).join("");
        }
        A.updateNavCounts();
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        const hours = Number(hoursInput.value);
        const hourlyRate = Number(rateInput.value);
        const discountRate = Number(discountInput.value || 0);
        if (!dateInput.value || !descriptionInput.value.trim() || !Number.isFinite(hours) || hours <= 0 || !Number.isFinite(hourlyRate) || hourlyRate < 0) {
            A.notify("Completá fecha, descripción y una cantidad de horas válida.", "error");
            return;
        }
        const gross = hours * hourlyRate;
        const discountAmount = gross * discountRate / 100;
        const current = records.find(item => String(item.id) === idInput.value);
        const next = normalizeRecord({
            ...current,
            id: current?.id || A.createId(), date: dateInput.value, description: descriptionInput.value.trim(), hours,
            hourlyRate, discountRate, gross, discountAmount, net: gross - discountAmount,
            note: noteInput.value.trim(), createdAt: current?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        if (current) records = records.map(item => item === current ? next : item);
        else records.push(next);
        save();
        resetForm();
        render();
        A.notify(current ? "Jornada actualizada." : "Jornada registrada.");
    });

    document.querySelector("#workSettingsForm").addEventListener("submit", event => {
        event.preventDefault();
        settings = {
            defaultHours: Number(document.querySelector("#defaultHours").value || 8),
            hourlyRate: Number(document.querySelector("#defaultRate").value || 0),
            discountRate: Number(document.querySelector("#defaultDiscount").value || 0)
        };
        writingWorkData = true;
        try {
            A.writeJSON(SETTINGS_KEY, settings);
        } finally {
            writingWorkData = false;
        }
        applySettings();
        render();
        A.notify("Valores habituales guardados.");
    });

    list.addEventListener("click", event => {
        const edit = event.target.closest("[data-edit]");
        const remove = event.target.closest("[data-delete]");
        if (edit) {
            const item = records.find(record => String(record.id) === edit.dataset.edit);
            if (item) editRecord(item);
            return;
        }
        if (remove && confirm("¿Eliminar esta jornada?")) {
            records = records.filter(item => String(item.id) !== remove.dataset.delete);
            save();
            resetForm();
            render();
        }
    });

    monthFilter.addEventListener("change", render);
    document.querySelector("#focusWorkForm").addEventListener("click", () => {
        descriptionInput.focus();
        form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    document.querySelector("#workCancelEdit").addEventListener("click", resetForm);

    dateInput.value = A.localDate();
    monthFilter.value = A.localDate().slice(0, 7);
    applySettings();
    render();
    window.addEventListener("atlas:data-changed", event => {
        if (!writingWorkData && [KEY, SETTINGS_KEY].includes(event.detail?.key)) reload();
    });
    window.addEventListener("storage", event => {
        if (A.storageKeyMatches(event.key, KEY) || A.storageKeyMatches(event.key, SETTINGS_KEY)) reload();
    });
    window.addEventListener("pageshow", reload);
    window.addEventListener("focus", reload);
})();
