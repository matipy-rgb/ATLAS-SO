const STUDY_EVENTS_KEY = "atlasStudyEvents";

const studyEventForm = document.querySelector("#studyEventForm");
const editingStudyId = document.querySelector("#editingStudyId");
const studyInstitution = document.querySelector("#studyInstitution");
const studySubject = document.querySelector("#studySubject");
const studyTitle = document.querySelector("#studyTitle");
const studyType = document.querySelector("#studyType");
const studyDate = document.querySelector("#studyDate");
const studyTime = document.querySelector("#studyTime");
const studyPriority = document.querySelector("#studyPriority");
const studyProgress = document.querySelector("#studyProgress");
const studyProgressValue = document.querySelector("#studyProgressValue");
const studyResource = document.querySelector("#studyResource");
const studyNotes = document.querySelector("#studyNotes");
const studyFormTitle = document.querySelector("#studyFormTitle");
const saveStudyButton = document.querySelector("#saveStudyButton");
const cancelStudyEdit = document.querySelector("#cancelStudyEdit");

const pendingStudyCount = document.querySelector("#pendingStudyCount");
const pendingStudyCaption = document.querySelector("#pendingStudyCaption");
const overdueStudyCount = document.querySelector("#overdueStudyCount");
const weekStudyCount = document.querySelector("#weekStudyCount");
const nextStudyCaption = document.querySelector("#nextStudyCaption");
const averageStudyProgress = document.querySelector("#averageStudyProgress");
const completedStudyCaption = document.querySelector("#completedStudyCaption");
const studyAttention = document.querySelector("#studyAttention");

const studySearch = document.querySelector("#studySearch");
const studyStatusFilter = document.querySelector("#studyStatusFilter");
const studyInstitutionFilter = document.querySelector("#studyInstitutionFilter");
const studyEventList = document.querySelector("#studyEventList");
const studyListSummary = document.querySelector("#studyListSummary");

const completeStudyDialog = document.querySelector("#completeStudyDialog");
const completeStudyForm = document.querySelector("#completeStudyForm");
const completeStudyTitle = document.querySelector("#completeStudyTitle");
const completeStudyId = document.querySelector("#completeStudyId");
const studyCompletedDate = document.querySelector("#studyCompletedDate");
const studyResult = document.querySelector("#studyResult");
const studyCompletionNote = document.querySelector("#studyCompletionNote");
const closeCompleteStudyDialog = document.querySelector("#closeCompleteStudyDialog");
const cancelCompleteStudy = document.querySelector("#cancelCompleteStudy");

const typeLabels = {
    exam: "Examen",
    assignment: "Trabajo / Entrega",
    presentation: "Exposición",
    forum: "Foro",
    project: "Proyecto",
    class: "Clase",
    other: "Otro"
};

let studyEvents = loadStudyEvents();
let writingStudyEvents = false;

function clampProgress(value) {
    return Math.min(100, Math.max(0, Number(value) || 0));
}

function normalizeStudyEvent(event) {
    const completed = Boolean(event.completed);

    return {
        id: event.id ?? createStudyId(),
        institution: String(event.institution || "Sin institución").trim(),
        subject: String(event.subject || "Sin materia").trim(),
        title: String(event.title || "Actividad sin título").trim(),
        date: String(event.date || ""),
        time: String(event.time || ""),
        type: typeLabels[event.type] ? event.type : "other",
        priority: event.priority === "high" ? "high" : "normal",
        progress: completed ? 100 : clampProgress(event.progress),
        progressBeforeCompletion: clampProgress(event.progressBeforeCompletion),
        resource: String(event.resource || "").trim(),
        notes: String(event.notes || "").trim(),
        completed,
        completedAt: String(event.completedAt || ""),
        result: String(event.result || "").trim(),
        completionNote: String(event.completionNote || "").trim(),
        createdAt: String(event.createdAt || new Date().toISOString()),
        updatedAt: String(event.updatedAt || event.createdAt || new Date().toISOString())
    };
}

function loadStudyEvents() {
    return (window.Atlas?.readArray(STUDY_EVENTS_KEY) || []).map(normalizeStudyEvent);
}

function saveStudyEvents() {
    writingStudyEvents = true;
    try {
        window.Atlas?.writeJSON(STUDY_EVENTS_KEY, studyEvents);
    } finally {
        writingStudyEvents = false;
    }
}

function reloadStudyEvents() {
    studyEvents = loadStudyEvents();
    renderStudyPage();
}

function createStudyId() {
    return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function getTodayISO() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
    if (!value) return null;
    const parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatStudyDate(value, includeYear = true) {
    const date = parseLocalDate(value);

    if (!date) return "Sin fecha";

    return new Intl.DateTimeFormat("es-PY", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: includeYear ? "numeric" : undefined
    }).format(date);
}

function daysUntilStudyEvent(value) {
    const dueDate = parseLocalDate(value);
    const today = parseLocalDate(getTodayISO());

    if (!dueDate) return Number.POSITIVE_INFINITY;
    return Math.round((dueDate - today) / 86400000);
}

function escapeStudyHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getStudyStatus(event) {
    if (event.completed) {
        return { key: "completed", label: "Completado", className: "study-badge-done" };
    }

    const days = daysUntilStudyEvent(event.date);

    if (days < 0) {
        const amount = Math.abs(days);
        return {
            key: "overdue",
            label: `Vencido hace ${amount} día${amount === 1 ? "" : "s"}`,
            className: "study-badge-overdue"
        };
    }

    if (days === 0) {
        return { key: "today", label: "Es hoy", className: "study-badge-warning" };
    }

    if (days === 1) {
        return { key: "soon", label: "Es mañana", className: "study-badge-warning" };
    }

    if (days <= 7) {
        return {
            key: "soon",
            label: `Faltan ${days} días`,
            className: "study-badge-warning"
        };
    }

    return { key: "upcoming", label: `Faltan ${days} días`, className: "" };
}

function compareStudyEvents(a, b) {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;

    if (!a.completed && a.priority !== b.priority) {
        const aUrgent = getStudyStatus(a).key === "overdue" || getStudyStatus(a).key === "today";
        const bUrgent = getStudyStatus(b).key === "overdue" || getStudyStatus(b).key === "today";

        if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
    }

    const dateDifference = String(a.date).localeCompare(String(b.date));
    if (dateDifference !== 0) return dateDifference;

    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    return String(a.title).localeCompare(String(b.title), "es");
}

function getPendingStudyEvents() {
    return studyEvents.filter((event) => !event.completed).sort(compareStudyEvents);
}

function renderStudySummary() {
    const pending = getPendingStudyEvents();
    const overdue = pending.filter((event) => daysUntilStudyEvent(event.date) < 0);
    const week = pending.filter((event) => {
        const days = daysUntilStudyEvent(event.date);
        return days >= 0 && days <= 7;
    });
    const completed = studyEvents.filter((event) => event.completed);
    const averageProgress = pending.length === 0
        ? 0
        : Math.round(pending.reduce((sum, event) => sum + clampProgress(event.progress), 0) / pending.length);

    pendingStudyCount.textContent = String(pending.length);
    pendingStudyCaption.textContent = pending.length === 0
        ? "Agenda despejada"
        : `${pending.filter((event) => event.priority === "high").length} de prioridad alta`;
    overdueStudyCount.textContent = String(overdue.length);
    weekStudyCount.textContent = String(week.length);
    nextStudyCaption.textContent = week.length === 0
        ? "Nada urgente"
        : `${week[0].subject} · ${formatStudyDate(week[0].date, false)}`;
    averageStudyProgress.textContent = `${averageProgress}%`;
    completedStudyCaption.textContent = `${completed.length} completado${completed.length === 1 ? "" : "s"}`;
}

function renderStudyAttention() {
    const priorityOrder = { overdue: 0, today: 1, soon: 2, upcoming: 3 };

    const attentionEvents = getPendingStudyEvents()
        .filter((event) => {
            const status = getStudyStatus(event);
            return status.key === "overdue" || status.key === "today" || status.key === "soon" || event.priority === "high";
        })
        .sort((a, b) => {
            const statusDifference = priorityOrder[getStudyStatus(a).key] - priorityOrder[getStudyStatus(b).key];
            return statusDifference || compareStudyEvents(a, b);
        })
        .slice(0, 4);

    if (attentionEvents.length === 0) {
        studyAttention.hidden = true;
        studyAttention.innerHTML = "";
        return;
    }

    studyAttention.innerHTML = `
        <h2>⚡ Lo que requiere tu atención</h2>
        <ul class="study-attention-list">
            ${attentionEvents.map((event) => {
                const status = getStudyStatus(event);
                return `
                    <li>
                        <strong>${escapeStudyHTML(event.subject)} · ${escapeStudyHTML(event.title)}</strong>
                        <span>${escapeStudyHTML(status.label)}</span>
                    </li>
                `;
            }).join("")}
        </ul>
    `;
    studyAttention.hidden = false;
}

function renderInstitutionFilter() {
    const currentValue = studyInstitutionFilter.value || "all";
    const institutions = Array.from(new Set(
        studyEvents
            .map((event) => event.institution)
            .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, "es"));

    studyInstitutionFilter.innerHTML = `
        <option value="all">Todas las instituciones</option>
        ${institutions.map((institution) => {
            return `<option value="${escapeStudyHTML(institution)}">${escapeStudyHTML(institution)}</option>`;
        }).join("")}
    `;

    studyInstitutionFilter.value = institutions.includes(currentValue) ? currentValue : "all";
}

function getVisibleStudyEvents() {
    const query = studySearch.value.trim().toLocaleLowerCase("es");
    const statusFilter = studyStatusFilter.value;
    const institutionFilter = studyInstitutionFilter.value;

    return studyEvents.filter((event) => {
        const status = getStudyStatus(event);
        const searchableText = `${event.institution} ${event.subject} ${event.title} ${event.notes}`.toLocaleLowerCase("es");
        const matchesQuery = query === "" || searchableText.includes(query);
        const matchesInstitution = institutionFilter === "all" || event.institution === institutionFilter;

        let matchesStatus = true;

        if (statusFilter === "attention") {
            matchesStatus = !event.completed && (
                status.key === "overdue" ||
                status.key === "today" ||
                status.key === "soon" ||
                event.priority === "high"
            );
        } else if (statusFilter === "pending") {
            matchesStatus = !event.completed;
        } else if (statusFilter === "completed") {
            matchesStatus = event.completed;
        }

        return matchesQuery && matchesInstitution && matchesStatus;
    }).sort(compareStudyEvents);
}

function buildStudyEventCard(event) {
    const status = getStudyStatus(event);
    const safeId = escapeStudyHTML(String(event.id));
    const safeResource = /^https?:\/\//i.test(event.resource) ? escapeStudyHTML(event.resource) : "";
    const dateLabel = `${formatStudyDate(event.date)}${event.time ? ` · ${event.time}` : ""}`;

    return `
        <article class="study-event" data-state="${status.key}" data-priority="${event.priority}">
            <div class="study-event-main">
                <div class="study-event-context">
                    <span>${escapeStudyHTML(event.institution)}</span>
                    <span>·</span>
                    <span>${escapeStudyHTML(event.subject)}</span>
                </div>

                <h3>${escapeStudyHTML(event.title)}</h3>
                <p class="study-event-meta">${escapeStudyHTML(typeLabels[event.type])} · ${escapeStudyHTML(dateLabel)}</p>

                ${event.notes ? `<p class="study-event-notes">${escapeStudyHTML(event.notes)}</p>` : ""}
                ${safeResource ? `<a class="study-event-resource" href="${safeResource}" target="_blank" rel="noopener noreferrer">Abrir material ↗</a>` : ""}

                <div class="study-event-badges">
                    <span class="study-badge ${status.className}">${escapeStudyHTML(status.label)}</span>
                    ${event.priority === "high" ? '<span class="study-badge study-badge-warning">Prioridad alta</span>' : ""}
                    ${event.completedAt ? `<span class="study-badge">Finalizado: ${escapeStudyHTML(formatStudyDate(event.completedAt))}</span>` : ""}
                </div>

                ${event.result ? `<p class="study-completion-result">Resultado: ${escapeStudyHTML(event.result)}</p>` : ""}
                ${event.completionNote ? `<p class="study-event-notes">${escapeStudyHTML(event.completionNote)}</p>` : ""}
            </div>

            <div class="study-event-side">
                <div class="study-progress-box">
                    <div class="study-progress-copy">
                        <span>Avance</span>
                        <strong>${clampProgress(event.progress)}%</strong>
                    </div>
                    <div class="study-progress-track">
                        <div class="study-progress-bar" style="width: ${clampProgress(event.progress)}%"></div>
                    </div>
                </div>

                <div class="study-event-actions">
                    ${event.completed
                        ? `<button class="study-small-button" type="button" data-action="reopen" data-id="${safeId}">Reabrir</button>`
                        : `
                            <button class="study-small-button" type="button" data-action="advance" data-id="${safeId}">+25%</button>
                            <button class="study-primary-button" type="button" data-action="complete" data-id="${safeId}">Completar</button>
                        `
                    }
                    <button class="study-secondary-button" type="button" data-action="edit" data-id="${safeId}">Editar</button>
                    <button class="study-danger-button" type="button" data-action="delete" data-id="${safeId}">Eliminar</button>
                </div>
            </div>
        </article>
    `;
}

function renderStudyEvents() {
    const visibleEvents = getVisibleStudyEvents();

    studyListSummary.textContent = `${visibleEvents.length} actividad${visibleEvents.length === 1 ? "" : "es"}`;

    if (visibleEvents.length === 0) {
        const hasEvents = studyEvents.length > 0;
        studyEventList.innerHTML = `
            <div class="empty-study-state">
                ${hasEvents
                    ? "No hay actividades que coincidan con estos filtros."
                    : "Todavía no cargaste actividades. Agregá la primera cuando tengas una fecha."
                }
            </div>
        `;
        return;
    }

    studyEventList.innerHTML = visibleEvents.map(buildStudyEventCard).join("");
}

function renderStudyPage() {
    renderInstitutionFilter();
    renderStudySummary();
    renderStudyAttention();
    renderStudyEvents();
    window.Atlas?.updateNavCounts();
}

function resetStudyForm() {
    studyEventForm.reset();
    editingStudyId.value = "";
    studyProgress.value = "0";
    studyProgressValue.textContent = "0%";
    studyPriority.value = "normal";
    studyType.value = "exam";
    studyFormTitle.textContent = "Agregar actividad";
    saveStudyButton.textContent = "Agregar actividad";
    cancelStudyEdit.hidden = true;
}

function findStudyEvent(id) {
    return studyEvents.find((event) => String(event.id) === String(id));
}

function editStudyEvent(id) {
    const event = findStudyEvent(id);
    if (!event) return;

    editingStudyId.value = String(event.id);
    studyInstitution.value = event.institution === "Sin institución" ? "" : event.institution;
    studySubject.value = event.subject === "Sin materia" ? "" : event.subject;
    studyTitle.value = event.title;
    studyType.value = event.type;
    studyDate.value = event.date;
    studyTime.value = event.time;
    studyPriority.value = event.priority;
    studyProgress.value = String(event.progress);
    studyProgressValue.textContent = `${event.progress}%`;
    studyResource.value = event.resource;
    studyNotes.value = event.notes;
    studyFormTitle.textContent = "Editar actividad";
    saveStudyButton.textContent = "Guardar cambios";
    cancelStudyEdit.hidden = false;

    studyEventForm.closest(".study-card").scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => studyTitle.focus(), 350);
}

function advanceStudyEvent(id) {
    studyEvents = studyEvents.map((event) => {
        if (String(event.id) !== String(id) || event.completed) return event;
        return {
            ...event,
            progress: Math.min(100, clampProgress(event.progress) + 25),
            updatedAt: new Date().toISOString()
        };
    });

    saveStudyEvents();
    renderStudyPage();
}

function openCompleteStudyDialog(id) {
    const event = findStudyEvent(id);
    if (!event || event.completed) return;

    completeStudyId.value = String(event.id);
    completeStudyTitle.textContent = event.title;
    studyCompletedDate.value = getTodayISO();
    studyResult.value = event.result;
    studyCompletionNote.value = event.completionNote;
    completeStudyDialog.showModal();
    studyResult.focus();
}

function closeStudyCompletionDialog() {
    if (completeStudyDialog.open) completeStudyDialog.close();
    completeStudyForm.reset();
    completeStudyId.value = "";
}

function reopenStudyEvent(id) {
    const event = findStudyEvent(id);
    if (!event) return;

    const confirmed = window.confirm("¿Querés volver a marcar esta actividad como pendiente?");
    if (!confirmed) return;

    event.completed = false;
    event.progress = Number.isFinite(Number(event.progressBeforeCompletion))
        ? clampProgress(event.progressBeforeCompletion)
        : 75;
    event.completedAt = "";
    event.result = "";
    event.completionNote = "";
    event.updatedAt = new Date().toISOString();

    saveStudyEvents();
    renderStudyPage();
}

function deleteStudyEvent(id) {
    const event = findStudyEvent(id);
    if (!event) return;

    const confirmed = window.confirm(`¿Querés eliminar “${event.title}”?`);
    if (!confirmed) return;

    studyEvents = studyEvents.filter((item) => String(item.id) !== String(id));
    saveStudyEvents();

    if (editingStudyId.value === String(id)) resetStudyForm();
    renderStudyPage();
}

studyEventForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const id = editingStudyId.value;
    const existing = id ? findStudyEvent(id) : null;
    const now = new Date().toISOString();

    const institution = studyInstitution.value.trim();
    const subject = studySubject.value.trim();
    const title = studyTitle.value.trim();
    const date = studyDate.value;
    if (!institution || !subject || !title || !date) {
        window.Atlas?.notify("Completá institución, materia, actividad y fecha.", "error");
        return;
    }

    const nextEvent = normalizeStudyEvent({
        ...existing,
        id: existing?.id ?? createStudyId(),
        institution,
        subject,
        title,
        type: studyType.value,
        date,
        time: studyTime.value,
        priority: studyPriority.value,
        progress: studyProgress.value,
        resource: studyResource.value.trim(),
        notes: studyNotes.value.trim(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
    });

    if (!nextEvent.institution || !nextEvent.subject || !nextEvent.title || !nextEvent.date) return;

    if (existing) {
        studyEvents = studyEvents.map((item) => String(item.id) === String(existing.id) ? nextEvent : item);
    } else {
        studyEvents.push(nextEvent);
    }

    saveStudyEvents();
    resetStudyForm();
    renderStudyPage();
    studyInstitution.focus();
});

completeStudyForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const studyEvent = findStudyEvent(completeStudyId.value);
    if (!studyEvent) return;

    studyEvent.progressBeforeCompletion = clampProgress(studyEvent.progress);
    studyEvent.progress = 100;
    studyEvent.completed = true;
    studyEvent.completedAt = studyCompletedDate.value;
    studyEvent.result = studyResult.value.trim();
    studyEvent.completionNote = studyCompletionNote.value.trim();
    studyEvent.updatedAt = new Date().toISOString();

    saveStudyEvents();
    closeStudyCompletionDialog();
    renderStudyPage();
});

studyEventList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;

    if (action === "advance") advanceStudyEvent(id);
    if (action === "complete") openCompleteStudyDialog(id);
    if (action === "reopen") reopenStudyEvent(id);
    if (action === "edit") editStudyEvent(id);
    if (action === "delete") deleteStudyEvent(id);
});

studyProgress.addEventListener("input", () => {
    studyProgressValue.textContent = `${studyProgress.value}%`;
});

cancelStudyEdit.addEventListener("click", resetStudyForm);
closeCompleteStudyDialog.addEventListener("click", closeStudyCompletionDialog);
cancelCompleteStudy.addEventListener("click", closeStudyCompletionDialog);

completeStudyDialog.addEventListener("click", (event) => {
    if (event.target === completeStudyDialog) closeStudyCompletionDialog();
});

[studySearch, studyStatusFilter, studyInstitutionFilter].forEach((control) => {
    control.addEventListener(control === studySearch ? "input" : "change", renderStudyEvents);
});

window.addEventListener("pageshow", reloadStudyEvents);
window.addEventListener("focus", reloadStudyEvents);
window.addEventListener("storage", (event) => {
    if (window.Atlas.storageKeyMatches(event.key, STUDY_EVENTS_KEY)) reloadStudyEvents();
});
window.addEventListener("atlas:data-changed", event => {
    if (!writingStudyEvents && event.detail?.key === STUDY_EVENTS_KEY) reloadStudyEvents();
});

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) reloadStudyEvents();
});

resetStudyForm();
renderStudyPage();

document.querySelector("#focusStudyForm")?.addEventListener("click", () => {
    studyInstitution.focus();
    studyEventForm.closest(".study-card")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});
