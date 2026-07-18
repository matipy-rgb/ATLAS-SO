const studyForm =
    document.querySelector("#studyForm");

const subjectInput =
    document.querySelector("#studySubject");

const titleInput =
    document.querySelector("#studyTitle");

const dateInput =
    document.querySelector("#studyDate");

const typeInput =
    document.querySelector("#studyType");

const studyEventList =
    document.querySelector("#studyEventList");

const studyPending =
    document.querySelector("#studyPending");

const studyCompleted =
    document.querySelector("#studyCompleted");

const nextStudyEvent =
    document.querySelector("#nextStudyEvent");

const studyTypes = {
    exam: "Examen",
    assignment: "Trabajo práctico",
    class: "Clase",
    other: "Otro"
};

function loadStudyEvents() {
    try {
        return JSON.parse(
            localStorage.getItem("atlasStudyEvents")
        ) || [];
    } catch (error) {
        console.error(
            "No se pudo cargar la agenda:",
            error
        );

        return [];
    }
}

let studyEvents = loadStudyEvents();

function saveStudyEvents() {
    localStorage.setItem(
        "atlasStudyEvents",
        JSON.stringify(studyEvents)
    );
}

function parseLocalDate(dateValue) {
    const dateParts =
        dateValue.split("-").map(Number);

    return new Date(
        dateParts[0],
        dateParts[1] - 1,
        dateParts[2]
    );
}

function formatStudyDate(dateValue) {
    return new Intl.DateTimeFormat("es-PY", {
        dateStyle: "medium"
    }).format(parseLocalDate(dateValue));
}

function getDaysRemaining(dateValue) {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const eventDate =
        parseLocalDate(dateValue);

    return Math.round(
        (eventDate - today) / 86400000
    );
}

function getDateStatus(dateValue) {
    const days = getDaysRemaining(dateValue);

    if (days < 0) {
        return `Vencido hace ${Math.abs(days)} día(s)`;
    }

    if (days === 0) {
        return "Hoy";
    }

    if (days === 1) {
        return "Mañana";
    }

    return `Faltan ${days} días`;
}

function updateStudySummary() {
    const pendingEvents =
        studyEvents.filter(function (studyEvent) {
            return !studyEvent.completed;
        });

    const completedEvents =
        studyEvents.filter(function (studyEvent) {
            return studyEvent.completed;
        });

    studyPending.textContent =
        pendingEvents.length;

    studyCompleted.textContent =
        completedEvents.length;

    const nextEvent = pendingEvents
        .slice()
        .sort(function (firstEvent, secondEvent) {
            return firstEvent.date.localeCompare(
                secondEvent.date
            );
        })[0];

    nextStudyEvent.textContent = nextEvent
        ? `${nextEvent.subject}: ${getDateStatus(nextEvent.date)}`
        : "Sin eventos";
}

function deleteStudyEvent(eventId) {
    studyEvents = studyEvents.filter(
        function (studyEvent) {
            return studyEvent.id !== eventId;
        }
    );

    saveStudyEvents();
    renderStudyEvents();
}

function renderStudyEvents() {
    studyEventList.innerHTML = "";

    const orderedEvents = studyEvents
        .slice()
        .sort(function (firstEvent, secondEvent) {
            if (
                firstEvent.completed !==
                secondEvent.completed
            ) {
                return Number(firstEvent.completed) -
                    Number(secondEvent.completed);
            }

            return firstEvent.date.localeCompare(
                secondEvent.date
            );
        });

    if (orderedEvents.length === 0) {
        const emptyMessage =
            document.createElement("li");

        emptyMessage.className = "empty-state";

        emptyMessage.textContent =
            "Todavía no agregaste eventos académicos.";

        studyEventList.appendChild(emptyMessage);
    }

    orderedEvents.forEach(function (studyEvent) {
        const eventItem =
            document.createElement("li");

        const checkbox =
            document.createElement("input");

        const eventContent =
            document.createElement("div");

        const eventTitle =
            document.createElement("strong");

        const eventMeta =
            document.createElement("div");

        const typeBadge =
            document.createElement("span");

        const dateBadge =
            document.createElement("span");

        const statusBadge =
            document.createElement("span");

        const deleteButton =
            document.createElement("button");

        eventItem.className = studyEvent.completed
            ? "study-event completed"
            : "study-event";

        checkbox.type = "checkbox";
        checkbox.checked = studyEvent.completed;

        eventContent.className =
            "study-event-content";

        eventTitle.className =
            "study-event-title";

        eventTitle.textContent =
            `${studyEvent.subject} — ${studyEvent.title}`;

        eventMeta.className =
            "study-event-meta";

        typeBadge.className =
            "study-event-badge";

        typeBadge.textContent =
            studyTypes[studyEvent.type] || "Otro";

        dateBadge.className =
            "study-event-badge";

        dateBadge.textContent =
            formatStudyDate(studyEvent.date);

        statusBadge.className =
            getDaysRemaining(studyEvent.date) < 0
                ? "study-event-badge overdue-badge"
                : "study-event-badge status-badge";

        statusBadge.textContent =
            studyEvent.completed
                ? "Completado"
                : getDateStatus(studyEvent.date);

        deleteButton.className = "delete-task";
        deleteButton.type = "button";
        deleteButton.textContent = "Eliminar";

        checkbox.addEventListener(
            "change",
            function () {
                studyEvent.completed =
                    checkbox.checked;

                saveStudyEvents();
                renderStudyEvents();
            }
        );

        deleteButton.addEventListener(
            "click",
            function () {
                deleteStudyEvent(studyEvent.id);
            }
        );

        eventMeta.append(
            typeBadge,
            dateBadge,
            statusBadge
        );

        eventContent.append(
            eventTitle,
            eventMeta
        );

        eventItem.append(
            checkbox,
            eventContent,
            deleteButton
        );

        studyEventList.appendChild(eventItem);
    });

    updateStudySummary();
}

studyForm.addEventListener(
    "submit",
    function (event) {
        event.preventDefault();

        const subject =
            subjectInput.value.trim();

        const title =
            titleInput.value.trim();

        if (
            subject === "" ||
            title === "" ||
            dateInput.value === ""
        ) {
            return;
        }

        studyEvents.push({
            id: Date.now(),
            subject: subject,
            title: title,
            date: dateInput.value,
            type: typeInput.value,
            completed: false
        });

        saveStudyEvents();
        renderStudyEvents();

        studyForm.reset();

        dateInput.value =
            new Date().toISOString().slice(0, 10);

        subjectInput.focus();
    }
);

dateInput.value =
    new Date().toISOString().slice(0, 10);

renderStudyEvents();