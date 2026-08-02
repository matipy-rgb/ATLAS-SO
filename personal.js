(function () {
    const A = window.Atlas;
    const KEY = "atlasHabits";
    const areaLabels = { health: "Salud", study: "Estudios", finance: "Finanzas", personal: "Personal", work: "Trabajo" };
    let habits = A.readArray(KEY).map(item => ({
        ...item,
        id: item.id || A.createId(),
        name: item.name || item.title || "Hábito",
        area: item.area || item.category || "personal",
        history: Array.isArray(item.history) ? [...new Set(item.history.map(String))] : []
    }));
    let writingHabits = false;

    const list = document.querySelector("#habitList");
    const dialog = document.querySelector("#habitDialog");
    const form = document.querySelector("#habitForm");

    function save() {
        writingHabits = true;
        try {
            A.writeJSON(KEY, habits);
        } finally {
            writingHabits = false;
        }
    }

    function reload() {
        habits = A.readArray(KEY).map(item => ({
            ...item,
            id: item.id || A.createId(),
            name: item.name || item.title || "Hábito",
            area: item.area || item.category || "personal",
            history: Array.isArray(item.history) ? [...new Set(item.history.map(String))] : []
        }));
        render();
    }

    function resetForm() {
        form.reset();
        document.querySelector("#habitId").value = "";
        document.querySelector("#habitDialogTitle").textContent = "Agregar hábito";
        document.querySelector("#habitSaveButton").textContent = "Agregar hábito";
    }

    function openHabit(item = null) {
        resetForm();
        if (item) {
            document.querySelector("#habitId").value = item.id;
            document.querySelector("#habitName").value = item.name;
            document.querySelector("#habitArea").value = item.area;
            document.querySelector("#habitDialogTitle").textContent = "Editar hábito";
            document.querySelector("#habitSaveButton").textContent = "Guardar cambios";
        }
        dialog.showModal();
        document.querySelector("#habitName").focus();
    }

    function dateOffset(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return A.localDate(date);
    }

    function streak(habit) {
        const history = new Set(habit.history);
        let date = A.localDate();
        if (!history.has(date)) date = dateOffset(-1);
        let count = 0;
        while (history.has(date)) {
            count += 1;
            const parsed = A.parseDate(date);
            parsed.setDate(parsed.getDate() - 1);
            date = A.localDate(parsed);
        }
        return count;
    }

    function render() {
        const today = A.localDate();
        const done = habits.filter(item => item.history.includes(today)).length;
        const progress = habits.length ? Math.round(done / habits.length * 100) : 0;
        const best = habits.length ? Math.max(...habits.map(streak)) : 0;
        const dates = Array.from({ length: 7 }, (_, index) => dateOffset(index - 6));
        const possible = habits.length * 7;
        const weeklyDone = habits.reduce((sum, habit) => sum + dates.filter(date => habit.history.includes(date)).length, 0);
        const weekRate = possible ? Math.round(weeklyDone / possible * 100) : 0;

        document.querySelector("#habitCount").textContent = habits.length;
        document.querySelector("#habitDoneToday").textContent = done;
        document.querySelector("#habitTodayCaption").textContent = habits.length ? `${progress}% del día` : "Sin hábitos";
        document.querySelector("#habitBestStreak").textContent = `${best} día${best === 1 ? "" : "s"}`;
        document.querySelector("#habitWeekRate").textContent = `${weekRate}%`;
        document.querySelector("#habitProgressLabel").textContent = `${done}/${habits.length}`;
        document.querySelector("#habitProgressBar").style.width = `${progress}%`;

        if (!habits.length) {
            list.innerHTML = '<div class="empty-state">Todavía no definiste hábitos. Empezá con tres que realmente puedas sostener.</div>';
        } else {
            list.innerHTML = habits.map(item => {
                const isDone = item.history.includes(today);
                return `<article class="habit-item ${isDone ? "done" : ""}">
                    <button class="habit-check" data-action="toggle" data-id="${A.escapeHTML(String(item.id))}" type="button" aria-label="${isDone ? "Desmarcar" : "Completar"}">✓</button>
                    <div class="habit-copy"><strong>${A.escapeHTML(item.name)}</strong><span>${A.escapeHTML(areaLabels[item.area] || item.area)} · racha ${streak(item)} día(s)</span></div>
                    <div class="record-actions"><button class="small-button" data-action="edit" data-id="${A.escapeHTML(String(item.id))}" type="button">Editar</button><button class="danger-button" data-action="delete" data-id="${A.escapeHTML(String(item.id))}" type="button">Eliminar</button></div>
                </article>`;
            }).join("");
        }

        const dayLabels = dates.map(date => new Intl.DateTimeFormat("es-PY", { weekday: "narrow" }).format(A.parseDate(date)));
        document.querySelector("#habitWeek").innerHTML = habits.length ? `
            <div class="habit-week-row habit-week-header"><strong>Hábito</strong>${dayLabels.map(label => `<span>${label}</span>`).join("")}</div>
            ${habits.map(item => `<div class="habit-week-row"><strong>${A.escapeHTML(item.name)}</strong>${dates.map(date => `<button class="habit-dot ${item.history.includes(date) ? "done" : ""}" data-history-id="${A.escapeHTML(String(item.id))}" data-history-date="${date}" type="button" title="${A.formatDate(date)}">${item.history.includes(date) ? "✓" : "·"}</button>`).join("")}</div>`).join("")}
        ` : '<div class="empty-state">La matriz semanal aparecerá cuando agregues hábitos.</div>';
        A.updateNavCounts();
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        const name = document.querySelector("#habitName").value.trim();
        if (!name) return;
        const id = document.querySelector("#habitId").value;
        const current = habits.find(item => String(item.id) === id);
        const next = {
            ...current,
            id: current?.id || A.createId(),
            name,
            area: document.querySelector("#habitArea").value,
            history: current?.history || [],
            createdAt: current?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (current) habits = habits.map(item => item === current ? next : item);
        else habits.push(next);
        save();
        resetForm();
        dialog.close();
        render();
        A.notify(current ? "Hábito actualizado." : "Hábito agregado.");
    });

    list.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const habit = habits.find(item => String(item.id) === button.dataset.id);
        if (!habit) return;
        if (button.dataset.action === "edit") {
            openHabit(habit);
            return;
        }
        if (button.dataset.action === "toggle") {
            const today = A.localDate();
            if (habit.history.includes(today)) habit.history = habit.history.filter(date => date !== today);
            else habit.history.push(today);
        }
        if (button.dataset.action === "delete") {
            if (!confirm(`¿Eliminar “${habit.name}” y todo su historial?`)) return;
            habits = habits.filter(item => item !== habit);
        }
        save();
        render();
    });

    document.querySelector("#habitWeek").addEventListener("click", event => {
        const button = event.target.closest("[data-history-id][data-history-date]");
        if (!button) return;
        const habit = habits.find(item => String(item.id) === button.dataset.historyId);
        if (!habit) return;
        const date = button.dataset.historyDate;
        if (habit.history.includes(date)) habit.history = habit.history.filter(item => item !== date);
        else habit.history.push(date);
        save();
        render();
    });

    document.querySelector("#openHabitDialog").addEventListener("click", () => openHabit());
    document.querySelector("#closeHabitDialog").addEventListener("click", () => dialog.close());
    document.querySelector("#cancelHabitDialog").addEventListener("click", () => { resetForm(); dialog.close(); });
    render();
    window.addEventListener("atlas:data-changed", event => {
        if (!writingHabits && event.detail?.key === KEY) reload();
    });
    window.addEventListener("storage", event => {
        if (A.storageKeyMatches(event.key, KEY)) reload();
    });
    window.addEventListener("pageshow", reload);
    window.addEventListener("focus", reload);
})();
