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

    const greeting = document.querySelector("#dashboardGreeting");
    const headline = document.querySelector("#dashboardHeadline");
    const attentionList = document.querySelector("#attentionList");
    const attentionBadge = document.querySelector("#attentionBadge");
    const moduleOverview = document.querySelector("#moduleOverview");
    const dailyScore = document.querySelector("#dailyScore");
    const dailyScoreBar = document.querySelector("#dailyScoreBar");
    const dailyScoreCaption = document.querySelector("#dailyScoreCaption");
    const dailyChecklist = document.querySelector("#dailyChecklist");
    const taskDialog = document.querySelector("#taskDialog");
    const taskForm = document.querySelector("#taskForm");
    const taskList = document.querySelector("#taskList");
    const taskFilters = document.querySelector("#taskFilters");
    const quickNotes = document.querySelector("#quickNotes");
    const notesStatus = document.querySelector("#notesStatus");
    const recentActivity = document.querySelector("#recentActivity");
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

    function saveTasks() {
        A.writeJSON("atlasTasks", tasks);
    }

    function setGreeting() {
        const hour = new Date().getHours();
        const salutation = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
        const firstName = A.getUserName().split(/\s+/)[0];
        greeting.textContent = `${salutation}, ${firstName}.`;
    }

    function getData() {
        return {
            obligations: A.readArray("atlasObligations"),
            transactions: A.readArray("atlasTransactions"),
            studies: A.readArray("atlasStudyEvents"),
            health: A.readArray("atlasHealthRecords"),
            projects: A.readArray("atlasProjects"),
            work: A.readArray("atlasWorkRecords"),
            hrPeople: A.readArray("atlasHRPeople"),
            hrAbsences: A.readArray("atlasHRAbsences"),
            habits: A.readArray("atlasHabits")
        };
    }

    function getAttention(data) {
        const attention = [];
        data.obligations.forEach(item => {
            const remaining = A.obligationRemaining(item);
            const days = A.daysUntil(item.dueDate);
            if (remaining <= 0 || days > 7) return;
            attention.push({
                severity: days < 0 ? 0 : 1,
                icon: "₲",
                title: item.name || "Cuenta por pagar",
                detail: days < 0
                    ? `Vencida hace ${Math.abs(days)} día(s) · ${A.formatMoney(remaining)}`
                    : `${days === 0 ? "Vence hoy" : `Vence en ${days} día(s)`} · ${A.formatMoney(remaining)}`,
                href: "finance.html",
                className: days < 0 ? "critical" : "warning"
            });
        });

        data.studies.filter(item => !item.completed).forEach(item => {
            const days = A.daysUntil(item.date);
            if (days > 7 && item.priority !== "high") return;
            attention.push({
                severity: days < 0 ? 0 : days <= 2 ? 1 : 2,
                icon: "E",
                title: item.title || "Actividad académica",
                detail: `${item.subject || "Estudios"} · ${days < 0 ? `vencida hace ${Math.abs(days)} día(s)` : days === 0 ? "vence hoy" : `faltan ${days} día(s)`}`,
                href: "study.html",
                className: days < 0 ? "critical" : "warning"
            });
        });

        tasks.filter(item => !item.completed && (item.priority === "high" || A.daysUntil(item.dueDate) <= 0)).forEach(item => {
            const days = A.daysUntil(item.dueDate);
            attention.push({
                severity: days < 0 ? 0 : item.priority === "high" ? 1 : 2,
                icon: "!",
                title: item.text,
                detail: `${categoryLabels[item.category]} · ${item.dueDate ? (days < 0 ? "atrasada" : days === 0 ? "para hoy" : A.formatDate(item.dueDate)) : "prioridad alta"}`,
                href: "#tasks",
                className: days < 0 ? "critical" : "warning"
            });
        });

        data.projects.filter(item => item.status !== "completed" && Number(item.progress || 0) < 100).forEach(item => {
            const days = A.daysUntil(item.deadline || item.dueDate);
            if (!Number.isFinite(days) || days > 7) return;
            attention.push({
                severity: days < 0 ? 0 : 2,
                icon: "P",
                title: item.name || item.title || "Proyecto",
                detail: days < 0 ? `Plazo vencido · ${Number(item.progress || 0)}% avanzado` : `${days === 0 ? "vence hoy" : `faltan ${days} día(s)`} · ${Number(item.progress || 0)}% avanzado`,
                href: "projects.html",
                className: days < 0 ? "critical" : "warning"
            });
        });

        const employeeNames = new Map(data.hrPeople.map(item => [String(item.id), item.fullName || item.name || "Funcionario"]));
        data.hrAbsences.filter(item => !item.actualReturnDate && !item.cancelled).forEach(item => {
            const returnDate = item.returnDate || item.endDate;
            const untilReturn = A.daysUntil(returnDate);
            const untilStart = A.daysUntil(item.startDate);
            if (untilStart > 7 || untilReturn > 7) return;
            const employee = employeeNames.get(String(item.employeeId)) || "Funcionario";
            attention.push({
                severity: untilReturn < 0 ? 0 : untilReturn === 0 ? 1 : 2,
                icon: "R",
                title: untilReturn < 0 ? `Reintegro pendiente · ${employee}` : `Reintegro de ${employee}`,
                detail: untilReturn < 0
                    ? `Debía presentarse hace ${Math.abs(untilReturn)} día(s)`
                    : untilReturn === 0
                        ? "Debe presentarse hoy"
                        : `Se presenta en ${untilReturn} día(s)`,
                href: "rrhh.html",
                className: untilReturn < 0 ? "critical" : "warning"
            });
        });

        const today = A.localDate();
        if (!data.health.some(item => item.date === today)) {
            attention.push({
                severity: 3,
                icon: "+",
                title: "Registro de salud pendiente",
                detail: "Peso, sueño, agua y entrenamiento de hoy todavía no están medidos.",
                href: "health.html",
                className: ""
            });
        }

        const pendingHabits = data.habits.filter(item => !(Array.isArray(item.history) && item.history.includes(today)));
        if (pendingHabits.length) {
            attention.push({
                severity: 3,
                icon: "H",
                title: `${pendingHabits.length} hábito(s) pendiente(s) hoy`,
                detail: "Marcá lo que ya cumpliste para mantener tus rachas reales.",
                href: "personal.html",
                className: ""
            });
        }

        return attention.sort((a, b) => a.severity - b.severity).slice(0, 7);
    }

    function renderAttention(data) {
        const attention = getAttention(data);
        attentionBadge.textContent = `${attention.length} ${attention.length === 1 ? "alerta" : "alertas"}`;
        attentionBadge.className = `status-badge ${attention.some(item => item.severity === 0) ? "tag-danger" : attention.length ? "tag-warning" : "tag-success"}`;
        headline.textContent = attention.length
            ? `${attention.length} asunto(s) requieren atención. Empezá por el primero.`
            : "Todo está bajo control. Elegí el siguiente avance importante.";

        if (!attention.length) {
            attentionList.innerHTML = '<div class="empty-state">No hay vencimientos ni alertas inmediatas.</div>';
            return;
        }

        attentionList.innerHTML = attention.map(item => `
            <a class="attention-item ${item.className}" href="${item.href}">
                <span class="attention-icon">${item.icon}</span>
                <span class="attention-content">
                    <strong>${A.escapeHTML(item.title)}</strong>
                    <span>${A.escapeHTML(item.detail)}</span>
                </span>
                <span class="attention-arrow">›</span>
            </a>
        `).join("");
    }

    function renderModules(data) {
        const pendingObligations = data.obligations.filter(item => A.obligationRemaining(item) > 0);
        const pendingAmount = pendingObligations.reduce((sum, item) => sum + A.obligationRemaining(item), 0);
        const pendingStudies = data.studies.filter(item => !item.completed).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
        const currentMonth = A.localDate().slice(0, 7);
        const monthWork = data.work.filter(item => String(item.date || "").slice(0, 7) === currentMonth);
        const workNet = monthWork.reduce((sum, item) => {
            const gross = Number(item.gross ?? Number(item.hours || 0) * Number(item.hourlyRate || item.rate || 0));
            const discount = Number(item.discountAmount ?? gross * Number(item.discount || item.discountRate || 0) / 100);
            return sum + Number(item.net ?? gross - discount);
        }, 0);
        const latestHealth = [...data.health].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
        const activeProjects = data.projects.filter(item => item.status !== "completed" && Number(item.progress || 0) < 100);
        const projectProgress = activeProjects.length
            ? Math.round(activeProjects.reduce((sum, item) => sum + Number(item.progress || 0), 0) / activeProjects.length)
            : 0;
        const today = A.localDate();
        const completedHabits = data.habits.filter(item => Array.isArray(item.history) && item.history.includes(today)).length;
        const openAbsences = data.hrAbsences.filter(item => !item.actualReturnDate && !item.cancelled);
        const activeAbsences = openAbsences.filter(item => A.daysUntil(item.startDate) <= 0 && A.daysUntil(item.endDate) >= 0);
        const nextReturn = [...openAbsences]
            .filter(item => A.daysUntil(item.returnDate || item.endDate) >= 0)
            .sort((a, b) => String(a.returnDate || a.endDate).localeCompare(String(b.returnDate || b.endDate)))[0];
        const hrNames = new Map(data.hrPeople.map(item => [String(item.id), item.fullName || item.name || "Funcionario"]));

        const cards = [
            { key: "finance", icon: "₲", label: "Finanzas", value: pendingObligations.length ? A.formatMoney(pendingAmount) : "Al día", detail: pendingObligations.length ? `${pendingObligations.length} cuenta(s) por pagar` : "Sin pagos pendientes", href: "finance.html" },
            { key: "study", icon: "E", label: "Estudios", value: pendingStudies.length ? `${pendingStudies.length} pendiente(s)` : "Agenda limpia", detail: pendingStudies[0] ? `${pendingStudies[0].title} · ${A.formatDate(pendingStudies[0].date)}` : "No hay entregas abiertas", href: "study.html" },
            { key: "work", icon: "T", label: "Trabajo", value: A.formatMoney(workNet), detail: `${monthWork.reduce((sum, item) => sum + Number(item.hours || 0), 0)} h registradas este mes`, href: "work.html" },
            { key: "rrhh", icon: "R", label: "Recursos Humanos", value: activeAbsences.length ? `${activeAbsences.length} ausencia(s)` : "Sin ausencias", detail: nextReturn ? `Próximo reintegro: ${hrNames.get(String(nextReturn.employeeId)) || "Funcionario"} · ${A.formatDate(nextReturn.returnDate || nextReturn.endDate)}` : `${data.hrPeople.length} funcionario(s) registrados`, href: "rrhh.html" },
            { key: "health", icon: "+", label: "Salud", value: latestHealth?.weight ? `${latestHealth.weight} kg` : "Sin registro", detail: latestHealth ? `${latestHealth.sleep || 0} h sueño · ${latestHealth.water || 0} L agua` : "Medí tu punto de partida", href: "health.html" },
            { key: "projects", icon: "P", label: "Proyectos", value: activeProjects.length ? `${activeProjects.length} activo(s)` : "Sin activos", detail: activeProjects.length ? `${projectProgress}% de avance promedio` : "Creá el próximo proyecto", href: "projects.html" },
            { key: "personal", icon: "H", label: "Personal", value: data.habits.length ? `${completedHabits}/${data.habits.length} hoy` : "Sin hábitos", detail: data.habits.length ? `${Math.round(completedHabits / data.habits.length * 100)}% completado` : "Definí tu sistema diario", href: "personal.html" }
        ];

        moduleOverview.innerHTML = cards.map(card => `
            <a class="module-card" data-module="${card.key}" href="${card.href}">
                <span class="module-card-icon">${card.icon}</span>
                <span class="module-card-copy">
                    <span>${card.label}</span>
                    <strong>${A.escapeHTML(card.value)}</strong>
                    <small>${A.escapeHTML(card.detail)}</small>
                </span>
                <span class="module-card-arrow">›</span>
            </a>
        `).join("");
    }

    function renderDaily(data) {
        const today = A.localDate();
        const todayTasks = tasks.filter(item => item.dueDate === today || (!item.dueDate && item.completedAt?.slice(0, 10) === today));
        const doneTasks = todayTasks.filter(item => item.completed).length;
        const doneHabits = data.habits.filter(item => Array.isArray(item.history) && item.history.includes(today)).length;
        const hasHealth = data.health.some(item => item.date === today);
        const hasWork = data.work.some(item => item.date === today);

        const measures = [
            { label: "Tareas previstas", done: doneTasks, total: todayTasks.length, active: todayTasks.length > 0 },
            { label: "Hábitos diarios", done: doneHabits, total: data.habits.length, active: data.habits.length > 0 },
            { label: "Registro de salud", done: hasHealth ? 1 : 0, total: 1, active: true },
            { label: "Jornada de trabajo", done: hasWork ? 1 : 0, total: 1, active: new Date().getDay() !== 0 || hasWork }
        ];
        const active = measures.filter(item => item.active);
        const total = active.reduce((sum, item) => sum + item.total, 0);
        const done = active.reduce((sum, item) => sum + item.done, 0);
        const score = total ? Math.round(done / total * 100) : 0;

        dailyScore.textContent = `${score}%`;
        dailyScoreBar.style.width = `${score}%`;
        dailyScoreCaption.textContent = total ? `${done} de ${total} controles completados.` : "Todavía no hay mediciones de hoy.";
        dailyChecklist.innerHTML = measures.map(item => `
            <div class="daily-row ${item.done >= item.total && item.active ? "done" : ""}">
                <span>${item.label}</span>
                <strong>${item.active ? `${item.done}/${item.total}` : "No configurado"}</strong>
            </div>
        `).join("");
    }

    function renderTasks() {
        const today = A.localDate();
        let filtered = [...tasks];
        if (taskFilter === "pending") filtered = filtered.filter(item => !item.completed);
        if (taskFilter === "today") filtered = filtered.filter(item => item.dueDate === today);
        if (taskFilter === "completed") filtered = filtered.filter(item => item.completed);
        filtered.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
            return String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"));
        });

        if (!filtered.length) {
            taskList.innerHTML = '<div class="empty-state">No hay tareas en esta vista.</div>';
            return;
        }

        taskList.innerHTML = filtered.map(item => `
            <article class="task-item ${item.completed ? "completed" : ""}">
                <input data-action="toggle" data-id="${item.id}" type="checkbox" ${item.completed ? "checked" : ""} aria-label="Marcar tarea">
                <div class="task-copy">
                    <strong>${A.escapeHTML(item.text)}</strong>
                    <small>
                        <span>${categoryLabels[item.category]}</span>
                        ${item.priority === "high" ? '<span class="tag tag-danger">Alta</span>' : ""}
                        ${item.dueDate ? `<span>${A.formatDate(item.dueDate)}</span>` : ""}
                    </small>
                </div>
                <button class="task-delete" data-action="delete" data-id="${item.id}" type="button" aria-label="Eliminar">×</button>
            </article>
        `).join("");
    }

    function renderRecent(data) {
        const events = [];
        data.transactions.forEach(item => events.push({ date: item.createdAt, title: item.description, detail: `${item.type === "income" ? "+" : "−"} ${A.formatMoney(item.amount)}` }));
        data.studies.filter(item => item.completed).forEach(item => events.push({ date: item.completedAt || item.completedDate || item.date, title: item.title, detail: "Actividad académica completada" }));
        data.health.forEach(item => events.push({ date: item.date, title: "Registro de salud", detail: `${item.weight || "—"} kg · ${item.sleep || "—"} h de sueño` }));
        data.work.forEach(item => events.push({ date: item.date, title: item.description || item.client || "Jornada registrada", detail: `${item.hours || 0} h trabajadas` }));
        const employeeNames = new Map(data.hrPeople.map(item => [String(item.id), item.fullName || item.name || "Funcionario"]));
        data.hrAbsences.forEach(item => events.push({ date: item.createdAt || item.startDate, title: employeeNames.get(String(item.employeeId)) || "Funcionario", detail: `Ausencia registrada · ${item.type || "otro"}` }));
        events.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

        if (!events.length) {
            recentActivity.innerHTML = '<div class="empty-state">La actividad aparecerá a medida que uses el sistema.</div>';
            return;
        }

        recentActivity.innerHTML = events.slice(0, 5).map(item => `
            <div class="activity-item">
                <span class="activity-dot"></span>
                <div><strong>${A.escapeHTML(item.title || "Actividad")}</strong><span>${A.escapeHTML(item.detail)} · ${A.formatDate(String(item.date || "").slice(0, 10))}</span></div>
            </div>
        `).join("");
    }

    function renderAll() {
        tasks = normalizeTasks(A.loadTasks());
        const data = getData();
        setGreeting();
        renderAttention(data);
        renderModules(data);
        renderDaily(data);
        renderTasks();
        renderRecent(data);
        A.updateNavCounts();
    }

    taskForm.addEventListener("submit", event => {
        event.preventDefault();
        const text = document.querySelector("#taskText").value.trim();
        if (!text) return;
        tasks.push({
            id: A.createId(),
            text,
            category: document.querySelector("#taskCategory").value,
            priority: document.querySelector("#taskPriority").value,
            dueDate: document.querySelector("#taskDueDate").value,
            completed: false,
            completedAt: "",
            createdAt: new Date().toISOString()
        });
        saveTasks();
        taskForm.reset();
        taskDialog.close();
        renderAll();
        A.notify("Tarea agregada.");
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
        if (!button) return;
        if (!confirm("¿Eliminar esta tarea?")) return;
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

    document.querySelector("#openTaskDialog").addEventListener("click", () => {
        document.querySelector("#taskDueDate").value = A.localDate();
        taskDialog.showModal();
        document.querySelector("#taskText").focus();
    });

    document.querySelector("#openBackupDialog").addEventListener("click", () => backupDialog.showModal());
    document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => {
        document.querySelector(`#${button.dataset.closeDialog}`)?.close();
    }));

    quickNotes.value = A.readJSON("atlasQuickNotes", "") || "";
    quickNotes.addEventListener("input", () => {
        notesStatus.textContent = "Guardando…";
        clearTimeout(notesTimer);
        notesTimer = setTimeout(() => {
            A.writeJSON("atlasQuickNotes", quickNotes.value);
            notesStatus.textContent = "Guardado";
        }, 350);
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
            const tx = db.transaction("paymentReceipts", "readonly");
            const request = tx.objectStore("paymentReceipts").getAll();
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
        backupStatus.textContent = "Preparando la copia completa…";
        try {
            const receipts = await exportReceipts();
            const backup = {
                version: 4,
                exportedAt: new Date().toISOString(),
                data: {
                    tasks: A.loadTasks(),
                    notes: quickNotes.value,
                    transactions: A.readArray("atlasTransactions"),
                    obligations: A.readArray("atlasObligations"),
                    studyEvents: A.readArray("atlasStudyEvents"),
                    healthRecords: A.readArray("atlasHealthRecords"),
                    projects: A.readArray("atlasProjects"),
                    workRecords: A.readArray("atlasWorkRecords"),
                    hrPeople: A.readArray("atlasHRPeople"),
                    hrAbsences: A.readArray("atlasHRAbsences"),
                    habits: A.readArray("atlasHabits"),
                    workSettings: A.readJSON("atlasWorkSettings", {}),
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
            backupStatus.textContent = `Copia exportada con ${receipts.length} comprobante(s).`;
        } catch (error) {
            console.error(error);
            backupStatus.textContent = "No se pudo completar la exportación.";
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
            const tx = db.transaction("paymentReceipts", "readwrite");
            const store = tx.objectStore("paymentReceipts");
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
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }

    async function importBackup(file) {
        if (!file) return;
        if (!confirm("La restauración reemplazará los datos actuales. ¿Continuar?")) return;
        backupStatus.textContent = "Restaurando información…";
        try {
            const parsed = JSON.parse(await file.text());
            const data = parsed.data || parsed;
            const mapping = {
                tasks: "atlasTasks",
                transactions: "atlasTransactions",
                obligations: "atlasObligations",
                studyEvents: "atlasStudyEvents",
                healthRecords: "atlasHealthRecords",
                projects: "atlasProjects",
                workRecords: "atlasWorkRecords",
                hrPeople: "atlasHRPeople",
                hrAbsences: "atlasHRAbsences",
                habits: "atlasHabits"
            };
            Object.entries(mapping).forEach(([property, key]) => {
                if (Array.isArray(data[property])) A.writeJSON(key, data[property]);
            });
            if (typeof data.notes === "string") A.writeJSON("atlasQuickNotes", data.notes);
            if (data.workSettings && typeof data.workSettings === "object") {
                A.writeJSON("atlasWorkSettings", data.workSettings);
            }
            await restoreReceipts(data.receipts);
            quickNotes.value = A.readJSON("atlasQuickNotes", "") || "";
            backupStatus.textContent = "Copia restaurada correctamente.";
            renderAll();
            A.notify("Todos los módulos fueron restaurados.");
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

    window.addEventListener("pageshow", renderAll);
    window.addEventListener("focus", renderAll);
    window.addEventListener("atlas:data-changed", renderAll);
    renderAll();
})();
