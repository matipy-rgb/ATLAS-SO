const habitForm =
    document.querySelector("#habitForm");

const habitName =
    document.querySelector("#habitName");

const habitList =
    document.querySelector("#habitList");

const totalHabits =
    document.querySelector("#totalHabits");

const completedToday =
    document.querySelector("#completedToday");

const bestStreak =
    document.querySelector("#bestStreak");

const habitProgressText =
    document.querySelector("#habitProgressText");

const habitProgressLabel =
    document.querySelector("#habitProgressLabel");

const habitProgressBar =
    document.querySelector("#habitProgressBar");

function getLocalDateValue(date = new Date()) {
    const localDate = new Date(
        date.getTime() -
        date.getTimezoneOffset() * 60000
    );

    return localDate.toISOString().slice(0, 10);
}

function changeDate(dateValue, numberOfDays) {
    const parts = dateValue
        .split("-")
        .map(Number);

    const date = new Date(
        parts[0],
        parts[1] - 1,
        parts[2]
    );

    date.setDate(
        date.getDate() + numberOfDays
    );

    return getLocalDateValue(date);
}

function loadHabits() {
    try {
        const storedHabits = JSON.parse(
            localStorage.getItem("atlasHabits")
        ) || [];

        return storedHabits.map(function (habit) {
            return {
                id: habit.id,
                name: habit.name,
                createdAt: habit.createdAt,
                history: Array.isArray(habit.history)
                    ? habit.history
                    : []
            };
        });
    } catch (error) {
        console.error(
            "No se cargaron los hábitos:",
            error
        );

        return [];
    }
}

let habits = loadHabits();

function saveHabits() {
    localStorage.setItem(
        "atlasHabits",
        JSON.stringify(habits)
    );
}

function calculateStreak(habit) {
    const completedDates =
        new Set(habit.history);

    let currentDate = getLocalDateValue();

    if (!completedDates.has(currentDate)) {
        currentDate = changeDate(
            currentDate,
            -1
        );
    }

    let streak = 0;

    while (completedDates.has(currentDate)) {
        streak += 1;

        currentDate = changeDate(
            currentDate,
            -1
        );
    }

    return streak;
}

function updateHabitSummary() {
    const today = getLocalDateValue();

    const completedCount = habits.filter(
        function (habit) {
            return habit.history.includes(today);
        }
    ).length;

    const streaks = habits.map(
        function (habit) {
            return calculateStreak(habit);
        }
    );

    const highestStreak =
        streaks.length === 0
            ? 0
            : Math.max(...streaks);

    const progress = habits.length === 0
        ? 0
        : Math.round(
            (completedCount / habits.length) * 100
        );

    totalHabits.textContent =
        habits.length;

    completedToday.textContent =
        completedCount;

    bestStreak.textContent =
        `${highestStreak} día(s)`;

    habitProgressText.textContent =
        `${progress}%`;

    habitProgressLabel.textContent =
        `${completedCount} de ${habits.length}`;

    habitProgressBar.style.width =
        `${progress}%`;
}

function toggleHabit(habitId, completed) {
    const today = getLocalDateValue();

    habits = habits.map(function (habit) {
        if (habit.id !== habitId) {
            return habit;
        }

        const history = new Set(
            habit.history
        );

        if (completed) {
            history.add(today);
        } else {
            history.delete(today);
        }

        return {
            ...habit,
            history: Array.from(history)
        };
    });

    saveHabits();
    renderHabits();
}

function deleteHabit(habitId) {
    const confirmed = window.confirm(
        "¿Querés eliminar este hábito?"
    );

    if (!confirmed) {
        return;
    }

    habits = habits.filter(
        function (habit) {
            return habit.id !== habitId;
        }
    );

    saveHabits();
    renderHabits();
}

function renderHabits() {
    habitList.innerHTML = "";

    const today = getLocalDateValue();

    if (habits.length === 0) {
        const emptyMessage =
            document.createElement("li");

        emptyMessage.className =
            "empty-state";

        emptyMessage.textContent =
            "Todavía no agregaste hábitos.";

        habitList.appendChild(emptyMessage);
    }

    habits.forEach(function (habit) {
        const habitItem =
            document.createElement("li");

        const checkbox =
            document.createElement("input");

        const habitContent =
            document.createElement("div");

        const name =
            document.createElement("strong");

        const habitMeta =
            document.createElement("div");

        const todayBadge =
            document.createElement("span");

        const streakBadge =
            document.createElement("span");

        const deleteButton =
            document.createElement("button");

        const isCompleted =
            habit.history.includes(today);

        const streak =
            calculateStreak(habit);

        habitItem.className = isCompleted
            ? "habit-item completed"
            : "habit-item";

        checkbox.type = "checkbox";
        checkbox.checked = isCompleted;

        habitContent.className =
            "habit-content";

        name.className = "habit-name";
        name.textContent = habit.name;

        habitMeta.className = "habit-meta";

        todayBadge.className = isCompleted
            ? "habit-badge habit-done"
            : "habit-badge habit-pending";

        todayBadge.textContent = isCompleted
            ? "✓ Completado hoy"
            : "Pendiente hoy";

        streakBadge.className =
            "habit-badge streak-badge";

        streakBadge.textContent =
            `🔥 Racha: ${streak} día(s)`;

        deleteButton.className =
            "delete-task";

        deleteButton.type = "button";
        deleteButton.textContent =
            "Eliminar";

        checkbox.addEventListener(
            "change",
            function () {
                toggleHabit(
                    habit.id,
                    checkbox.checked
                );
            }
        );

        deleteButton.addEventListener(
            "click",
            function () {
                deleteHabit(habit.id);
            }
        );

        habitMeta.append(
            todayBadge,
            streakBadge
        );

        habitContent.append(
            name,
            habitMeta
        );

        habitItem.append(
            checkbox,
            habitContent,
            deleteButton
        );

        habitList.appendChild(habitItem);
    });

    updateHabitSummary();
}

habitForm.addEventListener(
    "submit",
    function (event) {
        event.preventDefault();

        const name =
            habitName.value.trim();

        if (name === "") {
            return;
        }

        habits.push({
            id: Date.now(),
            name: name,
            createdAt:
                new Date().toISOString(),
            history: []
        });

        saveHabits();
        renderHabits();

        habitForm.reset();
        habitName.focus();
    }
);

renderHabits();