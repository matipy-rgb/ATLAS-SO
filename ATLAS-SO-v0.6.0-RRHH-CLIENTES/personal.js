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

    const list = document.querySelector("#habitList");
    const dialog = document.querySelector("#habitDialog");
    const form = document.querySelector("#habitForm");

    function save() { A.writeJSON(KEY, habits); }

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
                    <button class="habit-check" data-action="toggle" data-id="${item.id}" type="button" aria-label="${isDone ? "Desmarcar" : "Completar"}">✓</button>
                    <div class="habit-copy"><strong>${A.escapeHTML(item.name)}</strong><span>${areaLabels[item.area] || item.area} · racha ${streak(item)} día(s)</span></div>
                    <div class="record-actions"><button class="danger-button" data-action="delete" data-id="${item.id}" type="button">Eliminar</button></div>
                </article>`;
            }).join("");
        }

        const dayLabels = dates.map(date => new Intl.DateTimeFormat("es-PY", { weekday: "narrow" }).format(A.parseDate(date)));
        document.querySelector("#habitWeek").innerHTML = habits.length ? `
            <div class="habit-week-row habit-week-header"><strong>Hábito</strong>${dayLabels.map(label => `<span>${label}</span>`).join("")}</div>
            ${habits.map(item => `<div class="habit-week-row"><strong>${A.escapeHTML(item.name)}</strong>${dates.map(date => `<span class="habit-dot ${item.history.includes(date) ? "done" : ""}">${item.history.includes(date) ? "✓" : "·"}</span>`).join("")}</div>`).join("")}
        ` : '<div class="empty-state">La matriz semanal aparecerá cuando agregues hábitos.</div>';
        A.updateNavCounts();
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        const name = document.querySelector("#habitName").value.trim();
        if (!name) return;
        habits.push({ id: A.createId(), name, area: document.querySelector("#habitArea").value, history: [], createdAt: new Date().toISOString() });
        save();
        form.reset();
        dialog.close();
        render();
        A.notify("Hábito agregado.");
    });

    list.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const habit = habits.find(item => String(item.id) === button.dataset.id);
        if (!habit) return;
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

    document.querySelector("#openHabitDialog").addEventListener("click", () => { dialog.showModal(); document.querySelector("#habitName").focus(); });
    document.querySelector("#closeHabitDialog").addEventListener("click", () => dialog.close());
    document.querySelector("#cancelHabitDialog").addEventListener("click", () => dialog.close());
    render();
})();
