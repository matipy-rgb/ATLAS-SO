(function () {
    const A = window.Atlas;
    const financeAllowed = window.AtlasStore?.workspaceRole === "owner";
    const legacyFinanceKeys = new Set(["atlasTransactions", "atlasObligations", "atlasReceiptDeletes"]);
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
    if (!financeAllowed) {
        document.querySelector('[data-atlas-capture="expense"]')?.remove();
        document.querySelector('input[name="focusArea"][value="finance"]')?.closest("label")?.remove();
    }

    let tasks = normalizeTasks(A.loadTasks());
    let taskFilter = "pending";
    let notesTimer = null;
    let financeSnapshot = null;

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
            obligations: financeSnapshot?.obligations || A.readArray("atlasObligations"),
            transactions: financeSnapshot?.transactions || A.readArray("atlasTransactions"),
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

        if (financeAllowed) data.obligations.forEach(item => {
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
        const all = ["study", "health", "projects", "personal", "work"];
        if (financeAllowed) all.unshift("finance");
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

        if (financeAllowed && overduePayments.length) insights.push({ icon: "₲", tone: "danger", title: "Revisá tus pagos atrasados", detail: `${overduePayments.length} cuenta${overduePayments.length === 1 ? "" : "s"} ya superó el vencimiento.`, href: "finance.html" });
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
            favoriteAreas: financeAllowed
                ? ["finance", "study", "health", "projects"]
                : ["study", "health", "projects"]
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
        "atlasReceiptDeletes",
        "atlasHabits",
        "atlasHRWorkspaces",
        "atlasHRActiveContext",
        "atlasHRMigrationV07",
        "atlasHRMigrationV09"
    ];
    const HR_COMPANY_KEYS = [
        "atlasHRPeople",
        "atlasHRAbsences",
        "atlasHRBranches",
        "atlasHRAreas",
        "atlasHRPositions",
        "atlasHRAssignments",
        "atlasHRAuditLog",
        "atlasHRImportJobs",
        "atlasHRLegalParameters",
        "atlasHRSchedules",
        "atlasHRScheduleAssignments",
        "atlasHRAttendance",
        "atlasHRAttendanceImports",
        "atlasHRAttendanceDeletes",
        "atlasHRCompliance",
        "atlasHRPayrollSettings",
        "atlasHRHolidays",
        "atlasHRContractTemplates",
        "atlasHRContractHistory"
    ];

    function allowedBackupKey(key) {
        const text = String(key || "");
        if (/^atlasHR/i.test(text) && !window.ATLAS_IS_HR_ADMIN) return false;
        if (!financeAllowed && legacyFinanceKeys.has(text)) return false;
        if (BACKUP_KEYS.includes(text)) return true;
        if (!text.startsWith("atlasHR")) return false;
        return /^atlasHR[A-Za-z0-9]+(?:__[A-Za-z0-9_-]+){0,2}$/.test(text);
    }

    function safeBackupValue(value) {
        return JSON.parse(JSON.stringify(value, (key, item) =>
            ["__proto__", "prototype", "constructor"].includes(key) ? undefined : item
        ));
    }

    const FINANCE_BACKUP_STORES = [
        "contexts", "accounts", "categories", "paymentMethods", "recurrences",
        "obligations", "transactions", "payments", "attachments", "budgets",
        "goals", "goalEntries", "assets", "valuations", "monthlyCloses",
        "savedFilters", "migrationRuns", "migrationErrors", "auditLog"
    ];
    const RESTORABLE_FINANCE_ENTITIES = new Set([
        "contexts", "accounts", "categories", "paymentMethods", "recurrences",
        "obligations", "transactions", "payments", "attachments", "budgets",
        "goals", "goalEntries", "assets", "valuations", "monthlyCloses", "savedFilters"
    ]);

    function loadOptionalScript(source) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${source}"]`);
            if (existing?.dataset.loaded === "true") return resolve();
            const script = existing || document.createElement("script");
            script.src = source;
            script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
            script.addEventListener("error", () => reject(new Error(`No se pudo cargar ${source}.`)), { once: true });
            if (!existing) document.head.appendChild(script);
        });
    }

    async function openFinanceStorage() {
        if (!window.AtlasFinanceStorage && window.AtlasStore?.workspaceRole === "owner") {
            await loadOptionalScript("finance-storage.js");
        }
        const Storage = window.AtlasFinanceStorage?.FinanceStorage;
        if (!Storage || window.AtlasStore?.workspaceRole !== "owner") return null;
        const storage = new Storage();
        await storage.open();
        return storage;
    }

    async function refreshFinanceSnapshot() {
        if (!financeAllowed) return;
        const storage = await openFinanceStorage();
        if (!storage) return;
        try {
            const workspaceId = window.AtlasStore?.workspaceId || "";
            const [obligations, transactions] = await Promise.all([
                storage.list("obligations", { workspace_id: workspaceId }),
                storage.list("transactions", { workspace_id: workspaceId })
            ]);
            if (!obligations.length && !transactions.length) return;
            financeSnapshot = {
                obligations: obligations.filter(item => item.status !== "void").map(item => ({
                    ...item,
                    name: item.name || "Pago pendiente",
                    amount: Number(item.principal_amount || 0) + Number(item.interest_amount || 0) + Number(item.surcharge_amount || 0),
                    paidAmount: Number(item.paid_amount || 0),
                    dueDate: item.due_date || ""
                })),
                transactions: transactions.filter(item => item.status === "confirmed").map(item => ({
                    ...item,
                    type: item.reporting_effect,
                    amount: Number(item.amount || 0),
                    createdAt: item.occurred_at
                }))
            };
            renderAll();
        } finally {
            storage.close();
        }
    }

    async function exportFinanceBase() {
        const storage = await openFinanceStorage();
        if (!storage) return null;
        const workspaceId = window.AtlasStore?.workspaceId || "";
        try {
            const stores = {};
            for (const name of FINANCE_BACKUP_STORES) {
                stores[name] = safeBackupValue(await storage.list(name, { workspace_id: workspaceId }));
            }
            return {
                schema: "atlas-so-finance-base",
                version: "0.10",
                stores
            };
        } finally {
            storage.close();
        }
    }

    function validateFinanceBase(finance) {
        if (finance === null || finance === undefined) return null;
        if (finance?.schema !== "atlas-so-finance-base" || !["0.10-stage1", "0.10"].includes(finance?.version)) {
            throw new Error("La sección financiera de la copia no es válida.");
        }
        if (window.AtlasStore?.workspaceRole !== "owner") {
            throw new Error("Solo el propietario puede restaurar Finanzas.");
        }
        const limits = {
            contexts: 100,
            accounts: 1000,
            categories: 5000,
            paymentMethods: 1000,
            recurrences: 10000,
            transactions: 250000,
            obligations: 50000,
            payments: 100000,
            attachments: 100000,
            budgets: 100000,
            goals: 10000,
            goalEntries: 250000,
            assets: 10000,
            valuations: 100000,
            monthlyCloses: 10000,
            savedFilters: 1000,
            migrationRuns: 1000,
            migrationErrors: 100000,
            auditLog: 250000
        };
        const stores = {};
        for (const name of FINANCE_BACKUP_STORES) {
            const records = finance.stores?.[name] ?? (finance.version === "0.10-stage1" || name === "auditLog" ? [] : null);
            if (!Array.isArray(records) || records.length > limits[name]) {
                throw new Error(`La copia financiera contiene un volumen no permitido en ${name}.`);
            }
            stores[name] = records.map(record => {
                if (!record || typeof record !== "object" || Array.isArray(record) || !record.id) {
                    throw new Error(`La copia financiera contiene un registro no válido en ${name}.`);
                }
                return safeBackupValue(record);
            });
        }
        const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
        const index = name => {
            const records = stores[name];
            const map = new Map(records.map(record => [record.id, record]));
            if (map.size !== records.length) throw new Error(`La copia financiera repite identificadores en ${name}.`);
            return map;
        };
        const contexts = index("contexts");
        const accounts = index("accounts");
        const categories = index("categories");
        const paymentMethods = index("paymentMethods");
        const recurrences = index("recurrences");
        const transactions = index("transactions");
        const obligations = index("obligations");
        const payments = index("payments");
        index("attachments");
        const budgets = index("budgets");
        const goals = index("goals");
        const goalEntries = index("goalEntries");
        const assets = index("assets");
        const valuations = index("valuations");
        index("monthlyCloses");
        index("savedFilters");
        for (const context of contexts.values()) {
            if (!uuid(context.id) || !["personal", "business"].includes(context.kind)
                || !["active", "archived"].includes(context.status) || !String(context.name || "").trim()) {
                throw new Error("La copia contiene un contexto financiero no válido.");
            }
        }
        for (const account of accounts.values()) {
            if (!uuid(account.id) || !contexts.has(account.context_id)
                || !window.AtlasFinanceCore.ACCOUNT_TYPES.some(type => type.value === account.account_type)
                || account.currency !== "PYG" || !Number.isSafeInteger(Number(account.opening_balance))
                || !window.AtlasFinanceCore.isISODate(account.opened_on)
                || !["active", "archived"].includes(account.status) || !String(account.name || "").trim()) {
                throw new Error("La copia contiene una cuenta financiera no válida.");
            }
        }
        for (const category of categories.values()) {
            const parent = category.parent_id ? categories.get(category.parent_id) : null;
            if (!uuid(category.id) || !contexts.has(category.context_id)
                || !["income", "expense", "both"].includes(category.flow_type)
                || !["active", "archived"].includes(category.status) || !String(category.name || "").trim()
                || !/^#[0-9a-f]{6}$/i.test(String(category.color || ""))
                || (category.parent_id && (!parent || parent.context_id !== category.context_id || parent.parent_id))) {
                throw new Error("La copia contiene una categoría financiera no válida.");
            }
        }
        for (const transaction of transactions.values()) {
            const account = accounts.get(transaction.account_id);
            const category = transaction.category_id ? categories.get(transaction.category_id) : null;
            if (!uuid(transaction.id) || !account || account.context_id !== transaction.context_id
                || (transaction.category_id && (!category || category.context_id !== transaction.context_id))
                || !["income", "expense"].includes(transaction.transaction_type)
                || !window.AtlasFinanceCore.OPERATION_TYPES.some(type => type.value === (transaction.operation_kind || transaction.transaction_type))
                || !["income", "expense", "neutral"].includes(transaction.reporting_effect || transaction.transaction_type)
                || !Number.isSafeInteger(Number(transaction.balance_delta ?? (transaction.transaction_type === "income" ? transaction.amount : -transaction.amount)))
                || !["pending", "confirmed", "void"].includes(transaction.status)
                || !window.AtlasFinanceCore.positiveMoney(transaction.amount)
                || Number.isNaN(Date.parse(transaction.occurred_at)) || !String(transaction.description || "").trim()) {
                throw new Error("La copia contiene un movimiento financiero no válido.");
            }
        }
        for (const obligation of obligations.values()) {
            const account = obligation.account_id ? accounts.get(obligation.account_id) : null;
            if (!uuid(obligation.id) || (obligation.account_id && (!account || account.context_id !== obligation.context_id))
                || !window.AtlasFinanceCore.positiveMoney(obligation.principal_amount)
                || !Number.isSafeInteger(Number(obligation.interest_amount || 0)) || Number(obligation.interest_amount || 0) < 0
                || !Number.isSafeInteger(Number(obligation.surcharge_amount || 0)) || Number(obligation.surcharge_amount || 0) < 0
                || !Number.isSafeInteger(Number(obligation.paid_amount))
                || Number(obligation.paid_amount) < 0
                || Number(obligation.paid_amount) > Number(obligation.principal_amount) + Number(obligation.interest_amount || 0) + Number(obligation.surcharge_amount || 0)
                || !window.AtlasFinanceCore.isISODate(obligation.due_date)
                || !["once", "weekly", "monthly", "quarterly", "yearly", "installment"].includes(obligation.frequency)
                || !["pending", "partial", "paid", "void"].includes(obligation.status)) {
                throw new Error("La copia contiene una obligación financiera no válida.");
            }
        }
        for (const payment of payments.values()) {
            const obligation = obligations.get(payment.obligation_id);
            const account = accounts.get(payment.account_id);
            if (!uuid(payment.id) || !obligation || !account
                || obligation.context_id !== payment.context_id || account.context_id !== payment.context_id
                || (payment.linked_transaction_id && !transactions.has(payment.linked_transaction_id))
                || !window.AtlasFinanceCore.positiveMoney(payment.amount)
                || !window.AtlasFinanceCore.isISODate(payment.paid_on)) {
                throw new Error("La copia contiene un pago financiero no válido.");
            }
        }
        for (const attachment of stores.attachments) {
            if (!uuid(attachment.id)
                || (attachment.payment_id ? !payments.has(attachment.payment_id) : !transactions.has(attachment.transaction_id))
                || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(attachment.mime_type)
                || attachment.bucket_id !== "atlas-finance-files"
                || !["local_pending", "remote", "removed"].includes(attachment.sync_state)
                || !Number.isSafeInteger(Number(attachment.byte_size))
                || Number(attachment.byte_size) < 0 || Number(attachment.byte_size) > 10485760) {
                throw new Error("La copia contiene un comprobante financiero no válido.");
            }
        }
        for (const method of paymentMethods.values()) {
            if (!uuid(method.id) || !contexts.has(method.context_id)
                || !window.AtlasFinanceCore.PAYMENT_METHOD_TYPES.some(type => type.value === method.method_type)) {
                throw new Error("La copia contiene un medio de pago no válido.");
            }
        }
        for (const recurrence of recurrences.values()) {
            if (!uuid(recurrence.id) || !contexts.has(recurrence.context_id)
                || !["weekly", "monthly", "quarterly", "yearly"].includes(recurrence.frequency)
                || !window.AtlasFinanceCore.isISODate(recurrence.starts_on)) {
                throw new Error("La copia contiene una recurrencia no válida.");
            }
        }
        for (const budget of budgets.values()) {
            if (!uuid(budget.id) || !categories.has(budget.category_id)
                || !/^\d{4}-\d{2}$/.test(budget.month) || !window.AtlasFinanceCore.positiveMoney(budget.planned_amount)) {
                throw new Error("La copia contiene un presupuesto no válido.");
            }
        }
        for (const goal of goals.values()) {
            if (!uuid(goal.id) || !contexts.has(goal.context_id) || !window.AtlasFinanceCore.positiveMoney(goal.target_amount)) {
                throw new Error("La copia contiene una meta no válida.");
            }
        }
        for (const entry of goalEntries.values()) {
            if (!uuid(entry.id) || !goals.has(entry.goal_id) || !["contribution", "withdrawal"].includes(entry.entry_type)
                || !window.AtlasFinanceCore.positiveMoney(entry.amount) || !window.AtlasFinanceCore.isISODate(entry.occurred_on)) {
                throw new Error("La copia contiene un movimiento de meta no válido.");
            }
        }
        for (const asset of assets.values()) {
            if (!uuid(asset.id) || !contexts.has(asset.context_id) || !["asset", "liability"].includes(asset.asset_class)
                || !window.AtlasFinanceCore.positiveMoney(asset.opening_value)) {
                throw new Error("La copia contiene un activo o pasivo no válido.");
            }
        }
        for (const valuation of valuations.values()) {
            if (!uuid(valuation.id) || !assets.has(valuation.asset_id) || !Number.isSafeInteger(Number(valuation.value))
                || Number(valuation.value) < 0 || !window.AtlasFinanceCore.isISODate(valuation.valued_on)) {
                throw new Error("La copia contiene una valuación no válida.");
            }
        }
        return { schema: finance.schema, version: "0.10", stores };
    }

    async function restoreFinanceBase(finance) {
        if (!finance) return 0;
        const storage = await openFinanceStorage();
        if (!storage) throw new Error("No se pudo abrir el almacenamiento financiero local.");
        const workspaceId = window.AtlasStore?.workspaceId || "";
        const userId = window.AtlasStore?.userId || "";
        let restored = 0;
        try {
            for (const name of FINANCE_BACKUP_STORES) {
                await storage.clearWorkspace(name, workspaceId);
                const records = finance.stores[name].map(record => ({
                    ...record,
                    workspace_id: workspaceId,
                    ...(Object.hasOwn(record, "migration_run_id") ? { migration_run_id: null } : {}),
                    ...(record.created_by ? { created_by: userId } : {}),
                    ...(record.updated_by ? { updated_by: userId } : {})
                })).sort((left, right) => name === "categories"
                    ? Number(Boolean(left.parent_id)) - Number(Boolean(right.parent_id))
                    : 0);
                await storage.bulkPut(name, records);
                restored += records.length;
                if (RESTORABLE_FINANCE_ENTITIES.has(name)) {
                    for (const record of records) {
                        await storage.queue({
                            operationId: window.AtlasFinanceCore?.createId?.() || `${Date.now()}-${Math.random()}`,
                            idempotencyKey: `restore:${name}:${record.id}:${record.version || 1}`,
                            workspace_id: workspaceId,
                            entity: name,
                            action: "restore",
                            baseVersion: 0,
                            record
                        });
                    }
                }
            }
            return restored;
        } finally {
            storage.close();
        }
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
            branchId: String(item?.branchId || ""),
            assignmentId: String(item?.assignmentId || ""),
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
                .select("id,company_id,employee_id,client_id,branch_id,assignment_id,clock_id,source_name,work_date,time_in,time_out,raw_status,resolved_status,note,source_import_id,updated_at")
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
                branchId: row.branch_id,
                assignmentId: row.assignment_id,
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
            branch_id: item.branchId || null,
            assignment_id: item.assignmentId || null,
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
            updated_at: item.updatedAt
        }));
        const { error } = await window.AtlasAuth.client.rpc("restore_hr_attendance_backup", {
            target_workspace: window.AtlasStore.workspaceId,
            records: rows
        });
        if (error) {
            if (["42883", "PGRST202"].includes(error.code)) {
                throw new Error("Falta completar la configuración segura del servidor antes de restaurar marcaciones.");
            }
            throw error;
        }
    }

    async function restoreAttendanceRecords(records) {
        if (!window.ATLAS_IS_HR_ADMIN || !Array.isArray(records)) return;
        const grouped = new Map();
        const normalized = records.map(item => normalizeAttendanceBackup(item)).filter(item =>
            item.companyId && A.parseDate(item.date) && (item.employeeId || item.clockId)
        );
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

    async function exportReceipts() {
        if (!financeAllowed) return [];
        const db = await openReceiptDatabase();
        if (!db) return [];
        const records = await new Promise((resolve, reject) => {
            const transaction = db.transaction("paymentReceipts", "readonly");
            const request = transaction.objectStore("paymentReceipts").getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        db.close();
        const workspaceId = window.AtlasStore?.workspaceId || "local";
        const paymentIds = new Set(A.readArray("atlasObligations")
            .flatMap(item => Array.isArray(item.payments) ? item.payments : [])
            .map(item => String(item.id)));
        const scoped = records.filter(record =>
            record.workspaceId === workspaceId
            || (!record.workspaceId && paymentIds.has(String(record.originalPaymentId ?? record.paymentId)))
        );
        return Promise.all(scoped.map(async record => ({
            paymentId: record.originalPaymentId
                ?? (String(record.paymentId).startsWith(`${workspaceId}:`) ? String(record.paymentId).slice(workspaceId.length + 1) : record.paymentId),
            name: record.name,
            type: record.type,
            size: record.size,
            savedAt: record.savedAt,
            dataUrl: record.file ? await blobToDataURL(record.file) : null
        })));
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
            const [receipts, attendance, finance] = await Promise.all([
                exportReceipts(),
                exportAttendanceRecords(),
                exportFinanceBase()
            ]);
            const backup = {
                version: "8.0",
                schema: "atlas-so-backup",
                exportedAt: new Date().toISOString(),
                workspace: {
                    id: window.AtlasStore?.workspaceId || "",
                    entries: exportAppEntries(),
                    attendance,
                    receipts,
                    finance
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
            const financeCount = finance
                ? Object.values(finance.stores).reduce((sum, records) => sum + records.length, 0)
                : 0;
            backupStatus.textContent = `Copia cifrada completa: ${Object.keys(backup.workspace.entries).length} grupos de datos, ${attendance.length} marcaciones, ${receipts.length} comprobante(s) y ${financeCount} registro(s) financieros normalizados.`;
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
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return new Blob([bytes], { type });
    }

    function validateBackupPayload(parsed) {
        if (parsed?.schema !== "atlas-so-backup" || !parsed.workspace || typeof parsed.workspace !== "object") {
            throw new Error("Formato de copia no válido.");
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
        if (!financeAllowed && (
            entries.some(([key]) => legacyFinanceKeys.has(key))
            || parsed.workspace.receipts.length
            || parsed.workspace.finance
        )) throw new Error("Solo el propietario puede restaurar información financiera.");
        parsed.workspace.receipts.forEach(record => {
            if (!record || typeof record !== "object") throw new Error("Hay un comprobante no válido.");
            if (record.dataUrl && (
                String(record.dataUrl).length > 15 * 1024 * 1024
                || !/^data:(?:image\/(?:jpeg|png|webp)|application\/pdf);base64,[a-z0-9+/]+=*$/i.test(String(record.dataUrl))
            )) throw new Error("Hay un comprobante no permitido en la copia.");
        });
        const sourceWorkspace = String(parsed.workspace.id || "");
        const currentWorkspace = String(window.AtlasStore?.workspaceId || "");
        if (sourceWorkspace && currentWorkspace && sourceWorkspace !== currentWorkspace && !window.confirm(
            "Esta copia pertenece a otro espacio. Restaurarla trasladará sus datos al espacio actual. ¿Continuar?"
        )) throw new Error("Restauración cancelada.");
        return {
            entries: entries.map(([key, value]) => [key, safeBackupValue(value)]),
            attendance: parsed.workspace.attendance.map(item => safeBackupValue(item)),
            receipts: parsed.workspace.receipts.map(item => safeBackupValue(item)),
            finance: validateFinanceBase(parsed.workspace.finance)
        };
    }

    async function restoreReceipts(receipts, obligations = A.readArray("atlasObligations")) {
        if (!Array.isArray(receipts)) return;
        const prepared = receipts.flatMap(record => {
            if (!record?.dataUrl || String(record.dataUrl).length > 15 * 1024 * 1024) return [];
            return [{
                paymentId: record.paymentId,
                name: String(record.name || "comprobante"),
                type: String(record.type || "application/octet-stream"),
                size: Number(record.size || 0),
                savedAt: record.savedAt || new Date().toISOString(),
                file: dataURLToBlob(record.dataUrl)
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
                (request.result || []).filter(record =>
                    record.workspaceId === workspaceId
                    || (!record.workspaceId && paymentIds.has(String(record.originalPaymentId ?? record.paymentId)))
                ).forEach(record => store.delete(record.paymentId));
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

    async function importBackup(file) {
        if (!file || !confirm("La restauración reemplazará los datos actuales. ¿Continuar?")) return;
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
                const entries = validated.entries;
                const entryMap = Object.fromEntries(entries);
                await restoreAttendanceRecords(validated.attendance);
                await restoreReceipts(validated.receipts, entryMap.atlasObligations);
                const restoredFinance = await restoreFinanceBase(validated.finance);
                clearCurrentEntries();
                entries.forEach(([key, value]) => A.writeJSON(key, value));
                if (restoredFinance) {
                    window.dispatchEvent(new CustomEvent("atlas:finance-restored", { detail: { records: restoredFinance } }));
                }
            } else {
                const data = parsed.data || parsed;
                if (!data || typeof data !== "object") throw new Error("Formato anterior no válido.");
                if (!financeAllowed && (
                    Array.isArray(data.transactions) && data.transactions.length
                    || Array.isArray(data.obligations) && data.obligations.length
                    || Array.isArray(data.receipts) && data.receipts.length
                )) throw new Error("Solo el propietario puede restaurar información financiera.");
                await restoreReceipts(Array.isArray(data.receipts) ? data.receipts : [], data.obligations);
                clearCurrentEntries();
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
                    if (Array.isArray(data[property]) && (!key.startsWith("atlasHR") || window.ATLAS_IS_HR_ADMIN)) {
                        A.writeJSON(key, safeBackupValue(data[property]));
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
                        A.writeJSON(key, safeBackupValue(data[property]));
                    }
                });
                if (typeof data.notes === "string") A.writeJSON("atlasQuickNotes", data.notes);
            }
            quickNotes.value = A.readJSON("atlasQuickNotes", "") || "";
            const synced = await window.AtlasStore?.flush?.();
            backupStatus.textContent = synced === false
                ? "Copia restaurada en este dispositivo. La nube se actualizará al recuperar conexión."
                : "Copia restaurada y sincronizada.";
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
    const queueFinanceRefresh = () => refreshFinanceSnapshot().catch(error => console.warn("Resumen financiero local:", error.message));
    if ("requestIdleCallback" in window) window.requestIdleCallback(queueFinanceRefresh, { timeout: 1800 });
    else window.setTimeout(queueFinanceRefresh, 300);
    maybeShowOnboarding();
})();
