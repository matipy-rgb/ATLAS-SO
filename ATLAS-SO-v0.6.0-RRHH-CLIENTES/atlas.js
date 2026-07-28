(function () {
    const pageMap = {
        dashboard: { label: "Mi día", href: "app.html", icon: "⌂" },
        finance: { label: "Finanzas", href: "finance.html", icon: "₲" },
        study: { label: "Estudios", href: "study.html", icon: "▣" },
        health: { label: "Salud", href: "health.html", icon: "+" },
        projects: { label: "Proyectos", href: "projects.html", icon: "◆" },
        personal: { label: "Hábitos", href: "personal.html", icon: "○" },
        work: { label: "Trabajo", href: "work.html", icon: "▤" },
        rrhh: { label: "RRHH", href: "rrhh.html", icon: "R" }
    };

    function readJSON(key, fallback) {
        return window.AtlasStore?.read(key, fallback) ?? fallback;
    }

    function readArray(key) {
        const value = readJSON(key, []);
        return Array.isArray(value) ? value : [];
    }

    function writeJSON(key, value) {
        window.AtlasStore?.write(key, value);
        window.dispatchEvent(new CustomEvent("atlas:data-changed", { detail: { key } }));
    }

    function localDate(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function parseDate(value) {
        if (!value) return null;
        const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
        if (!year || !month || !day) return null;
        return new Date(year, month - 1, day);
    }

    function daysUntil(value) {
        const date = parseDate(value);
        if (!date) return Number.POSITIVE_INFINITY;
        const today = parseDate(localDate());
        return Math.round((date - today) / 86400000);
    }

    function formatDate(value, options) {
        const date = parseDate(value);
        if (!date) return "Sin fecha";
        return new Intl.DateTimeFormat("es-PY", options || {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    function formatMoney(value) {
        return new Intl.NumberFormat("es-PY", {
            style: "currency",
            currency: "PYG",
            maximumFractionDigits: 0
        }).format(Number(value || 0));
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function createId() {
        return Date.now() + Math.floor(Math.random() * 1000);
    }

    function notify(message, type = "success") {
        let stack = document.querySelector(".toast-stack");
        if (!stack) {
            stack = document.createElement("div");
            stack.className = "toast-stack";
            stack.setAttribute("aria-live", "polite");
            document.body.appendChild(stack);
        }

        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        stack.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }

    function obligationRemaining(item) {
        const payments = Array.isArray(item.payments) ? item.payments : [];
        const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) || Number(item.paidAmount || 0);
        return Math.max(0, Number(item.amount || 0) - paid);
    }

    function loadTasks() {
        const modern = readArray("atlasTasks");
        if (modern.length || window.AtlasStore?.has("atlasTasks")) return modern;
        const legacy = readArray("tasks");
        if (legacy.length) {
            writeJSON("atlasTasks", legacy);
        }
        return legacy;
    }

    function getCounts() {
        const today = localDate();
        const obligations = readArray("atlasObligations");
        const studies = readArray("atlasStudyEvents");
        const work = readArray("atlasWorkRecords");
        const hrAbsences = readArray("atlasHRAbsences");
        const health = readArray("atlasHealthRecords");
        const projects = readArray("atlasProjects");
        const habits = readArray("atlasHabits");
        const tasks = loadTasks();

        return {
            finance: obligations.filter(item => obligationRemaining(item) > 0).length,
            study: studies.filter(item => !item.completed).length,
            work: work.filter(item => String(item.date || "").slice(0, 7) === today.slice(0, 7)).length,
            rrhh: hrAbsences.filter(item => {
                if (item.actualReturnDate || item.cancelled) return false;
                const start = daysUntil(item.startDate);
                const end = daysUntil(item.returnDate || item.endDate);
                return start <= 0 && end >= 0;
            }).length,
            health: health.some(item => item.date === today) ? 0 : 1,
            projects: projects.filter(item => item.status !== "completed" && Number(item.progress || 0) < 100).length,
            personal: habits.filter(item => !(Array.isArray(item.history) && item.history.includes(today))).length,
            tasks: tasks.filter(item => !item.completed).length
        };
    }

    function captureDialogMarkup() {
        return `
            <dialog id="atlasCaptureDialog" class="atlas-capture-dialog">
                <form id="atlasCaptureForm">
                    <div class="dialog-heading">
                        <div>
                            <p class="section-kicker">REGISTRO RÁPIDO</p>
                            <h2>¿Qué querés guardar?</h2>
                            <p>Elegí un tipo y completá solo lo necesario.</p>
                        </div>
                        <button class="icon-button" data-atlas-close="atlasCaptureDialog" type="button" aria-label="Cerrar">×</button>
                    </div>

                    <div class="capture-type-grid" role="group" aria-label="Tipo de registro">
                        <button class="active" data-capture-type="task" type="button"><span>✓</span>Tarea</button>
                        <button data-capture-type="expense" type="button"><span>₲</span>Dinero</button>
                        <button data-capture-type="study" type="button"><span>▣</span>Estudio</button>
                        <button data-capture-type="health" type="button"><span>＋</span>Salud</button>
                        <button data-capture-type="note" type="button"><span>✎</span>Nota</button>
                    </div>
                    <input id="atlasCaptureType" type="hidden" value="task">

                    <div class="capture-fields" data-capture-panel="task">
                        <label class="field">
                            <span>¿Qué tenés que hacer?</span>
                            <input id="captureTaskText" type="text" maxlength="140" placeholder="Ej: llamar al proveedor">
                        </label>
                        <div class="form-grid">
                            <label class="field span-4"><span>Área</span><select id="captureTaskArea"><option value="personal">Personal</option><option value="finance">Finanzas</option><option value="study">Estudios</option><option value="health">Salud</option><option value="projects">Proyectos</option><option value="work">Trabajo</option></select></label>
                            <label class="field span-4"><span>Fecha</span><input id="captureTaskDate" type="date"></label>
                            <label class="field span-4"><span>Prioridad</span><select id="captureTaskPriority"><option value="normal">Normal</option><option value="high">Alta</option></select></label>
                        </div>
                    </div>

                    <div class="capture-fields" data-capture-panel="expense" hidden>
                        <div class="form-grid">
                            <label class="field span-4"><span>Tipo</span><select id="captureMoneyType"><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label>
                            <label class="field span-8"><span>Descripción</span><input id="captureMoneyDescription" type="text" maxlength="100" placeholder="Ej: supermercado"></label>
                            <label class="field span-12"><span>Monto (Gs.)</span><input id="captureMoneyAmount" type="number" min="1" step="1" inputmode="numeric" placeholder="0"></label>
                        </div>
                    </div>

                    <div class="capture-fields" data-capture-panel="study" hidden>
                        <div class="form-grid">
                            <label class="field span-5"><span>Materia</span><input id="captureStudySubject" type="text" maxlength="90" placeholder="Ej: Contabilidad"></label>
                            <label class="field span-7"><span>Actividad</span><input id="captureStudyTitle" type="text" maxlength="120" placeholder="Ej: examen final"></label>
                            <label class="field span-6"><span>Fecha</span><input id="captureStudyDate" type="date"></label>
                            <label class="field span-6"><span>Tipo</span><select id="captureStudyType"><option value="assignment">Trabajo / Entrega</option><option value="exam">Examen</option><option value="presentation">Exposición</option><option value="class">Clase</option><option value="other">Otro</option></select></label>
                        </div>
                    </div>

                    <div class="capture-fields" data-capture-panel="health" hidden>
                        <div class="form-grid">
                            <label class="field span-4"><span>Agua (litros)</span><input id="captureHealthWater" type="number" min="0" max="12" step=".25" placeholder="2"></label>
                            <label class="field span-4"><span>Sueño (horas)</span><input id="captureHealthSleep" type="number" min="0" max="24" step=".5" placeholder="8"></label>
                            <label class="field span-4"><span>Energía</span><select id="captureHealthEnergy"><option value="">Sin medir</option><option value="1">1 · Muy baja</option><option value="2">2 · Baja</option><option value="3">3 · Normal</option><option value="4">4 · Buena</option><option value="5">5 · Excelente</option></select></label>
                            <label class="span-12 checkbox-card"><input id="captureHealthWorkout" type="checkbox"> Entrené hoy</label>
                        </div>
                    </div>

                    <div class="capture-fields" data-capture-panel="note" hidden>
                        <label class="field">
                            <span>Escribí antes de que se te escape</span>
                            <textarea id="captureNoteText" rows="5" maxlength="800" placeholder="Idea, dato, recordatorio…"></textarea>
                        </label>
                    </div>

                    <p id="captureError" class="capture-error" role="alert"></p>
                    <div class="dialog-actions">
                        <button class="secondary-button" data-atlas-close="atlasCaptureDialog" type="button">Cancelar</button>
                        <button class="primary-button" type="submit">Guardar</button>
                    </div>
                </form>
            </dialog>
        `;
    }

    function searchDialogMarkup() {
        return `
            <dialog id="atlasSearchDialog" class="atlas-search-dialog">
                <div class="search-dialog-inner">
                    <div class="global-search-box">
                        <span aria-hidden="true">⌕</span>
                        <input id="atlasSearchInput" type="search" autocomplete="off" placeholder="Buscá una tarea, deuda, materia o proyecto…" aria-label="Buscar en ATLAS SO">
                        <kbd>ESC</kbd>
                    </div>
                    <div id="atlasSearchResults" class="global-search-results"></div>
                    <div class="search-dialog-footer">
                        <span>Buscá en todo tu espacio</span>
                        <button data-atlas-close="atlasSearchDialog" type="button">Cerrar</button>
                    </div>
                </div>
            </dialog>
        `;
    }

    function getSearchItems() {
        const items = Object.entries(pageMap)
            .filter(([key]) => key !== "rrhh" || window.ATLAS_IS_HR_ADMIN)
            .map(([key, page]) => ({
                type: "Área",
                icon: page.icon,
                title: page.label,
                detail: key === "dashboard" ? "Tu panorama de hoy" : `Abrir ${page.label}`,
                href: page.href
            }));

        loadTasks().forEach(item => items.push({
            type: "Tarea",
            icon: "✓",
            title: item.text || item.title || "Tarea",
            detail: item.completed ? "Completada" : (item.dueDate ? formatDate(item.dueDate) : "Pendiente"),
            href: "app.html#tasks"
        }));

        readArray("atlasObligations").forEach(item => items.push({
            type: "Finanzas",
            icon: "₲",
            title: item.name || "Cuenta por pagar",
            detail: `${formatMoney(obligationRemaining(item))} pendiente`,
            href: "finance.html"
        }));

        readArray("atlasStudyEvents").forEach(item => items.push({
            type: "Estudios",
            icon: "▣",
            title: item.title || "Actividad",
            detail: `${item.subject || "Sin materia"} · ${item.date ? formatDate(item.date) : "Sin fecha"}`,
            href: "study.html"
        }));

        readArray("atlasProjects").forEach(item => items.push({
            type: "Proyecto",
            icon: "◆",
            title: item.name || item.title || "Proyecto",
            detail: item.nextAction || `${Number(item.progress || 0)}% avanzado`,
            href: "projects.html"
        }));

        readArray("atlasHabits").forEach(item => items.push({
            type: "Hábito",
            icon: "○",
            title: item.name || "Hábito",
            detail: "Ver constancia",
            href: "personal.html"
        }));

        return items;
    }

    function renderSearchResults(query = "") {
        const target = document.querySelector("#atlasSearchResults");
        if (!target) return;
        const normalized = String(query).trim().toLowerCase();
        const items = getSearchItems().filter(item => {
            if (!normalized) return item.type === "Área";
            return `${item.type} ${item.title} ${item.detail}`.toLowerCase().includes(normalized);
        }).slice(0, 12);

        target.innerHTML = items.length ? items.map(item => `
            <a class="global-search-result" href="${item.href}">
                <span class="search-result-icon">${escapeHTML(item.icon)}</span>
                <span class="search-result-copy">
                    <small>${escapeHTML(item.type)}</small>
                    <strong>${escapeHTML(item.title)}</strong>
                    <span>${escapeHTML(item.detail)}</span>
                </span>
                <b>→</b>
            </a>
        `).join("") : `
            <div class="search-empty">
                <strong>No encontramos eso.</strong>
                <span>Probá con otra palabra o registralo con el botón “Nuevo”.</span>
            </div>
        `;
    }

    function setCaptureType(type) {
        const allowed = new Set(["task", "expense", "study", "health", "note"]);
        const selected = allowed.has(type) ? type : "task";
        const input = document.querySelector("#atlasCaptureType");
        if (input) input.value = selected;
        document.querySelectorAll("[data-capture-type]").forEach(button => {
            button.classList.toggle("active", button.dataset.captureType === selected);
        });
        document.querySelectorAll("[data-capture-panel]").forEach(panel => {
            panel.hidden = panel.dataset.capturePanel !== selected;
        });
        const error = document.querySelector("#captureError");
        if (error) error.textContent = "";
        const first = document.querySelector(`[data-capture-panel="${selected}"] input:not([type="hidden"]), [data-capture-panel="${selected}"] textarea`);
        window.setTimeout(() => first?.focus(), 80);
    }

    function openCapture(type = "task") {
        const dialog = document.querySelector("#atlasCaptureDialog");
        if (!dialog) return;
        setCaptureType(type);
        const today = localDate();
        const taskDate = document.querySelector("#captureTaskDate");
        const studyDate = document.querySelector("#captureStudyDate");
        if (taskDate && !taskDate.value) taskDate.value = today;
        if (studyDate && !studyDate.value) studyDate.value = today;
        dialog.showModal();
    }

    function saveCapture(event) {
        event.preventDefault();
        const type = document.querySelector("#atlasCaptureType")?.value || "task";
        const errorNode = document.querySelector("#captureError");
        const fail = message => {
            if (errorNode) errorNode.textContent = message;
            return false;
        };
        const now = new Date().toISOString();

        if (type === "task") {
            const text = document.querySelector("#captureTaskText").value.trim();
            if (!text) return fail("Escribí la tarea antes de guardar.");
            const items = loadTasks();
            items.push({
                id: createId(),
                text,
                category: document.querySelector("#captureTaskArea").value,
                priority: document.querySelector("#captureTaskPriority").value,
                dueDate: document.querySelector("#captureTaskDate").value,
                completed: false,
                createdAt: now
            });
            writeJSON("atlasTasks", items);
            notify("Tarea guardada.");
        }

        if (type === "expense") {
            const description = document.querySelector("#captureMoneyDescription").value.trim();
            const amount = Math.round(Number(document.querySelector("#captureMoneyAmount").value));
            if (!description || !Number.isFinite(amount) || amount <= 0) return fail("Completá una descripción y un monto válido.");
            const items = readArray("atlasTransactions");
            items.push({
                id: createId(),
                description,
                amount,
                type: document.querySelector("#captureMoneyType").value,
                createdAt: now
            });
            writeJSON("atlasTransactions", items);
            notify("Movimiento guardado.");
        }

        if (type === "study") {
            const subject = document.querySelector("#captureStudySubject").value.trim();
            const title = document.querySelector("#captureStudyTitle").value.trim();
            const date = document.querySelector("#captureStudyDate").value;
            if (!subject || !title || !date) return fail("Completá materia, actividad y fecha.");
            const items = readArray("atlasStudyEvents");
            items.push({
                id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
                institution: "Personal",
                subject,
                title,
                date,
                time: "",
                type: document.querySelector("#captureStudyType").value,
                priority: "normal",
                progress: 0,
                completed: false,
                notes: "",
                createdAt: now,
                updatedAt: now
            });
            writeJSON("atlasStudyEvents", items);
            notify("Actividad de estudio guardada.");
        }

        if (type === "health") {
            const water = Number(document.querySelector("#captureHealthWater").value) || null;
            const sleep = Number(document.querySelector("#captureHealthSleep").value) || null;
            const energy = Number(document.querySelector("#captureHealthEnergy").value) || null;
            const workout = document.querySelector("#captureHealthWorkout").checked;
            if (!water && !sleep && !energy && !workout) return fail("Registrá al menos un dato de salud.");
            const items = readArray("atlasHealthRecords");
            const today = localDate();
            const index = items.findIndex(item => item.date === today);
            const record = {
                ...(index >= 0 ? items[index] : {}),
                date: today,
                water: water ?? items[index]?.water ?? null,
                sleep: sleep ?? items[index]?.sleep ?? null,
                energy: energy ?? items[index]?.energy ?? null,
                workout: workout || Boolean(items[index]?.workout),
                updatedAt: now
            };
            if (index >= 0) items[index] = record;
            else items.push(record);
            writeJSON("atlasHealthRecords", items);
            notify("Salud de hoy actualizada.");
        }

        if (type === "note") {
            const note = document.querySelector("#captureNoteText").value.trim();
            if (!note) return fail("Escribí la nota antes de guardar.");
            const previous = String(readJSON("atlasQuickNotes", "") || "").trim();
            const stamp = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date());
            writeJSON("atlasQuickNotes", `${previous ? `${previous}\n\n` : ""}[${stamp}] ${note}`);
            notify("Nota guardada.");
        }

        event.currentTarget.reset();
        document.querySelector("#atlasCaptureDialog")?.close();
        setCaptureType("task");
        return true;
    }

    function wireGlobalTools() {
        const captureDialog = document.querySelector("#atlasCaptureDialog");
        const searchDialog = document.querySelector("#atlasSearchDialog");
        const searchInput = document.querySelector("#atlasSearchInput");

        document.addEventListener("click", event => {
            const capture = event.target.closest("[data-atlas-capture]");
            if (capture) {
                openCapture(capture.dataset.atlasCapture || "task");
                return;
            }
            const close = event.target.closest("[data-atlas-close]");
            if (close) document.getElementById(close.dataset.atlasClose)?.close();
        });

        document.querySelectorAll("[data-capture-type]").forEach(button => {
            button.addEventListener("click", () => setCaptureType(button.dataset.captureType));
        });
        document.querySelector("#atlasCaptureForm")?.addEventListener("submit", saveCapture);
        searchInput?.addEventListener("input", () => renderSearchResults(searchInput.value));

        document.querySelector("#openAtlasSearch")?.addEventListener("click", () => {
            renderSearchResults("");
            searchDialog?.showModal();
            window.setTimeout(() => searchInput?.focus(), 80);
        });
        document.querySelector("#openAtlasCapture")?.addEventListener("click", () => openCapture("task"));

        [captureDialog, searchDialog].forEach(dialog => {
            dialog?.addEventListener("click", event => {
                if (event.target === dialog) dialog.close();
            });
        });

        window.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                if (searchDialog?.open) searchDialog.close();
                if (captureDialog?.open) captureDialog.close();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                renderSearchResults("");
                searchDialog?.showModal();
                window.setTimeout(() => searchInput?.focus(), 80);
            }
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                openCapture("task");
            }
        });
    }

    function renderShell() {
        const frame = document.querySelector(".app-frame");
        const workspace = document.querySelector(".app-workspace");
        if (!frame || !workspace) return;

        const current = document.body.dataset.page || "dashboard";
        const currentPage = pageMap[current] || pageMap.dashboard;
        const user = window.AtlasAuth?.user;
        const fullName = String(user?.user_metadata?.full_name || "").trim();
        const userLabel = fullName || user?.email?.split("@")[0] || "Usuario";

        const sidebar = document.createElement("aside");
        sidebar.className = "app-sidebar";
        sidebar.setAttribute("aria-label", "Navegación principal");
        sidebar.innerHTML = `
            <a class="sidebar-brand" href="app.html" aria-label="ATLAS SO - Mi día">
                <span class="brand-mark">A</span>
                <span><strong>ATLAS SO</strong><span>Sistema personal</span></span>
            </a>
            <p class="sidebar-label">Tu espacio</p>
            <nav class="sidebar-nav">
                ${Object.entries(pageMap).filter(([key]) => key !== "rrhh" || window.ATLAS_IS_HR_ADMIN).map(([key, item]) => `
                    <a class="nav-item ${key === current ? "active" : ""}" href="${item.href}">
                        <span class="nav-icon" aria-hidden="true">${item.icon}</span>
                        <span>${item.label}</span>
                        <span class="nav-badge" data-nav-count="${key}"></span>
                    </a>
                `).join("")}
            </nav>
            <div class="sidebar-spacer"></div>
            <div class="sidebar-user-card">
                <span class="sidebar-avatar">${escapeHTML(userLabel.slice(0, 1).toUpperCase())}</span>
                <span class="sidebar-user-copy">
                    <strong>${escapeHTML(userLabel)}</strong>
                    <small>${escapeHTML(user?.email || "")}</small>
                </span>
                <button id="sidebarLogout" class="sidebar-logout" type="button" title="Cerrar sesión" aria-label="Cerrar sesión">↪</button>
            </div>
            <div class="sidebar-system-card">
                <span>Una idea simple</span>
                <strong>Lo que no se mide, no se mejora.</strong>
                <small>ATLAS SO · v0.6</small>
            </div>
        `;

        const topbar = document.createElement("header");
        topbar.className = "app-topbar";
        topbar.innerHTML = `
            <button class="icon-control mobile-menu-button" type="button" aria-label="Abrir menú">☰</button>
            <div class="topbar-page">
                <span>${currentPage.label}</span>
                <strong>${document.body.dataset.context || "Todo lo importante, en un solo lugar"}</strong>
            </div>
            <div class="topbar-right">
                <span id="syncStatus" class="sync-status" data-state="synced">Sincronizado</span>
                <button id="installAtlas" class="install-control" type="button" hidden>Instalar app</button>
                <button id="openAtlasSearch" class="topbar-search" type="button"><span>⌕</span><strong>Buscar</strong><kbd>Ctrl K</kbd></button>
                <button id="openAtlasCapture" class="topbar-new" type="button"><span>＋</span> Nuevo</button>
                <button id="openAtlasBackup" class="icon-control" type="button" title="Copia de seguridad" aria-label="Abrir copia de seguridad">↧</button>
            </div>
        `;

        frame.insertBefore(sidebar, workspace);
        workspace.insertBefore(topbar, workspace.firstChild);

        const overlay = document.createElement("button");
        overlay.className = "mobile-overlay";
        overlay.type = "button";
        overlay.setAttribute("aria-label", "Cerrar menú");
        frame.appendChild(overlay);

        const mobileNav = document.createElement("nav");
        mobileNav.className = "mobile-bottom-nav";
        mobileNav.setAttribute("aria-label", "Navegación móvil");
        mobileNav.innerHTML = `
            <a class="${current === "dashboard" ? "active" : ""}" href="app.html"><span>⌂</span>Hoy</a>
            <a class="${current === "finance" ? "active" : ""}" href="finance.html"><span>₲</span>Dinero</a>
            <button class="mobile-add-button" data-atlas-capture="task" type="button" aria-label="Registrar algo"><span>＋</span>Nuevo</button>
            <button id="mobileMore" type="button"><span>☰</span>Más</button>
        `;
        document.body.appendChild(mobileNav);
        document.body.insertAdjacentHTML("beforeend", captureDialogMarkup() + searchDialogMarkup());

        const closeMenu = () => document.body.classList.remove("sidebar-open");
        topbar.querySelector(".mobile-menu-button")?.addEventListener("click", () => {
            document.body.classList.toggle("sidebar-open");
        });
        overlay.addEventListener("click", closeMenu);
        mobileNav.querySelector("#mobileMore")?.addEventListener("click", () => {
            document.body.classList.add("sidebar-open");
        });
        sidebar.addEventListener("click", event => {
            if (event.target.closest("a")) closeMenu();
        });

        updateNavCounts();
        wireGlobalTools();

        sidebar.querySelector("#sidebarLogout")?.addEventListener("click", () => {
            window.AtlasAuth?.signOut();
        });

        const syncStatus = topbar.querySelector("#syncStatus");
        window.addEventListener("atlas:sync-status", event => {
            syncStatus.textContent = event.detail?.message || "Sincronizado";
            syncStatus.dataset.state = event.detail?.status || "synced";
        });

        let installPrompt = null;
        const installButton = topbar.querySelector("#installAtlas");
        window.addEventListener("beforeinstallprompt", event => {
            event.preventDefault();
            installPrompt = event;
            installButton.hidden = false;
        });
        installButton.addEventListener("click", async () => {
            if (!installPrompt) return;
            installPrompt.prompt();
            await installPrompt.userChoice;
            installPrompt = null;
            installButton.hidden = true;
        });

        topbar.querySelector("#openAtlasBackup")?.addEventListener("click", () => {
            if (current === "dashboard") {
                window.dispatchEvent(new CustomEvent("atlas:open-backup"));
            } else {
                window.location.href = "app.html#backup";
            }
        });

        if ("serviceWorker" in navigator && location.protocol !== "file:") {
            navigator.serviceWorker.register("sw.js").catch(error => {
                console.warn("No se registró el modo instalable:", error.message);
            });
        }
    }

    function updateNavCounts() {
        const counts = getCounts();
        document.querySelectorAll("[data-nav-count]").forEach(node => {
            const key = node.dataset.navCount;
            const count = key === "dashboard" ? counts.tasks : counts[key];
            node.textContent = count > 99 ? "99+" : String(count || "");
            node.dataset.count = String(count || 0);
        });
    }

    window.Atlas = {
        readJSON,
        readArray,
        writeJSON,
        localDate,
        parseDate,
        daysUntil,
        formatDate,
        formatMoney,
        escapeHTML,
        createId,
        notify,
        obligationRemaining,
        loadTasks,
        getUserName() {
            const user = window.AtlasAuth?.user;
            return String(user?.user_metadata?.full_name || "").trim() || user?.email?.split("@")[0] || "Usuario";
        },
        updateNavCounts
    };

    renderShell();
    window.addEventListener("atlas:data-changed", updateNavCounts);
    window.addEventListener("storage", updateNavCounts);
    window.addEventListener("pageshow", updateNavCounts);
})();
