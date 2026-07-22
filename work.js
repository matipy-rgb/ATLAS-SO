(function () {
    const A = window.Atlas;
    const KEY = "atlasWorkRecords";
    const SETTINGS_KEY = "atlasWorkSettings";
    let records = A.readArray(KEY).map(normalizeRecord);
    let settings = { defaultHours: 4, hourlyRate: 14635, discountRate: 9, ...A.readJSON(SETTINGS_KEY, {}) };

    const form = document.querySelector("#workForm");
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
        A.writeJSON(KEY, records);
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
        projection.innerHTML = `<strong>Referencia:</strong> una jornada habitual de ${settings.defaultHours} h deja aproximadamente <strong>${A.formatMoney(average)}</strong> netos.`;

        if (!filtered.length) {
            list.innerHTML = '<div class="empty-state">No hay jornadas registradas en este mes.</div>';
        } else {
            list.innerHTML = filtered.map(item => `
                <article class="record-item">
                    <div class="record-main"><h3>${A.escapeHTML(item.description)}</h3><p><span>${A.formatDate(item.date)}</span><span>${item.hours} h × ${A.formatMoney(item.hourlyRate)}</span>${item.note ? `<span>${A.escapeHTML(item.note)}</span>` : ""}</p></div>
                    <div class="record-value"><strong>${A.formatMoney(item.net)}</strong><span>Bruto ${A.formatMoney(item.gross)} · −${item.discountRate}%</span></div>
                    <div class="record-actions"><button class="danger-button" data-delete="${item.id}" type="button">Eliminar</button></div>
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
        const gross = hours * hourlyRate;
        const discountAmount = gross * discountRate / 100;
        records.push(normalizeRecord({
            id: A.createId(), date: dateInput.value, description: descriptionInput.value.trim(), hours,
            hourlyRate, discountRate, gross, discountAmount, net: gross - discountAmount,
            note: noteInput.value.trim(), createdAt: new Date().toISOString()
        }));
        save();
        form.reset();
        dateInput.value = A.localDate();
        applySettings();
        render();
        A.notify("Jornada registrada.");
    });

    document.querySelector("#workSettingsForm").addEventListener("submit", event => {
        event.preventDefault();
        settings = {
            defaultHours: Number(document.querySelector("#defaultHours").value || 4),
            hourlyRate: Number(document.querySelector("#defaultRate").value || 0),
            discountRate: Number(document.querySelector("#defaultDiscount").value || 0)
        };
        A.writeJSON(SETTINGS_KEY, settings);
        applySettings();
        render();
        A.notify("Valores habituales guardados.");
    });

    list.addEventListener("click", event => {
        const button = event.target.closest("[data-delete]");
        if (!button || !confirm("¿Eliminar esta jornada?")) return;
        records = records.filter(item => String(item.id) !== button.dataset.delete);
        save();
        render();
    });

    monthFilter.addEventListener("change", render);
    document.querySelector("#focusWorkForm").addEventListener("click", () => {
        descriptionInput.focus();
        form.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    dateInput.value = A.localDate();
    monthFilter.value = A.localDate().slice(0, 7);
    applySettings();
    render();
})();
