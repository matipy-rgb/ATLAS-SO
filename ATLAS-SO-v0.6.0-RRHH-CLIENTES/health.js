(function () {
    const A = window.Atlas;
    const KEY = "atlasHealthRecords";
    let records = A.readArray(KEY).map(item => ({
        ...item,
        date: String(item.date || A.localDate()).slice(0, 10),
        weight: item.weight === "" ? null : Number(item.weight || 0),
        sleep: item.sleep === "" ? null : Number(item.sleep || 0),
        water: item.water === "" ? null : Number(item.water || 0),
        workout: Boolean(item.workout),
        energy: item.energy ? Number(item.energy) : null
    }));

    const form = document.querySelector("#healthForm");
    const dateInput = document.querySelector("#healthDate");
    const list = document.querySelector("#healthList");

    function save() {
        records.sort((a, b) => b.date.localeCompare(a.date));
        A.writeJSON(KEY, records);
    }

    function average(items, property) {
        const values = items.map(item => Number(item[property])).filter(value => Number.isFinite(value) && value > 0);
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    }

    function dateOffset(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return A.localDate(date);
    }

    function loadIntoForm(date) {
        const record = records.find(item => item.date === date);
        document.querySelector("#healthWeight").value = record?.weight || "";
        document.querySelector("#healthSleep").value = record?.sleep || "";
        document.querySelector("#healthWater").value = record?.water || "";
        document.querySelector("#healthWorkout").checked = Boolean(record?.workout);
        document.querySelector("#healthEnergy").value = record?.energy || "";
        document.querySelector("#healthNote").value = record?.note || "";
        document.querySelector("#healthFormTitle").textContent = record ? "Actualizar el día" : "Registrar el día";
    }

    function render() {
        const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
        const latest = sorted[0];
        const previousWeight = sorted.find((item, index) => index > 0 && item.weight > 0);
        const sevenDays = sorted.filter(item => A.daysUntil(item.date) >= -6 && A.daysUntil(item.date) <= 0);
        const sleepAvg = average(sevenDays, "sleep");
        const waterAvg = average(sevenDays, "water");
        const currentMonth = A.localDate().slice(0, 7);
        const workouts = records.filter(item => item.date.slice(0, 7) === currentMonth && item.workout).length;
        const todayRecord = records.find(item => item.date === A.localDate());

        document.querySelector("#latestWeight").textContent = latest?.weight ? `${latest.weight.toLocaleString("es-PY")} kg` : "—";
        if (latest?.weight && previousWeight?.weight) {
            const diff = latest.weight - previousWeight.weight;
            document.querySelector("#weightChange").textContent = `${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg respecto al registro anterior`;
        } else {
            document.querySelector("#weightChange").textContent = "Sin referencia anterior";
        }
        document.querySelector("#averageSleep").textContent = sleepAvg ? `${sleepAvg.toFixed(1)} h` : "—";
        document.querySelector("#averageWater").textContent = waterAvg ? `${waterAvg.toFixed(1)} L` : "—";
        document.querySelector("#monthlyWorkouts").textContent = String(workouts);
        document.querySelector("#healthTodayStatus").textContent = todayRecord ? "Hoy ya está medido" : "Hoy sin registrar";
        document.querySelector("#healthListCaption").textContent = `${records.length} día(s) medido(s)`;

        document.querySelector("#healthWeek").innerHTML = Array.from({ length: 7 }, (_, index) => {
            const date = dateOffset(index - 6);
            const record = records.find(item => item.date === date);
            const day = A.parseDate(date);
            return `<div class="week-day ${record ? "done" : ""}"><span>${new Intl.DateTimeFormat("es-PY", { weekday: "short" }).format(day)}</span><strong>${day.getDate()}</strong><small>${record ? "✓" : "—"}</small></div>`;
        }).join("");

        const energyAvg = average(sevenDays, "energy");
        document.querySelector("#healthInsights").innerHTML = `
            <div class="stat-row"><span>Días medidos esta semana</span><strong>${sevenDays.length}/7</strong></div>
            <div class="stat-row"><span>Entrenamientos esta semana</span><strong>${sevenDays.filter(item => item.workout).length}</strong></div>
            <div class="stat-row"><span>Energía promedio</span><strong>${energyAvg ? `${energyAvg.toFixed(1)}/5` : "—"}</strong></div>
            <div class="stat-row"><span>Última medición</span><strong>${latest ? A.formatDate(latest.date) : "—"}</strong></div>
        `;

        if (!sorted.length) {
            list.innerHTML = '<div class="empty-state">Todavía no hay datos. Una medición honesta vale más que diez estimaciones.</div>';
        } else {
            list.innerHTML = sorted.slice(0, 18).map(item => `
                <article class="record-item">
                    <div class="record-main"><h3>${A.formatDate(item.date)}</h3><p><span>${item.sleep || "—"} h sueño</span><span>${item.water || "—"} L agua</span><span>${item.workout ? "Entrenó" : "Sin entrenamiento"}</span>${item.note ? `<span>${A.escapeHTML(item.note)}</span>` : ""}</p></div>
                    <div class="record-value"><strong>${item.weight ? `${item.weight} kg` : "Sin peso"}</strong><span>${item.energy ? `Energía ${item.energy}/5` : "Energía no medida"}</span></div>
                    <div class="record-actions"><button class="small-button" data-edit="${item.date}" type="button">Editar</button><button class="danger-button" data-delete="${item.date}" type="button">Eliminar</button></div>
                </article>
            `).join("");
        }
        A.updateNavCounts();
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        const date = dateInput.value;
        const record = {
            date,
            weight: Number(document.querySelector("#healthWeight").value) || null,
            sleep: Number(document.querySelector("#healthSleep").value) || null,
            water: Number(document.querySelector("#healthWater").value) || null,
            workout: document.querySelector("#healthWorkout").checked,
            energy: Number(document.querySelector("#healthEnergy").value) || null,
            note: document.querySelector("#healthNote").value.trim(),
            updatedAt: new Date().toISOString()
        };
        const index = records.findIndex(item => item.date === date);
        if (index >= 0) records[index] = { ...records[index], ...record };
        else records.push(record);
        save();
        render();
        A.notify(index >= 0 ? "Registro actualizado." : "Día registrado.");
    });

    dateInput.addEventListener("change", () => loadIntoForm(dateInput.value));
    list.addEventListener("click", event => {
        const edit = event.target.closest("[data-edit]");
        const remove = event.target.closest("[data-delete]");
        if (edit) {
            dateInput.value = edit.dataset.edit;
            loadIntoForm(edit.dataset.edit);
            form.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        if (remove && confirm("¿Eliminar esta medición?")) {
            records = records.filter(item => item.date !== remove.dataset.delete);
            save();
            render();
        }
    });

    document.querySelector("#focusHealthForm").addEventListener("click", () => {
        dateInput.value = A.localDate();
        loadIntoForm(dateInput.value);
        form.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    dateInput.value = A.localDate();
    loadIntoForm(dateInput.value);
    render();
})();
