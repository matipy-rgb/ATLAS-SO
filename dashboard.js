(function () {
    const A = window.Atlas;
    const categoryLabels = {
        work: "Trabajo",
        hr: "RRHH",
        study: "Estudios",
        finance: "Finanzas",
        health: "Salud",
        projects: "Proyectos",
        personal: "Personal"
    };

    const moduleMeta = {
        finance: { icon: "₲", label: "Finanzas", href: "finance.html", action: "Ver mi dinero" },
        study: { icon: "▣", label: "Estudios", href: "study.html", action: "Ver mi agenda" },
        health: { icon: "+", label: "Salud", href: "health.html", action: "Ver mi registro" },
        projects: { icon: "◆", label: "Proyectos", href: "projects.html", action: "Ver mis proyectos" },
        personal: { icon: "○", label: "Hábitos", href: "personal.html", action: "Ver mi constancia" },
        work: { icon: "▤", label: "Trabajo", href: "work.html", action: "Ver mis jornadas" },
        rrhh: { icon: "R", label: "RRHH", href: "rrhh.html", action: "Abrir RRHH" }
    };

    const greeting = document.querySelector("#dashboardGreeting");
    const headline = document.querySelector("#dashboardHeadline");
    const todayLabel = document.querySelector("#todayLabel");
    const dailyScore = document.querySelector("#dailyScore");
    const scoreRing = document.querySelector("#scoreRing");
    const focusCard = document.querySelector("#dailyFocusCard");
    const focusDialog = document.querySelector("#focusDialog");
    const focusForm = document.querySelector("#focusForm");
    const focusText = document.querySelector("#focusText");
    const agenda = document.querySelector("#todayAgenda");
    const agendaCount = document.querySelector("#agendaCount");
    const moduleOverview = document.querySelector("#moduleOverview");
    const taskList = document.querySelector("#taskList");
    const taskFilters = document.querySelector("#taskFilters");
    const weekPulse = document.querySelector("#weekPulse");
    const weekPulseRate = document.querySelector("#weekPulseRate");
    const weekPulseCaption = document.querySelector("#weekPulseCaption");
    const smartInsights = document.querySelector("#smartInsights");
    const quickNotes = document.querySelector("#quickNotes");
    const notesStatus = document.querySelector("#notesStatus");
    const onboardingDialog = document.querySelector("#onboardingDialog");
    const onboardingForm = document.querySelector("#onboardingForm");
    const backupDialog = document.querySelector("#backupDialog");
    const backupStatus = document.querySelector("#backupStatus");
    const backupFile = document.querySelector("#backupFile");

    let tasks = normalizeTasks(A.loadTasks());
    let taskFilter = "pending";
    let notesTimer = null;

    function normalizeTasks(items) {
        return items.map(item => ({
            id: item.id || A.createId(),
            text: String(item.text || item.title || "").trim(),
            category: categoryLabels[item.category] ? item.category : "personal",
            priority: item.priority === "high" ? "high" : "normal",
            dueDate: item.dueDate || item.date || "",
            completed: Boolean(item.completed),
            completedAt: item.completedAt || "",
            createdAt: item.createdAt || new Date().toISOString()
        })).filter(item => item.text);
    }

    function getData() {
        tasks = normalizeTasks(A.loadTasks());
        return {
            obligations: A.readArray("atlasObligations"),
            transactions: A.readArray("atlasTransactions"),
            studies: A.readArray("atlasStudyEvents"),
            health: A.readArray("atlasHealthRecords"),
            projects: A.readArray("atlasProjects"),
            work: A.readArray("atlasWorkRecords"),
            habits: A.readArray("atlasHabits"),
            hrPeople: A.readArray("atlasHRPeople"),
            hrAbsences: A.readArray("atlasHRAbsences")
        };
    }

    function setGreeting() {
        const now = new Date();
        const hour = now.getHours();
        const salutation = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
        const firstName = A.getUserName().split(/\s+/)[0];
        greeting.textContent = `${salutation}, ${firstName}.`;
        todayLabel.textContent = new Intl.DateTimeFormat("es-PY", {
            weekday: "long",
            day: "numeric",
            month: "long"
        }).format(now).toUpperCase();
    }

    function getDailyFocus() {
        const stored = A.readJSON("atlasDailyFocus", {});
        if (!stored || stored.date !== A.localDate()) return { date: A.localDate(), text: "", completed: false };
        return {
            date: stored.date,
            text: String(stored.text || "").trim(),
            completed: Boolean(stored.completed)
        };
    }

    function saveDailyFocus(focus) {
        A.writeJSON("atlasDailyFocus", focus);
    }

    function renderFocus() {
        const focus = getDailyFocus();
        if (!focus.text) {
            focusCard.innerHTML = `
                <button class="empty-focus" data-focus-action="edit" type="button">
                    <span>＋</span>
                    <strong>Elegí tu prioridad de hoy</strong>
                    <small>Elegí una prioridad clara para hoy.</small>
                </button>
            `;
            return;
        }
        focusCard.innerHTML = `
            <div class="focus-check ${focus.completed ? "completed" : ""}">
                <button data-focus-action="toggle" type="button" aria-label="${focus.completed ? "Reabrir prioridad" : "Completar prioridad"}">${focus.completed ? "✓" : ""}</button>
                <div>
                    <strong>${A.escapeHTML(focus.text)}</strong>
                    <span>${focus.completed ? "Listo. La prioridad de hoy está completada." : "Esta es la prioridad que elegiste para hoy."}</span>
                </div>
            </div>
        `;
    }

    function dueLabel(days, date) {
        if (!Number.isFinite(days)) return "Sin fecha";
        if (days < 0) return `Atrasado ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}`;
        if (days === 0) return "Hoy";
        if (days === 1) return "Mañana";
        if (days <= 7) return `En ${days} días`;
        return A.formatDate(date);
    }

    function getAgendaItems(data) {
        const items = [];
        tasks.filter(item => !item.completed).forEach(item => {
            const days = A.daysUntil(item.dueDate);
            if (!Number.isFinite(days) || (days > 7 && item.priority !== "high")) return;
            items.push({
                type: "Tarea",
                icon: "✓",
                title: item.text,
                detail: categoryLabels[item.category],
                date: item.dueDate,
                days,
                href: "#tasks",
                tone: days < 0 ? "danger" : item.priority === "high" ? "warning" : "blue"
            });
        });

        data.obligations.forEach(item => {
            const remaining = A.obligationRemaining(item);
            const days = A.daysUntil(item.dueDate);
            if (remaining <= 0 || !Number.isFinite(days) || days > 14) return;
            items.push({
                type: "Pago",
                icon: "₲",
                title: item.name || "Cuenta por pagar",
                detail: A.formatMoney(remaining),
                date: item.dueDate,
                days,
                href: "finance.html",
                tone: days < 0 ? "danger" : days <= 3 ? "warning" : "green"
            });
        });

        data.studies.filter(item => !item.completed).forEach(item => {
            const days = A.daysUntil(item.date);
            if (!Number.isFinite(days) || (days > 14 && item.priority !== "high")) return;
            items.push({
                type: "Estudio",
                icon: "▣",
                title: item.title || "Actividad académica",
                detail: item.subject || "Sin materia",
                date: item.date,
                days,
                href: "study.html",
                tone: days < 0 ? "danger" : days <= 3 ? "warning" : "purple"
            });
        });

        data.projects.filter(item => item.status !== "completed" && Number(item.progress || 0) < 100).forEach(item => {
            const date = item.deadline || item.dueDate;
            const days = A.daysUntil(date);
            if (!Number.isFinite(days) || days > 14) return;
            items.push({
                type: "Proyecto",
                icon: "◆",
                title: item.name || item.title || "Proyecto",
                detail: `${Number(item.progress || 0)}% avanzado`,
                date,
                days,
                href: "projects.html",
                tone: days < 0 ? "danger" : "amber"
            });
        });

        const habitsPending = data.habits.filter(item => !(Array.isArray(item.history) && item.history.includes(A.localDate())));
        if (habitsPending.length) {
            items.push({
                type: "Hábitos",
                icon: "○",
                title: `${habitsPending.length} hábito${habitsPending.length === 1 ? "" : "s"} pendiente${habitsPending.length === 1 ? "" : "s"}`,
                detail: habitsPending.slice(0, 2).map(item => item.name).join(" · "),
                date: A.localDate(),
                days: 0,
                href: "personal.html",
                tone: "cyan"
            });
        }

        return items.sort((a, b) => a.days - b.days || a.type.localeCompare(b.type, "es")).slice(0, 7);
    }

    function renderAgenda(data) {
        const items = getAgendaItems(data);
        agendaCount.textContent = `${items.length} pendiente${items.length === 1 ? "" : "s"}`;
        if (!items.length) {
            agenda.innerHTML = `
                <div class="agenda-empty">
                    <span>✓</span>
                    <strong>Tu agenda cercana está despejada.</strong>
                    <small>Buen momento para avanzar en algo importante.</small>
                </div>
            `;
            return;
        }
        agenda.innerHTML = items.map(item => `
            <a class="agenda-item" href="${item.href}">
                <span class="agenda-icon ${item.tone}">${item.icon}</span>
                <span class="agenda-copy">
                    <small>${A.escapeHTML(item.type)}</small>
                    <strong>${A.escapeHTML(item.title)}</strong>
                    <span>${A.escapeHTML(item.detail)}</span>
                </span>
                <span class="agenda-due ${item.days < 0 ? "overdue" : ""}">${dueLabel(item.days, item.date)}</span>
            </a>
        `).join("");
    }

    function calculateScore(data) {
        const parts = [];
        const focus = getDailyFocus();
        if (focus.text) parts.push(focus.completed ? 1 : 0);

        const todayTasks = tasks.filter(item => item.dueDate === A.localDate());
        if (todayTasks.length) parts.push(todayTasks.filter(item => item.completed).length / todayTasks.length);

        if (data.habits.length) {
            const done = data.habits.filter(item => Array.isArray(item.history) && item.history.includes(A.localDate())).length;
            parts.push(done / data.habits.length);
        }

        parts.push(data.health.some(item => item.date === A.localDate()) ? 1 : 0);

        const todayStudies = data.studies.filter(item => item.date === A.localDate());
        if (todayStudies.length) parts.push(todayStudies.filter(item => item.completed).length / todayStudies.length);

        if (!parts.length) return 0;
        return Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length * 100);
    }

    function renderScore(data) {
        const score = calculateScore(data);
        dailyScore.textContent = `${score}%`;
        scoreRing.style.setProperty("--score", `${score * 3.6}deg`);

        const agendaItems = getAgendaItems(data);
        const urgent = agendaItems.filter(item => item.days <= 0).length;
        if (score >= 80) headline.textContent = "Buen ritmo. Cerrá el día sin soltar lo importante.";
        else if (urgent) headline.textContent = `Tenés ${urgent} asunto${urgent === 1 ? "" : "s"} que necesita${urgent === 1 ? "" : "n"} atención hoy.`;
        else if (agendaItems.length) headline.textContent = `Tenés ${agendaItems.length} cosa${agendaItems.length === 1 ? "" : "s"} cerca. Elegí la primera y avanzá.`;
        else headline.textContent = "Tu agenda cercana está tranquila. Usá el espacio a tu favor.";
    }

    function moduleOrder() {
        const preferences = A.readJSON("atlasPreferences", {});
        const favorites = Array.isArray(preferences.favoriteAreas) ? preferences.favoriteAreas : [];
        const all = ["finance", "study", "health", "projects", "personal", "work"];
        if (window.ATLAS_IS_HR_ADMIN) all.push("rrhh");
        return [...new Set([...favorites, ...all])].filter(key => all.includes(key));
    }

    function moduleValues(data) {
        const income = data.transactions.filter(item => item.type === "income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const expenses = data.transactions.filter(item => item.type === "expense").reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const pendingStudies = data.studies.filter(item => !item.completed);
        const activeProjects = data.projects.filter(item => item.status !== "completed" && Number(item.progress || 0) < 100);
        const todayHealth = data.health.find(item => item.date === A.localDate());
        const habitsDone = data.habits.filter(item => Array.isArray(item.history) && item.history.includes(A.localDate())).length;
        const currentMonth = A.localDate().slice(0, 7);
        const monthWork = data.work.filter(item => String(item.date || "").slice(0, 7) === currentMonth);
        const workNet = monthWork.reduce((sum, item) => sum + Number(item.net || 0), 0);
        const activeAbsences = data.hrAbsences.filter(item => {
            if (item.actualReturnDate || item.cancelled) return false;
            return A.daysUntil(item.startDate) <= 0 && A.daysUntil(item.returnDate || item.endDate) >= 0;
        });

        return {
            finance: {
                value: A.formatMoney(income - expenses),
                detail: `${data.obligations.filter(item => A.obligationRemaining(item) > 0).length} cuenta(s) pendiente(s)`
            },
            study: {
                value: `${pendingStudies.length} pendiente${pendingStudies.length === 1 ? "" : "s"}`,
                detail: pendingStudies.length ? `Próximo: ${pendingStudies.sort((a, b) => String(a.date).localeCompare(String(b.date)))[0].subject || "Actividad"}` : "Agenda académica al día"
            },
            health: {
                value: todayHealth ? "Hoy medido" : "Falta hoy",
                detail: todayHealth ? `${todayHealth.water || 0} L de agua · ${todayHealth.sleep || 0} h de sueño` : "Registrá cómo viene tu día"
            },
            projects: {
                value: `${activeProjects.length} activo${activeProjects.length === 1 ? "" : "s"}`,
                detail: activeProjects.length ? `${Math.round(activeProjects.reduce((sum, item) => sum + Number(item.progress || 0), 0) / activeProjects.length)}% de avance promedio` : "Creá tu próximo proyecto"
            },
            personal: {
                value: `${habitsDone}/${data.habits.length} hoy`,
                detail: data.habits.length ? "Constancia diaria" : "Empezá con un hábito simple"
            },
            work: {
                value: monthWork.length ? A.formatMoney(workNet) : "Sin jornadas",
                detail: `${monthWork.reduce((sum, item) => sum + Number(item.hours || 0), 0)} h registradas este mes`
            },
            rrhh: {
                value: `${data.hrPeople.length} personas`,
                detail: `${activeAbsences.length} ausencia(s) activa(s)`
            }
        };
    }

    function renderModules(data) {
        const values = moduleValues(data);
        moduleOverview.innerHTML = moduleOrder().map(key => {
            const meta = moduleMeta[key];
            const item = values[key];
            return `
                <a class="module-card" data-module="${key}" href="${meta.href}">
                    <span class="module-card-icon">${meta.icon}</span>
                    <span class="module-card-copy">
                        <small>${meta.label}</small>
                        <strong>${A.escapeHTML(item.value)}</strong>
                        <span>${A.escapeHTML(item.detail)}</span>
                    </span>
                    <span class="module-card-action">${meta.action} →</span>
                </a>
            `;
        }).join("");
    }

    function renderTasks() {
        let visible = tasks.filter(item => {
            if (taskFilter === "completed") return item.completed;
            if (taskFilter === "today") return !item.completed && item.dueDate === A.localDate();
            return !item.completed;
        });

        visible.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
            return String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31"));
        });

        if (!visible.length) {
            const copy = taskFilter === "completed"
                ? "Todavía no hay tareas completadas."
                : taskFilter === "today"
                    ? "No tenés tareas con fecha de hoy."
                    : "No hay tareas pendientes. Podés agregar una con “Nuevo”.";
            taskList.innerHTML = `<div class="empty-state">${copy}</div>`;
            return;
        }

        taskList.innerHTML = visible.map(item => {
            const days = A.daysUntil(item.dueDate);
            const dateText = item.dueDate ? dueLabel(days, item.dueDate) : "Sin fecha";
            const safeId = A.escapeHTML(String(item.id));
            return `
                <article class="task-item ${item.completed ? "completed" : ""}">
                    <input data-action="toggle" data-id="${safeId}" type="checkbox" ${item.completed ? "checked" : ""} aria-label="Completar tarea">
                    <div class="task-copy">
                        <strong>${A.escapeHTML(item.text)}</strong>
                        <small><span>${A.escapeHTML(categoryLabels[item.category] || "Personal")}</span><span class="${days < 0 ? "overdue-text" : ""}">${A.escapeHTML(dateText)}</span>${item.priority === "high" ? "<span>Prioridad alta</span>" : ""}</small>
                    </div>
                    <button class="task-delete" data-action="delete" data-id="${safeId}" type="button" aria-label="Eliminar tarea">×</button>
                </article>
            `;
        }).join("");
    }

    function dateOffset(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return A.localDate(date);
    }

    function isoDay(value) {
        return String(value || "").slice(0, 10);
    }

    function renderWeekPulse(data) {
        const dates = Array.from({ length: 7 }, (_, index) => dateOffset(index - 6));
        const activity = dates.map(date => {
            const completedTasks = tasks.filter(item => isoDay(item.completedAt) === date).length;
            const completedStudies = data.studies.filter(item => isoDay(item.completedAt) === date).length;
            const habitMarks = data.habits.filter(item => Array.isArray(item.history) && item.history.includes(date)).length;
            const healthMark = data.health.some(item => item.date === date) ? 1 : 0;
            const workMark = data.work.some(item => item.date === date) ? 1 : 0;
            return completedTasks + completedStudies + habitMarks + healthMark + workMark;
        });
        const max = Math.max(1, ...activity);
        const activeDays = activity.filter(Boolean).length;
        const rate = Math.round(activeDays / 7 * 100);
        weekPulseRate.textContent = `${rate}%`;
        weekPulse.innerHTML = dates.map((date, index) => {
            const label = new Intl.DateTimeFormat("es-PY", { weekday: "narrow" }).format(A.parseDate(date));
            const height = activity[index] ? Math.max(22, Math.round(activity[index] / max * 100)) : 8;
            return `
                <div class="pulse-day ${date === A.localDate() ? "today" : ""}" title="${activity[index]} actividad(es)">
                    <div><span style="height:${height}%"></span></div>
                    <strong>${label}</strong>
                </div>
            `;
        }).join("");
        weekPulseCaption.textContent = activeDays
            ? `Registraste avances en ${activeDays} de los últimos 7 días.`
            : "Empezá a registrar para ver tu constancia.";
    }

    function renderInsights(data) {
        const insights = [];
        const overduePayments = data.obligations.filter(item => A.obligationRemaining(item) > 0 && A.daysUntil(item.dueDate) < 0);
        const overdueStudies = data.studies.filter(item => !item.completed && A.daysUntil(item.date) < 0);
        const soonStudies = data.studies.filter(item => !item.completed && A.daysUntil(item.date) >= 0 && A.daysUntil(item.date) <= 7);
        const undoneHabits = data.habits.filter(item => !(Array.isArray(item.history) && item.history.includes(A.localDate())));
        const stalledProjects = data.projects.filter(item => item.status !== "completed" && Number(item.progress || 0) < 100 && !String(item.nextAction || "").trim());

        if (overduePayments.length) insights.push({ icon: "₲", tone: "danger", title: "Revisá tus pagos atrasados", detail: `${overduePayments.length} cuenta${overduePayments.length === 1 ? "" : "s"} ya superó el vencimiento.`, href: "finance.html" });
        if (overdueStudies.length) insights.push({ icon: "▣", tone: "danger", title: "Cerrá la brecha académica", detail: `${overdueStudies.length} actividad${overdueStudies.length === 1 ? "" : "es"} figura${overdueStudies.length === 1 ? "" : "n"} vencida${overdueStudies.length === 1 ? "" : "s"}.`, href: "study.html" });
        if (!data.health.some(item => item.date === A.localDate())) insights.push({ icon: "+", tone: "blue", title: "Medí cómo viene tu día", detail: "Agua, sueño o energía: un dato ya mejora la lectura.", href: "health.html" });
        if (soonStudies.length) insights.push({ icon: "▣", tone: "purple", title: "Prepará lo que viene", detail: `${soonStudies.length} actividad${soonStudies.length === 1 ? "" : "es"} académica${soonStudies.length === 1 ? "" : "s"} llega${soonStudies.length === 1 ? "" : "n"} esta semana.`, href: "study.html" });
        if (undoneHabits.length) insights.push({ icon: "○", tone: "cyan", title: "Protegé tu racha", detail: `Te queda${undoneHabits.length === 1 ? "" : "n"} ${undoneHabits.length} hábito${undoneHabits.length === 1 ? "" : "s"} por marcar hoy.`, href: "personal.html" });
        if (stalledProjects.length) insights.push({ icon: "◆", tone: "warning", title: "Definí el próximo paso", detail: "Un proyecto sin siguiente acción se convierte en decoración.", href: "projects.html" });
        if (!insights.length) insights.push({ icon: "✓", tone: "green", title: "Tu sistema está tranquilo", detail: "Elegí una prioridad y aprovechá el espacio libre.", href: "#tasks" });

        smartInsights.innerHTML = insights.slice(0, 3).map(item => `
            <a class="insight-item" href="${item.href}">
                <span class="${item.tone}">${item.icon}</span>
                <div><strong>${item.title}</strong><small>${item.detail}</small></div>
                <b>→</b>
            </a>
        `).join("");
    }

    function renderAll() {
        const data = getData();
        setGreeting();
        renderFocus();
        renderAgenda(data);
        renderScore(data);
        renderModules(data);
        renderTasks();
        renderWeekPulse(data);
        renderInsights(data);
        A.updateNavCounts();
    }

    function saveTasks() {
        A.writeJSON("atlasTasks", tasks);
    }

    focusCard.addEventListener("click", event => {
        const action = event.target.closest("[data-focus-action]")?.dataset.focusAction;
        if (!action) return;
        const focus = getDailyFocus();
        if (action === "edit") {
            focusText.value = focus.text;
            focusDialog.showModal();
            focusText.focus();
        }
        if (action === "toggle" && focus.text) {
            focus.completed = !focus.completed;
            saveDailyFocus(focus);
            renderAll();
        }
    });

    document.querySelector("#editDailyFocus").addEventListener("click", () => {
        focusText.value = getDailyFocus().text;
        focusDialog.showModal();
        focusText.focus();
    });

    focusForm.addEventListener("submit", event => {
        event.preventDefault();
        const text = focusText.value.trim();
        if (!text) return;
        saveDailyFocus({ date: A.localDate(), text, completed: false });
        focusDialog.close();
        renderAll();
        A.notify("Prioridad de hoy guardada.");
    });

    taskList.addEventListener("change", event => {
        const control = event.target.closest('[data-action="toggle"]');
        if (!control) return;
        const task = tasks.find(item => String(item.id) === control.dataset.id);
        if (!task) return;
        task.completed = control.checked;
        task.completedAt = control.checked ? new Date().toISOString() : "";
        saveTasks();
        renderAll();
    });

    taskList.addEventListener("click", event => {
        const button = event.target.closest('[data-action="delete"]');
        if (!button || !confirm("¿Eliminar esta tarea?")) return;
        tasks = tasks.filter(item => String(item.id) !== button.dataset.id);
        saveTasks();
        renderAll();
    });

    taskFilters.addEventListener("click", event => {
        const button = event.target.closest("button[data-filter]");
        if (!button) return;
        taskFilter = button.dataset.filter;
        taskFilters.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
        renderTasks();
    });

    document.querySelectorAll("[data-close-dialog]").forEach(button => {
        button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog)?.close());
    });

    quickNotes.value = A.readJSON("atlasQuickNotes", "") || "";
    quickNotes.addEventListener("input", () => {
        notesStatus.textContent = "Guardando…";
        window.clearTimeout(notesTimer);
        notesTimer = window.setTimeout(() => {
            A.writeJSON("atlasQuickNotes", quickNotes.value);
            notesStatus.textContent = "Guardado";
        }, 350);
    });

    function hasMeaningfulData(data) {
        return tasks.length || data.obligations.length || data.transactions.length || data.studies.length ||
            data.health.length || data.projects.length || data.work.length || data.habits.length;
    }

    function maybeShowOnboarding() {
        const preferences = A.readJSON("atlasPreferences", {});
        const data = getData();
        if (preferences.onboardingDone || hasMeaningfulData(data)) return;
        window.setTimeout(() => {
            if (!onboardingDialog.open) onboardingDialog.showModal();
        }, 350);
    }

    onboardingForm.addEventListener("submit", event => {
        event.preventDefault();
        const favoriteAreas = Array.from(onboardingForm.querySelectorAll('input[name="focusArea"]:checked')).map(input => input.value);
        A.writeJSON("atlasPreferences", { onboardingDone: true, favoriteAreas });
        const goal = document.querySelector("#onboardingGoal").value.trim();
        if (goal) saveDailyFocus({ date: A.localDate(), text: goal, completed: false });
        onboardingDialog.close();
        renderAll();
        A.notify("Tu espacio ya está preparado.");
    });

    document.querySelector("#skipOnboarding").addEventListener("click", () => {
        A.writeJSON("atlasPreferences", {
            onboardingDone: true,
            favoriteAreas: ["finance", "study", "health", "projects"]
        });
        onboardingDialog.close();
        renderAll();
    });

    const BACKUP_KEYS = [
        "atlasTasks",
        "atlasQuickNotes",
        "atlasPreferences",
        "atlasDailyFocus",
        "atlasTransactions",
        "atlasObligations",
        "atlasStudyEvents",
        "atlasHealthRecords",
        "atlasProjects",
        "atlasWorkRecords",
        "atlasWorkSettings",
        "atlasHabits",
        "atlasHRWorkspaces",
        "atlasHRActiveContext",
        "atlasHRMigrationV07"
    ];
    const HR_COMPANY_KEYS = [
        "atlasHRPeople",
        "atlasHRAbsences",
        "atlasHRBranches",
        "atlasHRSchedules",
        "atlasHRScheduleAssignments",
        "atlasHRAttendance",
        "atlasHRAttendanceImports",
        "atlasHRCompliance",
        "atlasHRPayrollSettings",
        "atlasHRHolidays",
        "atlasHRContractTemplates",
        "atlasHRContractHistory"
    ];

    function allowedBackupKey(key) {
        const text = String(key || "");
        if (/^atlasHRAttendanceDeletes(?:__|$)/i.test(text) || text === "atlasReceiptDeletes") return false;
        if (/^atlasHR/i.test(text) && !window.ATLAS_IS_HR_ADMIN) return false;
        if (BACKUP_KEYS.includes(text)) return true;
        if (!text.startsWith("atlasHR")) return false;
        return /^atlasHR[A-Za-z0-9]+(?:__[A-Za-z0-9_-]+){0,2}$/.test(text);
    }

    function safeBackupValue(value) {
        return JSON.parse(JSON.stringify(value, (key, item) =>
            ["__proto__", "prototype", "constructor"].includes(key) ? undefined : item
        ));
    }

    function backupRecordTime(item) {
        const parsed = Date.parse(item?.updatedAt || item?.updated_at || item?.savedAt || item?.createdAt || "");
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function backupRecordIdentity(key, item) {
        if (item?.id !== undefined && item?.id !== null && String(item.id)) return `id:${String(item.id)}`;
        if (/atlasHRPeople/.test(key) && item?.ci) return `ci:${String(item.ci).replace(/\D/g, "")}`;
        if (/Attendance/.test(key) && item?.date && (item?.employeeId || item?.clockId)) {
            return `attendance:${item.employeeId || item.clockId}:${item.date}`;
        }
        return `value:${JSON.stringify(item)}`;
    }

    function mergeBackupArrays(key, current, incoming) {
        const merged = new Map();
        current.forEach(item => merged.set(backupRecordIdentity(key, item), safeBackupValue(item)));
        incoming.forEach(item => {
            const identity = backupRecordIdentity(key, item);
            const previous = merged.get(identity);
            if (!previous) {
                merged.set(identity, safeBackupValue(item));
                return;
            }
            const nextWins = backupRecordTime(item) >= backupRecordTime(previous);
            let combined = nextWins ? { ...previous, ...item } : { ...item, ...previous };
            if (key === "atlasObligations" && Array.isArray(previous.payments) && Array.isArray(item.payments)) {
                combined.payments = mergeBackupArrays("atlasObligationPayments", previous.payments, item.payments);
            }
            merged.set(identity, safeBackupValue(combined));
        });
        return Array.from(merged.values());
    }

    function combineBackupValue(key, incoming) {
        const current = A.readJSON(key, null);
        if (Array.isArray(current) && Array.isArray(incoming)) return mergeBackupArrays(key, current, incoming);
        if (
            current && incoming
            && typeof current === "object" && typeof incoming === "object"
            && !Array.isArray(current) && !Array.isArray(incoming)
        ) return safeBackupValue({ ...current, ...incoming });
        if (key === "atlasQuickNotes" && typeof current === "string" && typeof incoming === "string") {
            if (!current || current === incoming) return incoming;
            if (!incoming) return current;
            return `${current}\n\n--- Nota combinada desde respaldo ---\n${incoming}`;
        }
        return current === null || current === undefined || current === "" ? safeBackupValue(incoming) : current;
    }

    function markRestoredReceiptsPending(entries, receipts) {
        const entryMap = new Map(entries);
        const receiptMap = new Map((receipts || []).map(record => [String(record.paymentId), record]));
        const obligations = entryMap.get("atlasObligations");
        if (!Array.isArray(obligations) || !receiptMap.size) return entries;
        const updated = obligations.map(obligation => ({
            ...obligation,
            payments: Array.isArray(obligation.payments) ? obligation.payments.map(payment => {
                const restored = receiptMap.get(String(payment.id));
                if (!restored) return payment;
                const receipt = {
                    ...(payment.receipt || {}),
                    name: String(restored.name || payment.receipt?.name || "comprobante").slice(0, 200),
                    type: String(restored.type || payment.receipt?.type || "application/octet-stream"),
                    size: Number(restored.size || 0),
                    savedAt: restored.savedAt || new Date().toISOString(),
                    cloudPending: true
                };
                delete receipt.path;
                return { ...payment, receipt };
            }) : []
        }));
        entryMap.set("atlasObligations", updated);
        return Array.from(entryMap.entries());
    }

    function requestRestoreMode() {
        const answer = window.prompt(
            "Elegí cómo restaurar: escribí COMBINAR para conservar y unir los datos actuales, o REEMPLAZAR para sustituirlos.",
            "COMBINAR"
        );
        if (answer === null) return null;
        const normalized = answer.trim().toUpperCase();
        if (normalized === "COMBINAR") return "merge";
        if (normalized === "REEMPLAZAR") return "replace";
        throw new Error("Modo no válido. Escribí COMBINAR o REEMPLAZAR.");
    }

    function exportAppEntries() {
        const entries = {};
        const keys = new Set(BACKUP_KEYS);
        if (window.ATLAS_IS_HR_ADMIN) {
            const companies = A.readArray("atlasHRWorkspaces");
            companies.forEach(company => {
                HR_COMPANY_KEYS.forEach(key => keys.add(`${key}__${company.id}`));
            });
        }
        keys.forEach(key => {
            if (!allowedBackupKey(key) || !window.AtlasStore?.has(key)) return;
            entries[key] = safeBackupValue(A.readJSON(key, null));
        });
        return entries;
    }

    function storedDataKeys() {
        const workspaceId = window.AtlasStore?.workspaceId;
        if (!workspaceId) return [];
        const prefix = `atlas:${workspaceId}:`;
        const keys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const storageKey = localStorage.key(index);
            if (storageKey?.startsWith(prefix)) keys.push(storageKey.slice(prefix.length));
        }
        return keys;
    }

    function clearCurrentEntries() {
        const keys = new Set([...BACKUP_KEYS, ...storedDataKeys()]);
        keys.forEach(key => {
            if (key === "atlasReceiptDeletes" || /^atlasHRAttendanceDeletes(?:__|$)/i.test(key)) {
                A.writeJSON(key, []);
                return;
            }
            if (key.startsWith("atlasHRAttendanceFallback__")) return;
            if (allowedBackupKey(key)) A.writeJSON(key, null);
        });
    }

    function openAttendanceDatabase() {
        return new Promise((resolve, reject) => {
            if (!("indexedDB" in window)) return resolve(null);
            const request = indexedDB.open("atlas-so-rrhh", 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains("attendance")) {
                    request.result.createObjectStore("attendance", { keyPath: "id" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function normalizeAttendanceBackup(item, companyId = "") {
        const resolvedCompany = String(companyId || item?.companyId || "");
        const employeeId = String(item?.employeeId || "");
        const clockId = String(item?.clockId || "");
        const date = String(item?.date || "").slice(0, 10);
        return {
            companyId: resolvedCompany,
            id: String(item?.id || `restored-${resolvedCompany}-${employeeId || clockId}-${date}`),
            employeeId,
            clientId: String(item?.clientId || ""),
            clockId,
            sourceName: String(item?.sourceName || ""),
            date,
            in: String(item?.in || ""),
            out: String(item?.out || ""),
            rawStatus: String(item?.rawStatus || ""),
            resolvedStatus: String(item?.resolvedStatus || ""),
            note: String(item?.note || ""),
            sourceImportId: String(item?.sourceImportId || ""),
            updatedAt: item?.updatedAt || new Date().toISOString()
        };
    }

    function fallbackAttendanceKeys() {
        const workspaceId = window.AtlasStore?.workspaceId;
        if (!workspaceId) return [];
        const scopedPrefix = `atlas:${workspaceId}:`;
        const keys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const storageKey = localStorage.key(index);
            if (!storageKey?.startsWith(`${scopedPrefix}atlasHRAttendanceFallback__`)) continue;
            const dataKey = storageKey.slice(scopedPrefix.length);
            if (/^atlasHRAttendanceFallback__(.+)__(\d{4}-\d{2})$/.test(dataKey)) keys.push(dataKey);
        }
        return keys;
    }

    function fallbackAttendanceRecords() {
        const records = [];
        fallbackAttendanceKeys().forEach(dataKey => {
            const match = dataKey.match(/^atlasHRAttendanceFallback__(.+)__(\d{4}-\d{2})$/);
            A.readArray(dataKey).forEach(item => records.push(normalizeAttendanceBackup(item, match[1])));
        });
        return records;
    }

    async function localAttendanceRecords() {
        const fallback = fallbackAttendanceRecords();
        const db = await openAttendanceDatabase();
        if (!db) return fallback;
        const buckets = await new Promise((resolve, reject) => {
            const transaction = db.transaction("attendance", "readonly");
            const request = transaction.objectStore("attendance").getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        db.close();
        const workspaceId = window.AtlasStore?.workspaceId;
        return [
            ...buckets
            .filter(bucket => !workspaceId || bucket.workspaceId === workspaceId)
            .flatMap(bucket => (bucket.records || []).map(item => normalizeAttendanceBackup(item, bucket.companyId))),
            ...fallback
        ];
    }

    async function cloudAttendanceRecords() {
        if (!window.ATLAS_IS_HR_ADMIN || !window.AtlasAuth?.client || !window.AtlasStore?.workspaceId) return [];
        const records = [];
        const pageSize = 1000;
        for (let offset = 0; ; offset += pageSize) {
            const { data, error } = await window.AtlasAuth.client
                .from("hr_attendance_records")
                .select("id,company_id,employee_id,client_id,clock_id,source_name,work_date,time_in,time_out,raw_status,resolved_status,note,source_import_id,updated_at")
                .eq("workspace_id", window.AtlasStore.workspaceId)
                .range(offset, offset + pageSize - 1);
            if (error) {
                if (!["42P01", "PGRST205"].includes(error.code)) throw error;
                break;
            }
            (data || []).forEach(row => records.push(normalizeAttendanceBackup({
                id: row.id,
                employeeId: row.employee_id,
                clientId: row.client_id,
                clockId: row.clock_id,
                sourceName: row.source_name,
                date: row.work_date,
                in: row.time_in,
                out: row.time_out,
                rawStatus: row.raw_status,
                resolvedStatus: row.resolved_status,
                note: row.note,
                sourceImportId: row.source_import_id,
                updatedAt: row.updated_at
            }, row.company_id)));
            if ((data || []).length < pageSize) break;
        }
        return records;
    }

    async function exportAttendanceRecords() {
        if (!window.ATLAS_IS_HR_ADMIN) return [];
        const [local, cloud] = await Promise.all([localAttendanceRecords(), cloudAttendanceRecords()]);
        const merged = new Map();
        [...cloud, ...local].forEach(item => {
            const key = `${item.companyId}:${item.employeeId || item.clockId}:${item.date}`;
            const previous = merged.get(key);
            if (!previous || Date.parse(item.updatedAt) >= Date.parse(previous.updatedAt)) merged.set(key, item);
        });
        const deletedByCompany = new Map();
        return Array.from(merged.values()).filter(item => {
            if (!deletedByCompany.has(item.companyId)) {
                deletedByCompany.set(item.companyId, new Set(A.readArray(`atlasHRAttendanceDeletes__${item.companyId}`).map(String)));
            }
            return !deletedByCompany.get(item.companyId).has(String(item.id));
        });
    }

    async function replaceCloudAttendance(records) {
        if (!window.AtlasAuth?.client || !window.AtlasStore?.workspaceId) {
            throw new Error("Se necesita conexión para restaurar las marcaciones de forma segura.");
        }
        const rows = records.map(item => ({
            id: item.id,
            workspace_id: window.AtlasStore.workspaceId,
            company_id: item.companyId,
            client_id: item.clientId || null,
            employee_id: item.employeeId,
            clock_id: item.clockId || null,
            source_name: item.sourceName || null,
            work_date: item.date,
            time_in: item.in || null,
            time_out: item.out || null,
            raw_status: item.rawStatus || null,
            resolved_status: item.resolvedStatus || null,
            note: item.note || null,
            source_import_id: item.sourceImportId || null,
            client_updated_at: item.updatedAt
        }));
        const { error } = await window.AtlasAuth.client.rpc("restore_hr_attendance_backup", {
            target_workspace: window.AtlasStore.workspaceId,
            records: rows
        });
        if (error) {
            if (["42883", "PGRST202"].includes(error.code)) {
                throw new Error("Falta aplicar supabase/v0.8-security-privacy-sync.sql antes de restaurar marcaciones.");
            }
            throw error;
        }
    }

    function mergeAttendanceBackups(current, incoming) {
        const merged = new Map();
        [...(current || []), ...(incoming || [])].forEach(raw => {
            const item = normalizeAttendanceBackup(raw);
            const key = `${item.companyId}:${item.employeeId || item.clockId}:${item.date}`;
            const previous = merged.get(key);
            const currentTime = Date.parse(item.updatedAt || "") || 0;
            const previousTime = Date.parse(previous?.updatedAt || "") || 0;
            if (!previous || currentTime >= previousTime) merged.set(key, item);
        });
        return Array.from(merged.values());
    }

    async function restoreAttendanceRecords(records, mode = "replace") {
        if (!window.ATLAS_IS_HR_ADMIN || !Array.isArray(records)) return;
        const grouped = new Map();
        let normalized = records.map(item => normalizeAttendanceBackup(item)).filter(item =>
            item.companyId && A.parseDate(item.date) && (item.employeeId || item.clockId)
        );
        if (mode === "merge") {
            normalized = mergeAttendanceBackups(await exportAttendanceRecords(), normalized);
        }
        await replaceCloudAttendance(normalized.filter(item => item.employeeId));
        normalized.forEach(item => {
            const period = item.date.slice(0, 7);
            const key = `${item.companyId}:${period}`;
            if (!grouped.has(key)) grouped.set(key, { companyId: item.companyId, period, records: [] });
            const clean = { ...item };
            delete clean.companyId;
            grouped.get(key).records.push(clean);
        });
        fallbackAttendanceKeys().forEach(key => A.writeJSON(key, null));
        const db = await openAttendanceDatabase();
        if (!db) {
            grouped.forEach(bucket => A.writeJSON(`atlasHRAttendanceFallback__${bucket.companyId}__${bucket.period}`, bucket.records));
            return;
        }
        await new Promise((resolve, reject) => {
            const transaction = db.transaction("attendance", "readwrite");
            const store = transaction.objectStore("attendance");
            const request = store.getAll();
            request.onsuccess = () => {
                (request.result || []).filter(bucket => bucket.workspaceId === window.AtlasStore.workspaceId)
                    .forEach(bucket => store.delete(bucket.id));
                grouped.forEach(bucket => store.put({
                    id: `${window.AtlasStore.workspaceId}:${bucket.companyId}:${bucket.period}`,
                    workspaceId: window.AtlasStore.workspaceId,
                    companyId: bucket.companyId,
                    period: bucket.period,
                    records: bucket.records,
                    updatedAt: new Date().toISOString()
                }));
            };
            request.onerror = () => reject(request.error);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    }

    function openReceiptDatabase() {
        return new Promise((resolve, reject) => {
            if (!("indexedDB" in window)) return resolve(null);
            const request = indexedDB.open("atlasSOFiles", 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains("paymentReceipts")) {
                    request.result.createObjectStore("paymentReceipts", { keyPath: "paymentId" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    function receiptMimeType(name, type) {
        const normalized = String(type || "").toLowerCase();
        if (["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(normalized)) return normalized;
        const extension = String(name || "").toLowerCase().match(/\.(jpe?g|png|webp|pdf)$/)?.[1] || "";
        return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" })[extension] || "";
    }

    async function exportReceipts() {
        const db = await openReceiptDatabase();
        const records = db ? await new Promise((resolve, reject) => {
            const transaction = db.transaction("paymentReceipts", "readonly");
            const request = transaction.objectStore("paymentReceipts").getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        }) : [];
        db?.close();
        const workspaceId = window.AtlasStore?.workspaceId || "local";
        const payments = A.readArray("atlasObligations")
            .flatMap(item => Array.isArray(item.payments) ? item.payments : []);
        const paymentIds = new Set(payments.map(item => String(item.id)));
        const scoped = records.filter(record =>
            (record.workspaceId === workspaceId && paymentIds.has(String(record.originalPaymentId ?? record.paymentId).replace(`${workspaceId}:`, "")))
            || (!record.workspaceId && paymentIds.has(String(record.originalPaymentId ?? record.paymentId)))
        );
        const exported = new Map();
        const localRecords = await Promise.all(scoped.map(async record => ({
            paymentId: String(record.originalPaymentId
                ?? (String(record.paymentId).startsWith(`${workspaceId}:`) ? String(record.paymentId).slice(workspaceId.length + 1) : record.paymentId)),
            name: record.name,
            type: receiptMimeType(record.name, record.type || record.file?.type),
            size: record.size,
            savedAt: record.savedAt,
            dataUrl: record.file ? await blobToDataURL(record.file) : null
        })));
        localRecords.forEach(record => exported.set(record.paymentId, record));

        for (const payment of payments) {
            if (!payment?.receipt) continue;
            const paymentId = String(payment.id || "");
            if (!paymentId) throw new Error("Hay un comprobante sin identificador de pago.");
            const local = exported.get(paymentId);
            if (local?.dataUrl) continue;
            const path = String(payment.receipt.path || "");
            const prefix = `${workspaceId}/`;
            if (!path || workspaceId === "local" || !path.startsWith(prefix) || !window.AtlasAuth?.client?.storage) {
                throw new Error(`El comprobante del pago ${paymentId} no está disponible para incluirlo en la copia.`);
            }
            const { data, error } = await window.AtlasAuth.client.storage.from("atlas-files").download(path);
            if (error || !data) throw new Error(`No se pudo descargar el comprobante del pago ${paymentId}.`);
            if (data.size > 10 * 1024 * 1024) throw new Error(`El comprobante del pago ${paymentId} supera 10 MB.`);
            exported.set(paymentId, {
                paymentId,
                name: String(payment.receipt.name || path.split("/").pop() || "comprobante").slice(0, 200),
                type: receiptMimeType(payment.receipt.name || path, payment.receipt.type || data.type),
                size: data.size,
                savedAt: payment.receipt.savedAt || new Date().toISOString(),
                dataUrl: await blobToDataURL(data)
            });
        }
        return Array.from(exported.values());
    }

    function bytesToBase64(bytes) {
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 32768) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        }
        return btoa(binary);
    }

    function base64ToBytes(value) {
        const binary = atob(String(value || ""));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    }

    async function backupKey(password, salt, usage) {
        const material = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            "PBKDF2",
            false,
            ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 },
            material,
            { name: "AES-GCM", length: 256 },
            false,
            [usage]
        );
    }

    async function encryptBackup(payload, password) {
        if (!window.crypto?.subtle) throw new Error("Este navegador no permite cifrar la copia.");
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const key = await backupKey(password, salt, "encrypt");
        const plaintext = new TextEncoder().encode(JSON.stringify(payload));
        const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
        return {
            schema: "atlas-so-encrypted-backup",
            version: "8.0",
            kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 310000, salt: bytesToBase64(salt) },
            cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
            ciphertext: bytesToBase64(ciphertext)
        };
    }

    async function decryptBackup(envelope, password) {
        if (
            envelope?.schema !== "atlas-so-encrypted-backup"
            || envelope?.version !== "8.0"
            || envelope?.kdf?.name !== "PBKDF2"
            || envelope?.kdf?.hash !== "SHA-256"
            || envelope?.kdf?.iterations !== 310000
            || envelope?.cipher?.name !== "AES-GCM"
        ) throw new Error("Formato de copia cifrada no válido.");
        try {
            const salt = base64ToBytes(envelope.kdf.salt);
            const iv = base64ToBytes(envelope.cipher.iv);
            if (salt.length !== 16 || iv.length !== 12) throw new Error("Parámetros inválidos");
            const key = await backupKey(password, salt, "decrypt");
            const plaintext = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                key,
                base64ToBytes(envelope.ciphertext)
            );
            return JSON.parse(new TextDecoder().decode(plaintext));
        } catch {
            throw new Error("La contraseña es incorrecta o la copia fue alterada.");
        }
    }

    function requestBackupPassword(confirmValue = false) {
        const password = window.prompt(confirmValue
            ? "Repetí la contraseña de la copia:"
            : "Creá una contraseña para proteger esta copia (mínimo 10 caracteres):");
        if (password === null) return null;
        if (password.length < 10) throw new Error("La contraseña de la copia debe tener al menos 10 caracteres.");
        return password;
    }

    async function exportBackup() {
        const button = document.querySelector("#exportBackup");
        button.disabled = true;
        backupStatus.textContent = "Preparando tu copia…";
        try {
            const password = requestBackupPassword();
            if (password === null) {
                backupStatus.textContent = "Copia cancelada.";
                return;
            }
            if (requestBackupPassword(true) !== password) throw new Error("Las contraseñas de la copia no coinciden.");
            const [receipts, attendance] = await Promise.all([
                exportReceipts(),
                exportAttendanceRecords()
            ]);
            const backup = {
                version: "8.0",
                schema: "atlas-so-backup",
                exportedAt: new Date().toISOString(),
                workspace: {
                    id: window.AtlasStore?.workspaceId || "",
                    entries: exportAppEntries(),
                    attendance,
                    receipts
                }
            };
            const envelope = await encryptBackup(backup, password);
            const blob = new Blob([JSON.stringify(envelope)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `atlas-so-backup-${A.localDate()}.atlas`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            backupStatus.textContent = `Copia cifrada completa: ${Object.keys(backup.workspace.entries).length} grupos de datos, ${attendance.length} marcaciones y ${receipts.length} comprobante(s).`;
        } catch (error) {
            console.error(error);
            backupStatus.textContent = `No se pudo completar la copia: ${String(error.message || "error desconocido")}.`;
        } finally {
            button.disabled = false;
        }
    }

    function dataURLToBlob(dataUrl) {
        if (!/^data:(?:image\/(?:jpeg|png|webp)|application\/pdf);base64,/i.test(String(dataUrl || ""))) {
            throw new Error("Comprobante no permitido en la copia.");
        }
        const [header, data] = dataUrl.split(",");
        const type = header.match(/data:(.*?);/)?.[1] || "application/octet-stream";
        const binary = atob(data);
        if (binary.length > 10 * 1024 * 1024) throw new Error("El comprobante supera 10 MB.");
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return new Blob([bytes], { type });
    }

    function validateBackupPayload(parsed) {
        if (parsed?.schema !== "atlas-so-backup" || !parsed.workspace || typeof parsed.workspace !== "object") {
            throw new Error("Formato de copia no válido.");
        }
        if (parsed.version !== "8.0" || !Number.isFinite(Date.parse(parsed.exportedAt || ""))) {
            throw new Error("Versión de copia incompatible o fecha de exportación no válida.");
        }
        const entriesSource = parsed.workspace.entries;
        if (!entriesSource || typeof entriesSource !== "object" || Array.isArray(entriesSource)) {
            throw new Error("La copia no contiene grupos de datos válidos.");
        }
        const entries = Object.entries(entriesSource);
        if (entries.length > 500 || entries.some(([key]) => !allowedBackupKey(key))) {
            throw new Error("La copia contiene grupos de datos no permitidos.");
        }
        if (!Array.isArray(parsed.workspace.attendance) || !Array.isArray(parsed.workspace.receipts)) {
            throw new Error("La copia no contiene marcaciones o comprobantes válidos.");
        }
        if (parsed.workspace.attendance.length > 250000 || parsed.workspace.receipts.length > 10000) {
            throw new Error("La copia supera el volumen de restauración permitido.");
        }
        if (!window.ATLAS_IS_HR_ADMIN && parsed.workspace.attendance.length) {
            throw new Error("Esta cuenta no tiene permiso para restaurar marcaciones de RRHH.");
        }
        parsed.workspace.attendance.forEach(record => {
            const recordTimestamp = record?.updatedAt ? Date.parse(record.updatedAt) : Date.now();
            if (
                !record || typeof record !== "object"
                || !String(record.companyId || "").trim()
                || !String(record.employeeId || record.clockId || "").trim()
                || !A.parseDate(String(record.date || "").slice(0, 10))
                || String(record.id || "").length > 256
                || String(record.companyId || "").length > 256
                || String(record.employeeId || "").length > 256
                || !Number.isFinite(recordTimestamp)
                || recordTimestamp < Date.parse("2000-01-01T00:00:00.000Z")
                || recordTimestamp > Date.now() + 5 * 60 * 1000
            ) throw new Error("Hay una marcación no válida en la copia.");
        });
        const allowedReceiptTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
        parsed.workspace.receipts.forEach(record => {
            if (!record || typeof record !== "object") throw new Error("Hay un comprobante no válido.");
            const dataUrl = String(record.dataUrl || "");
            const encoded = dataUrl.split(",", 2)[1] || "";
            const decodedSize = encoded ? Math.floor(encoded.length * 3 / 4) - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0) : -1;
            if (
                !String(record.paymentId || "").trim()
                || String(record.paymentId).length > 256
                || String(record.name || "").length > 200
                || !allowedReceiptTypes.has(String(record.type || ""))
                || !Number.isFinite(Number(record.size))
                || Number(record.size) < 0
                || Number(record.size) > 10 * 1024 * 1024
                || Number(record.size) !== decodedSize
                || (record.savedAt && !Number.isFinite(Date.parse(record.savedAt)))
                || !record.dataUrl
                || dataUrl.length > 15 * 1024 * 1024
                || !/^data:(?:image\/(?:jpeg|png|webp)|application\/pdf);base64,[a-z0-9+/]+=*$/i.test(dataUrl)
                || !dataUrl.toLowerCase().startsWith(`data:${String(record.type).toLowerCase()};base64,`)
            ) throw new Error("Hay un comprobante no permitido en la copia.");
        });
        const entriesMap = Object.fromEntries(entries);
        const receiptIds = new Set(parsed.workspace.receipts.map(record => String(record.paymentId)));
        if (receiptIds.size !== parsed.workspace.receipts.length) throw new Error("La copia contiene comprobantes duplicados.");
        const referencedReceiptIds = new Set((Array.isArray(entriesMap.atlasObligations) ? entriesMap.atlasObligations : [])
            .flatMap(item => Array.isArray(item?.payments) ? item.payments : [])
            .filter(payment => payment?.receipt)
            .map(payment => String(payment.id)));
        if (
            [...receiptIds].some(id => !referencedReceiptIds.has(id))
            || [...referencedReceiptIds].some(id => !receiptIds.has(id))
        ) throw new Error("La copia tiene comprobantes incompletos o sin pago asociado.");
        const sourceWorkspace = String(parsed.workspace.id || "");
        const currentWorkspace = String(window.AtlasStore?.workspaceId || "");
        if (sourceWorkspace && currentWorkspace && sourceWorkspace !== currentWorkspace && !window.confirm(
            "Esta copia pertenece a otro espacio. Restaurarla trasladará sus datos al espacio actual. ¿Continuar?"
        )) throw new Error("Restauración cancelada.");
        return {
            entries: entries.map(([key, value]) => [key, safeBackupValue(value)]),
            attendance: parsed.workspace.attendance.map(item => safeBackupValue(item)),
            receipts: parsed.workspace.receipts.map(item => safeBackupValue(item))
        };
    }

    async function restoreReceipts(receipts, obligations = A.readArray("atlasObligations"), mode = "replace") {
        if (!Array.isArray(receipts)) return;
        const prepared = receipts.flatMap(record => {
            if (!record?.dataUrl || String(record.dataUrl).length > 15 * 1024 * 1024) return [];
            const file = dataURLToBlob(record.dataUrl);
            return [{
                paymentId: record.paymentId,
                name: String(record.name || "comprobante"),
                type: file.type,
                size: file.size,
                savedAt: record.savedAt || new Date().toISOString(),
                file
            }];
        });
        const db = await openReceiptDatabase();
        if (!db) return;
        const workspaceId = window.AtlasStore?.workspaceId || "local";
        const paymentIds = new Set([
            ...A.readArray("atlasObligations"),
            ...(Array.isArray(obligations) ? obligations : [])
        ]
            .flatMap(item => Array.isArray(item.payments) ? item.payments : [])
            .map(item => String(item.id)));
        await new Promise((resolve, reject) => {
            const transaction = db.transaction("paymentReceipts", "readwrite");
            const store = transaction.objectStore("paymentReceipts");
            const request = store.getAll();
            request.onsuccess = () => {
                if (mode === "replace") {
                    (request.result || []).filter(record =>
                        record.workspaceId === workspaceId
                        || (!record.workspaceId && paymentIds.has(String(record.originalPaymentId ?? record.paymentId)))
                    ).forEach(record => store.delete(record.paymentId));
                }
                prepared.forEach(record => store.put({
                    paymentId: `${workspaceId}:${String(record.paymentId)}`,
                    originalPaymentId: record.paymentId,
                    workspaceId,
                    name: record.name,
                    type: record.type,
                    size: record.size,
                    savedAt: record.savedAt,
                    file: record.file
                }));
            };
            request.onerror = () => reject(request.error);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    }

    function validateLegacyBackupData(data) {
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Formato anterior no válido.");
        const arrayProperties = [
            "tasks", "transactions", "obligations", "studyEvents", "healthRecords", "projects", "workRecords",
            "habits", "hrPeople", "hrAbsences", "hrClients", "hrBranches", "hrSchedules", "hrAttendance",
            "hrCompliance", "hrHolidays", "receipts"
        ];
        const objectProperties = ["preferences", "dailyFocus", "workSettings", "hrPayrollSettings"];
        const recognized = [
            ...arrayProperties.filter(property => Object.prototype.hasOwnProperty.call(data, property)),
            ...objectProperties.filter(property => Object.prototype.hasOwnProperty.call(data, property)),
            ...(Object.prototype.hasOwnProperty.call(data, "notes") ? ["notes"] : [])
        ];
        if (!recognized.length) throw new Error("La copia anterior no contiene datos reconocidos.");
        arrayProperties.forEach(property => {
            if (Object.prototype.hasOwnProperty.call(data, property) && !Array.isArray(data[property])) {
                throw new Error(`El grupo ${property} de la copia anterior no es válido.`);
            }
        });
        objectProperties.forEach(property => {
            if (
                Object.prototype.hasOwnProperty.call(data, property)
                && (!data[property] || typeof data[property] !== "object" || Array.isArray(data[property]))
            ) throw new Error(`El grupo ${property} de la copia anterior no es válido.`);
        });
        if (Object.prototype.hasOwnProperty.call(data, "notes") && typeof data.notes !== "string") {
            throw new Error("Las notas de la copia anterior no son válidas.");
        }
        if (!window.ATLAS_IS_HR_ADMIN && recognized.some(property => property.startsWith("hr") && data[property]?.length)) {
            throw new Error("Esta cuenta no tiene permiso para restaurar datos de RRHH.");
        }
        return safeBackupValue(data);
    }

    async function importBackup(file) {
        if (!file) return;
        let mode;
        try {
            mode = requestRestoreMode();
        } catch (error) {
            backupStatus.textContent = error.message;
            backupFile.value = "";
            return;
        }
        if (!mode) {
            backupFile.value = "";
            return;
        }
        const action = mode === "merge" ? "combinará la copia con" : "reemplazará";
        if (!confirm(`La restauración ${action} los datos actuales. ¿Continuar?`)) {
            backupFile.value = "";
            return;
        }
        if (file.size > 250 * 1024 * 1024) {
            backupStatus.textContent = "La copia supera el límite de 250 MB.";
            backupFile.value = "";
            return;
        }
        backupStatus.textContent = "Restaurando información…";
        try {
            let parsed = JSON.parse(await file.text());
            if (parsed?.schema === "atlas-so-encrypted-backup") {
                const password = window.prompt("Ingresá la contraseña de esta copia:");
                if (password === null) throw new Error("Restauración cancelada.");
                parsed = await decryptBackup(parsed, password);
            } else if (!window.confirm(
                "Esta es una copia anterior sin cifrado. Verificá que provenga de un lugar confiable. ¿Continuar?"
            )) throw new Error("Restauración cancelada.");
            if (parsed.schema === "atlas-so-backup" && parsed.workspace?.entries && typeof parsed.workspace.entries === "object") {
                const validated = validateBackupPayload(parsed);
                let entries = mode === "merge"
                    ? validated.entries.map(([key, value]) => [key, combineBackupValue(key, value)])
                    : validated.entries;
                entries = markRestoredReceiptsPending(entries, validated.receipts);
                const entryMap = Object.fromEntries(entries);
                await restoreAttendanceRecords(validated.attendance, mode);
                await restoreReceipts(validated.receipts, entryMap.atlasObligations, mode);
                if (mode === "replace") clearCurrentEntries();
                entries.forEach(([key, value]) => A.writeJSON(key, value));
            } else {
                const data = validateLegacyBackupData(parsed.data || parsed);
                const arrayMapping = {
                    tasks: "atlasTasks",
                    transactions: "atlasTransactions",
                    obligations: "atlasObligations",
                    studyEvents: "atlasStudyEvents",
                    healthRecords: "atlasHealthRecords",
                    projects: "atlasProjects",
                    workRecords: "atlasWorkRecords",
                    habits: "atlasHabits",
                    hrPeople: "atlasHRPeople",
                    hrAbsences: "atlasHRAbsences",
                    hrClients: "atlasHRClients",
                    hrBranches: "atlasHRBranches",
                    hrSchedules: "atlasHRSchedules",
                    hrAttendance: "atlasHRAttendance",
                    hrCompliance: "atlasHRCompliance",
                    hrHolidays: "atlasHRHolidays"
                };
                let entries = [];
                Object.entries(arrayMapping).forEach(([property, key]) => {
                    if (Array.isArray(data[property]) && (!key.startsWith("atlasHR") || window.ATLAS_IS_HR_ADMIN)) {
                        const value = safeBackupValue(data[property]);
                        entries.push([key, mode === "merge" ? combineBackupValue(key, value) : value]);
                    }
                });
                const objectMapping = {
                    preferences: "atlasPreferences",
                    dailyFocus: "atlasDailyFocus",
                    workSettings: "atlasWorkSettings",
                    hrPayrollSettings: "atlasHRPayrollSettings"
                };
                Object.entries(objectMapping).forEach(([property, key]) => {
                    if (data[property] && typeof data[property] === "object" && (!key.startsWith("atlasHR") || window.ATLAS_IS_HR_ADMIN)) {
                        const value = safeBackupValue(data[property]);
                        entries.push([key, mode === "merge" ? combineBackupValue(key, value) : value]);
                    }
                });
                if (typeof data.notes === "string") {
                    entries.push(["atlasQuickNotes", mode === "merge" ? combineBackupValue("atlasQuickNotes", data.notes) : data.notes]);
                }
                entries = markRestoredReceiptsPending(entries, Array.isArray(data.receipts) ? data.receipts : []);
                const entryMap = Object.fromEntries(entries);
                await restoreReceipts(Array.isArray(data.receipts) ? data.receipts : [], entryMap.atlasObligations, mode);
                if (mode === "replace") clearCurrentEntries();
                entries.forEach(([key, value]) => A.writeJSON(key, value));
            }
            quickNotes.value = A.readJSON("atlasQuickNotes", "") || "";
            const synced = await window.AtlasStore?.flush?.();
            backupStatus.textContent = synced === false
                ? "Copia restaurada en este dispositivo. La nube se actualizará al recuperar conexión."
                : `Copia ${mode === "merge" ? "combinada" : "reemplazada"} y sincronizada.`;
            renderAll();
            A.notify("Tu espacio fue restaurado.");
        } catch (error) {
            console.error(error);
            backupStatus.textContent = `No se pudo restaurar la copia: ${String(error.message || "archivo no válido")}.`;
        } finally {
            backupFile.value = "";
        }
    }

    document.querySelector("#exportBackup").addEventListener("click", exportBackup);
    document.querySelector("#importBackup").addEventListener("click", () => backupFile.click());
    backupFile.addEventListener("change", () => importBackup(backupFile.files[0]));
    window.addEventListener("atlas:open-backup", () => backupDialog.showModal());
    window.addEventListener("atlas:data-changed", event => {
        if (event.detail?.key === "atlasQuickNotes") {
            quickNotes.value = A.readJSON("atlasQuickNotes", "") || "";
        }
        renderAll();
    });
    window.addEventListener("pageshow", renderAll);
    window.addEventListener("focus", renderAll);

    if (location.hash === "#backup") window.setTimeout(() => backupDialog.showModal(), 250);
    renderAll();
    maybeShowOnboarding();
})();
