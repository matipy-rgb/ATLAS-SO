(function () {
    const pageMap = {
        dashboard: { label: "Centro de mando", href: "index.html", icon: "⌂" },
        finance: { label: "Finanzas", href: "finance.html", icon: "₲" },
        study: { label: "Estudios", href: "study.html", icon: "E" },
        work: { label: "Trabajo", href: "work.html", icon: "T" },
        rrhh: { label: "RRHH", href: "rrhh.html", icon: "R" },
        health: { label: "Salud", href: "health.html", icon: "+" },
        projects: { label: "Proyectos", href: "projects.html", icon: "P" },
        personal: { label: "Personal", href: "personal.html", icon: "H" }
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
            <a class="sidebar-brand" href="index.html" aria-label="ATLAS SO - Inicio">
                <span class="brand-mark">A</span>
                <span><strong>ATLAS SO</strong><span>Sistema personal</span></span>
            </a>
            <p class="sidebar-label">Centro de control</p>
            <nav class="sidebar-nav">
                ${Object.entries(pageMap).map(([key, item]) => `
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
                <span>Principio operativo</span>
                <strong>Lo que no se mide, no se mejora.</strong>
                <small>ATLAS SO · versión escritorio</small>
            </div>
        `;

        const topbar = document.createElement("header");
        topbar.className = "app-topbar";
        topbar.innerHTML = `
            <button class="icon-control mobile-menu-button" type="button" aria-label="Abrir menú">☰</button>
            <div class="topbar-page">
                <span>ATLAS SO / ${currentPage.label}</span>
                <strong>${document.body.dataset.context || "Centro personal de operaciones"}</strong>
            </div>
            <div class="topbar-right">
                <span id="syncStatus" class="sync-status" data-state="synced">Sincronizado</span>
                <button id="installAtlas" class="install-control" type="button" hidden>Instalar app</button>
                <div class="topbar-date">
                    <span id="atlasDate"></span>
                    <strong id="atlasClock"></strong>
                </div>
                <a class="icon-control" href="index.html#backup" title="Copia de seguridad" aria-label="Ir a copia de seguridad">↧</a>
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
            <a class="${current === "dashboard" ? "active" : ""}" href="index.html"><span>⌂</span>Inicio</a>
            <a class="${current === "rrhh" ? "active" : ""}" href="rrhh.html"><span>R</span>RRHH</a>
            <a class="${current === "finance" ? "active" : ""}" href="finance.html"><span>₲</span>Finanzas</a>
            <button id="mobileMore" type="button"><span>☰</span>Más</button>
        `;
        document.body.appendChild(mobileNav);

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

        const updateClock = () => {
            const now = new Date();
            const dateNode = document.querySelector("#atlasDate");
            const clockNode = document.querySelector("#atlasClock");
            if (dateNode) {
                dateNode.textContent = new Intl.DateTimeFormat("es-PY", {
                    weekday: "long",
                    day: "numeric",
                    month: "long"
                }).format(now);
            }
            if (clockNode) {
                clockNode.textContent = new Intl.DateTimeFormat("es-PY", {
                    hour: "2-digit",
                    minute: "2-digit"
                }).format(now);
            }
        };

        updateClock();
        window.setInterval(updateClock, 30000);
        updateNavCounts();

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
