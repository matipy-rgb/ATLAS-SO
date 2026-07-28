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
                    <small>Una sola cosa importante para no dispersarte.</small>
                </button>
            `;
            return;
        }
        focusCard.innerHTML = `
            <div class="focus-check ${focus.completed ? "completed" : ""}">
                <button data-focus-action="toggle" type="button" aria-label="${focus.completed ? "Reabrir prioridad" : "Completar prioridad"}">${focus.completed ? "✓" : ""}</button>
                <div>
                    <strong>${A.escapeHTML(focus.text)}</strong>
                    <span>${focus.completed ? "Listo. Hoy ya avanzaste en lo que importaba." : "Terminá esto antes de repartir tu energía."}</span>
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
            return `
                <article class="task-item ${item.completed ? "completed" : ""}">
                    <input data-action="toggle" data-id="${item.id}" type="checkbox" ${item.completed ? "checked" : ""} aria-label="Completar tarea">
                    <div class="task-copy">
                        <strong>${A.escapeHTML(item.text)}</strong>
                        <small><span>${categoryLabels[item.category]}</span><span class="${days < 0 ? "overdue-text" : ""}">${dateText}</span>${item.priority === "high" ? "<span>Prioridad alta</span>" : ""}</small>
                    </div>
                    <button class="task-delete" data-action="delete" data-id="${item.id}" type="button" aria-label="Eliminar tarea">×</button>
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

    async function exportReceipts() {
        const db = await openReceiptDatabase();
        if (!db) return [];
        const records = await new Promise((resolve, reject) => {
            const transaction = db.transaction("paymentReceipts", "readonly");
            const request = transaction.objectStore("paymentReceipts").getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return Promise.all(records.map(async record => ({
            paymentId: record.paymentId,
            name: record.name,
            type: record.type,
            size: record.size,
            savedAt: record.savedAt,
            dataUrl: record.file ? await blobToDataURL(record.file) : null
        })));
    }

    async function exportBackup() {
        const button = document.querySelector("#exportBackup");
        button.disabled = true;
        backupStatus.textContent = "Preparando tu copia…";
        try {
            const receipts = await exportReceipts();
            const backup = {
                version: 5,
                exportedAt: new Date().toISOString(),
                data: {
                    tasks: A.loadTasks(),
                    notes: quickNotes.value,
                    preferences: A.readJSON("atlasPreferences", {}),
                    dailyFocus: A.readJSON("atlasDailyFocus", {}),
                    transactions: A.readArray("atlasTransactions"),
                    obligations: A.readArray("atlasObligations"),
                    studyEvents: A.readArray("atlasStudyEvents"),
                    healthRecords: A.readArray("atlasHealthRecords"),
                    projects: A.readArray("atlasProjects"),
                    workRecords: A.readArray("atlasWorkRecords"),
                    workSettings: A.readJSON("atlasWorkSettings", {}),
                    habits: A.readArray("atlasHabits"),
                    hrPeople: A.readArray("atlasHRPeople"),
                    hrAbsences: A.readArray("atlasHRAbsences"),
                    hrClients: A.readArray("atlasHRClients"),
                    hrBranches: A.readArray("atlasHRBranches"),
                    hrSchedules: A.readArray("atlasHRSchedules"),
                    hrAttendance: A.readArray("atlasHRAttendance"),
                    hrCompliance: A.readArray("atlasHRCompliance"),
                    hrPayrollSettings: A.readJSON("atlasHRPayrollSettings", {}),
                    hrHolidays: A.readArray("atlasHRHolidays"),
                    receipts
                }
            };
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `atlas-so-backup-${A.localDate()}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            backupStatus.textContent = `Copia lista con ${receipts.length} comprobante(s).`;
        } catch (error) {
            console.error(error);
            backupStatus.textContent = "No se pudo completar la copia.";
        } finally {
            button.disabled = false;
        }
    }

    function dataURLToBlob(dataUrl) {
        const [header, data] = dataUrl.split(",");
        const type = header.match(/data:(.*?);/)?.[1] || "application/octet-stream";
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return new Blob([bytes], { type });
    }

    async function restoreReceipts(receipts) {
        if (!Array.isArray(receipts) || !receipts.length) return;
        const db = await openReceiptDatabase();
        if (!db) return;
        await new Promise((resolve, reject) => {
            const transaction = db.transaction("paymentReceipts", "readwrite");
            const store = transaction.objectStore("paymentReceipts");
            receipts.forEach(record => {
                if (!record.dataUrl) return;
                store.put({
                    paymentId: record.paymentId,
                    name: record.name,
                    type: record.type,
                    size: record.size,
                    savedAt: record.savedAt,
                    file: dataURLToBlob(record.dataUrl)
                });
            });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    }

    async function importBackup(file) {
        if (!file || !confirm("La restauración reemplazará los datos actuales. ¿Continuar?")) return;
        backupStatus.textContent = "Restaurando información…";
        try {
            const parsed = JSON.parse(await file.text());
            const data = parsed.data || parsed;
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
            Object.entries(arrayMapping).forEach(([property, key]) => {
                if (Array.isArray(data[property])) A.writeJSON(key, data[property]);
            });
            const objectMapping = {
                preferences: "atlasPreferences",
                dailyFocus: "atlasDailyFocus",
                workSettings: "atlasWorkSettings",
                hrPayrollSettings: "atlasHRPayrollSettings"
            };
            Object.entries(objectMapping).forEach(([property, key]) => {
                if (data[property] && typeof data[property] === "object") A.writeJSON(key, data[property]);
            });
            if (typeof data.notes === "string") A.writeJSON("atlasQuickNotes", data.notes);
            await restoreReceipts(data.receipts);
            quickNotes.value = A.readJSON("atlasQuickNotes", "") || "";
            backupStatus.textContent = "Copia restaurada correctamente.";
            renderAll();
            A.notify("Tu espacio fue restaurado.");
        } catch (error) {
            console.error(error);
            backupStatus.textContent = "El archivo no es una copia válida de ATLAS SO.";
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
