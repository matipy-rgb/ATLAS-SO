const healthForm =
    document.querySelector("#healthForm");

const healthDate =
    document.querySelector("#healthDate");

const healthWeight =
    document.querySelector("#healthWeight");

const sleepHours =
    document.querySelector("#sleepHours");

const waterLiters =
    document.querySelector("#waterLiters");

const workoutCompleted =
    document.querySelector("#workoutCompleted");

const healthRecordList =
    document.querySelector("#healthRecordList");

const latestWeight =
    document.querySelector("#latestWeight");

const averageSleep =
    document.querySelector("#averageSleep");

const recentWorkouts =
    document.querySelector("#recentWorkouts");

const latestWater =
    document.querySelector("#latestWater");

function getTodayValue() {
    const now = new Date();

    const localDate = new Date(
        now.getTime() -
        now.getTimezoneOffset() * 60000
    );

    return localDate.toISOString().slice(0, 10);
}

function parseLocalDate(dateValue) {
    const parts = dateValue
        .split("-")
        .map(Number);

    return new Date(
        parts[0],
        parts[1] - 1,
        parts[2]
    );
}

function formatDate(dateValue) {
    return new Intl.DateTimeFormat("es-PY", {
        dateStyle: "medium"
    }).format(parseLocalDate(dateValue));
}

function loadHealthRecords() {
    try {
        return JSON.parse(
            localStorage.getItem("atlasHealthRecords")
        ) || [];
    } catch (error) {
        console.error(
            "No se cargaron los registros:",
            error
        );

        return [];
    }
}

let healthRecords = loadHealthRecords();

function saveHealthRecords() {
    localStorage.setItem(
        "atlasHealthRecords",
        JSON.stringify(healthRecords)
    );
}

function getOrderedRecords() {
    return healthRecords
        .slice()
        .sort(function (firstRecord, secondRecord) {
            return secondRecord.date.localeCompare(
                firstRecord.date
            );
        });
}

function updateHealthSummary() {
    const orderedRecords = getOrderedRecords();
    const latestRecord = orderedRecords[0];
    const recentRecords = orderedRecords.slice(0, 7);

    if (!latestRecord) {
        latestWeight.textContent = "Sin datos";
        averageSleep.textContent = "Sin datos";
        recentWorkouts.textContent = "0 de 7";
        latestWater.textContent = "Sin datos";
        return;
    }

    const totalSleep = recentRecords.reduce(
        function (total, record) {
            return total + record.sleep;
        },
        0
    );

    const sleepAverage =
        totalSleep / recentRecords.length;

    const workoutCount = recentRecords.filter(
        function (record) {
            return record.workout;
        }
    ).length;

    latestWeight.textContent =
        `${latestRecord.weight.toFixed(1)} kg`;

    averageSleep.textContent =
        `${sleepAverage.toFixed(1)} horas`;

    recentWorkouts.textContent =
        `${workoutCount} de ${recentRecords.length}`;

    latestWater.textContent =
        `${latestRecord.water.toFixed(1)} litros`;
}

function deleteHealthRecord(recordDate) {
    healthRecords = healthRecords.filter(
        function (record) {
            return record.date !== recordDate;
        }
    );

    saveHealthRecords();
    renderHealthRecords();
}

function renderHealthRecords() {
    healthRecordList.innerHTML = "";

    const orderedRecords = getOrderedRecords();

    if (orderedRecords.length === 0) {
        const emptyMessage =
            document.createElement("li");

        emptyMessage.className = "empty-state";

        emptyMessage.textContent =
            "Todavía no registraste datos de salud.";

        healthRecordList.appendChild(emptyMessage);
    }

    orderedRecords.forEach(function (record) {
        const recordItem =
            document.createElement("li");

        const recordContent =
            document.createElement("div");

        const recordDate =
            document.createElement("strong");

        const recordMetrics =
            document.createElement("div");

        const weightBadge =
            document.createElement("span");

        const sleepBadge =
            document.createElement("span");

        const waterBadge =
            document.createElement("span");

        const workoutBadge =
            document.createElement("span");

        const deleteButton =
            document.createElement("button");

        recordItem.className =
            "health-record";

        recordContent.className =
            "health-record-content";

        recordDate.textContent =
            formatDate(record.date);

        recordMetrics.className =
            "health-record-metrics";

        weightBadge.textContent =
            `⚖️ ${record.weight.toFixed(1)} kg`;

        sleepBadge.textContent =
            `😴 ${record.sleep.toFixed(1)} h`;

        waterBadge.textContent =
            `💧 ${record.water.toFixed(1)} L`;

        workoutBadge.className = record.workout
            ? "health-badge workout-done"
            : "health-badge workout-missed";

        workoutBadge.textContent = record.workout
            ? "✓ Entrenamiento"
            : "Sin entrenamiento";

        weightBadge.className = "health-badge";
        sleepBadge.className = "health-badge";
        waterBadge.className = "health-badge";

        deleteButton.className = "delete-task";
        deleteButton.type = "button";
        deleteButton.textContent = "Eliminar";

        deleteButton.addEventListener(
            "click",
            function () {
                deleteHealthRecord(record.date);
            }
        );

        recordMetrics.append(
            weightBadge,
            sleepBadge,
            waterBadge,
            workoutBadge
        );

        recordContent.append(
            recordDate,
            recordMetrics
        );

        recordItem.append(
            recordContent,
            deleteButton
        );

        healthRecordList.appendChild(recordItem);
    });

    updateHealthSummary();
}

healthForm.addEventListener(
    "submit",
    function (event) {
        event.preventDefault();

        const record = {
            date: healthDate.value,
            weight: Number(healthWeight.value),
            sleep: Number(sleepHours.value),
            water: Number(waterLiters.value),
            workout:
                workoutCompleted.value === "true"
        };

        const existingIndex =
            healthRecords.findIndex(
                function (healthRecord) {
                    return healthRecord.date === record.date;
                }
            );

        if (existingIndex >= 0) {
            healthRecords[existingIndex] = record;
        } else {
            healthRecords.push(record);
        }

        saveHealthRecords();
        renderHealthRecords();

        healthForm.reset();

        healthDate.value = getTodayValue();
        workoutCompleted.value = "false";
        healthWeight.focus();
    }
);

healthDate.value = getTodayValue();

renderHealthRecords();