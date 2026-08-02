(function () {
    const A = window.Atlas;
    const KEY = "atlasProjects";
    const areaLabels = { technology: "Tecnología", home: "Casa / Taller", work: "Trabajo", study: "Estudios", finance: "Finanzas", personal: "Personal" };
    let projects = A.readArray(KEY).map(normalizeProject);
    let filter = "active";
    let search = "";
    let writingProjects = false;

    const dialog = document.querySelector("#projectDialog");
    const form = document.querySelector("#projectForm");
    const board = document.querySelector("#projectBoard");
    const progressInput = document.querySelector("#projectProgress");

    function normalizeProject(item) {
        const progress = Math.max(0, Math.min(100, Number(item.progress || (item.completed ? 100 : 0))));
        return {
            ...item,
            id: item.id || A.createId(),
            name: item.name || item.title || "Proyecto",
            area: item.area || item.category || "personal",
            nextAction: item.nextAction || item.nextStep || "Definir la siguiente acción",
            deadline: item.deadline || item.dueDate || "",
            progress,
            status: item.status || (item.completed || progress === 100 ? "completed" : "active"),
            notes: item.notes || ""
        };
    }

    function save() {
        writingProjects = true;
        try {
            A.writeJSON(KEY, projects);
        } finally {
            writingProjects = false;
        }
    }

    function reload() {
        projects = A.readArray(KEY).map(normalizeProject);
        render();
    }

    function statusInfo(item) {
        const days = A.daysUntil(item.deadline);
        if (item.status === "completed" || item.progress >= 100) return { label: "Completado", className: "tag-success" };
        if (item.status === "paused") return { label: "Pausado", className: "" };
        if (days < 0) return { label: "Vencido", className: "tag-danger" };
        if (days <= 7) return { label: days === 0 ? "Vence hoy" : `Faltan ${days} días`, className: "tag-warning" };
        return { label: "Activo", className: "tag-info" };
    }

    function render() {
        const active = projects.filter(item => item.status !== "completed" && item.progress < 100);
        const overdue = active.filter(item => A.daysUntil(item.deadline) < 0);
        const completed = projects.filter(item => item.status === "completed" || item.progress >= 100);
        const average = active.length ? Math.round(active.reduce((sum, item) => sum + item.progress, 0) / active.length) : 0;
        document.querySelector("#activeProjectCount").textContent = active.length;
        document.querySelector("#overdueProjectCount").textContent = overdue.length;
        document.querySelector("#averageProjectProgress").textContent = `${average}%`;
        document.querySelector("#completedProjectCount").textContent = completed.length;
        document.querySelector("#projectCountCaption").textContent = `${projects.length} proyecto(s) en total`;

        let visible = projects.filter(item => {
            const complete = item.status === "completed" || item.progress >= 100;
            if (filter === "active" && complete) return false;
            if (filter === "completed" && !complete) return false;
            if (filter === "attention" && !(item.status !== "completed" && (A.daysUntil(item.deadline) <= 7 || item.status === "paused"))) return false;
            return `${item.name} ${item.nextAction} ${areaLabels[item.area] || item.area}`.toLowerCase().includes(search);
        });
        visible.sort((a, b) => {
            const aComplete = a.status === "completed" || a.progress >= 100;
            const bComplete = b.status === "completed" || b.progress >= 100;
            if (aComplete !== bComplete) return aComplete ? 1 : -1;
            return String(a.deadline || "9999").localeCompare(String(b.deadline || "9999"));
        });
        document.querySelector("#projectListCaption").textContent = `${visible.length} proyecto(s) visibles`;

        if (!visible.length) {
            board.innerHTML = '<div class="empty-state span-12">No hay proyectos en esta vista.</div>';
        } else {
            board.innerHTML = visible.map(item => {
                const status = statusInfo(item);
                const complete = item.status === "completed" || item.progress >= 100;
                const overdueClass = A.daysUntil(item.deadline) < 0 && !complete ? "overdue" : "";
                return `<article class="project-card ${overdueClass} ${complete ? "completed" : ""}">
                    <div class="project-top"><div><h3>${A.escapeHTML(item.name)}</h3><p>${A.escapeHTML(areaLabels[item.area] || item.area)}${item.deadline ? ` · ${A.formatDate(item.deadline)}` : ""}</p></div><span class="tag ${status.className}">${status.label}</span></div>
                    <div class="project-progress-row"><span>Avance</span><strong>${item.progress}%</strong></div>
                    <div class="progress-track"><div class="progress-bar" style="width:${item.progress}%"></div></div>
                    <div class="project-next"><strong>Siguiente acción</strong>${A.escapeHTML(item.nextAction)}</div>
                    <div class="project-actions">${!complete ? `<button class="small-button" data-action="advance" data-id="${A.escapeHTML(String(item.id))}" type="button">＋10%</button><button class="small-button" data-action="complete" data-id="${A.escapeHTML(String(item.id))}" type="button">Completar</button>` : `<button class="small-button" data-action="reopen" data-id="${A.escapeHTML(String(item.id))}" type="button">Reabrir</button>`}<button class="small-button" data-action="edit" data-id="${A.escapeHTML(String(item.id))}" type="button">Editar</button><button class="danger-button" data-action="delete" data-id="${A.escapeHTML(String(item.id))}" type="button">Eliminar</button></div>
                </article>`;
            }).join("");
        }
        A.updateNavCounts();
    }

    function resetForm() {
        form.reset();
        document.querySelector("#projectId").value = "";
        progressInput.value = 0;
        document.querySelector("#projectProgressValue").textContent = "0%";
        document.querySelector("#projectDialogTitle").textContent = "Nuevo proyecto";
    }

    function openProject(item) {
        resetForm();
        if (item) {
            document.querySelector("#projectId").value = item.id;
            document.querySelector("#projectName").value = item.name;
            document.querySelector("#projectArea").value = item.area;
            document.querySelector("#projectNextAction").value = item.nextAction;
            document.querySelector("#projectDeadline").value = item.deadline;
            progressInput.value = item.progress;
            document.querySelector("#projectProgressValue").textContent = `${item.progress}%`;
            document.querySelector("#projectStatus").value = item.status;
            document.querySelector("#projectNotes").value = item.notes;
            document.querySelector("#projectDialogTitle").textContent = "Editar proyecto";
        }
        dialog.showModal();
        document.querySelector("#projectName").focus();
    }

    progressInput.addEventListener("input", () => document.querySelector("#projectProgressValue").textContent = `${progressInput.value}%`);
    document.querySelector("#openProjectDialog").addEventListener("click", () => openProject());
    document.querySelector("#closeProjectDialog").addEventListener("click", () => dialog.close());
    document.querySelector("#cancelProjectDialog").addEventListener("click", () => dialog.close());

    form.addEventListener("submit", event => {
        event.preventDefault();
        const id = document.querySelector("#projectId").value;
        let progress = Number(progressInput.value);
        let status = document.querySelector("#projectStatus").value;
        const name = document.querySelector("#projectName").value.trim();
        const nextAction = document.querySelector("#projectNextAction").value.trim();
        const deadline = document.querySelector("#projectDeadline").value;
        if (!name || !nextAction || !deadline) {
            A.notify("Completá nombre, próxima acción y fecha objetivo.", "error");
            return;
        }
        if (status === "completed") progress = 100;
        if (progress === 100) status = "completed";
        const project = normalizeProject({
            id: id || A.createId(), name,
            area: document.querySelector("#projectArea").value, nextAction,
            deadline, progress, status,
            notes: document.querySelector("#projectNotes").value.trim(),
            completedAt: status === "completed" ? (projects.find(item => String(item.id) === String(id))?.completedAt || new Date().toISOString()) : "",
            updatedAt: new Date().toISOString()
        });
        const index = projects.findIndex(item => String(item.id) === String(id));
        if (index >= 0) projects[index] = { ...projects[index], ...project };
        else projects.push(project);
        save();
        dialog.close();
        render();
        A.notify(index >= 0 ? "Proyecto actualizado." : "Proyecto creado.");
    });

    board.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const item = projects.find(project => String(project.id) === button.dataset.id);
        if (!item) return;
        const action = button.dataset.action;
        if (action === "edit") return openProject(item);
        if (action === "delete") {
            if (!confirm(`¿Eliminar “${item.name}”?`)) return;
            projects = projects.filter(project => project !== item);
        }
        if (action === "advance") {
            item.progress = Math.min(100, item.progress + 10);
            if (item.progress === 100) item.completedAt = new Date().toISOString();
        }
        if (action === "complete") { item.progress = 100; item.status = "completed"; item.completedAt = new Date().toISOString(); }
        if (action === "reopen") { item.progress = Math.min(90, item.progress); item.status = "active"; item.completedAt = ""; }
        if (item.progress === 100) item.status = "completed";
        save();
        render();
    });

    document.querySelector("#projectSearch").addEventListener("input", event => { search = event.target.value.trim().toLowerCase(); render(); });
    document.querySelector("#projectStatusFilter").addEventListener("change", event => { filter = event.target.value; render(); });
    render();
    window.addEventListener("atlas:data-changed", event => {
        if (!writingProjects && event.detail?.key === KEY) reload();
    });
    window.addEventListener("storage", event => {
        if (A.storageKeyMatches(event.key, KEY)) reload();
    });
    window.addEventListener("pageshow", reload);
    window.addEventListener("focus", reload);
})();
