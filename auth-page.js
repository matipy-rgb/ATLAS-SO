(function () {
    const auth = window.AtlasAuth;
    const page = document.body.dataset.authPage;
    const message = document.querySelector("#authMessage");

    function setMessage(text, type = "info") {
        if (!message) return;
        message.textContent = text;
        message.className = `auth-message ${type}`;
    }

    function setBusy(form, busy) {
        const submitButton = form.querySelector('button[type="submit"]');
        const busyLabels = {
            loginForm: "Ingresando…",
            registerForm: "Creando cuenta…",
            forgotForm: "Enviando enlace…",
            resetForm: "Guardando…"
        };

        if (submitButton) {
            if (!submitButton.dataset.idleLabel) {
                submitButton.dataset.idleLabel = submitButton.textContent.trim();
            }
            submitButton.textContent = busy
                ? (busyLabels[form.id] || "Procesando…")
                : submitButton.dataset.idleLabel;
            submitButton.setAttribute("aria-busy", String(busy));
        }

        form.querySelectorAll("button, input").forEach(control => {
            control.disabled = busy;
        });
    }

    function withTimeout(promise, milliseconds = 20000) {
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => {
                reject(new Error("La conexión tardó demasiado en responder."));
            }, milliseconds);
        });
        return Promise.race([promise, timeout]).finally(() => {
            window.clearTimeout(timeoutId);
        });
    }

    function errorDetails(error) {
        const source = error && typeof error === "object" ? error : {};
        let message = source.message || source.error_description || source.msg || source.details || "";

        if (message && typeof message === "object") {
            try {
                message = JSON.stringify(message);
            } catch (_) {
                message = "";
            }
        }

        return {
            code: String(source.code || source.error_code || "").trim().toLowerCase(),
            status: Number(source.status || source.statusCode || 0),
            message: String(message || (typeof error === "string" ? error : "")).trim()
        };
    }

    function reportAuthError(error, action) {
        const details = errorDetails(error);
        console.error(`ATLAS SO · ${action}`, {
            name: error?.name || "AuthError",
            code: details.code || "sin_codigo",
            status: details.status || "sin_estado",
            message: details.message || "sin_mensaje"
        });
    }

    function friendlyError(error, action = "general") {
        const details = errorDetails(error);
        const value = `${details.code} ${details.message}`.toLowerCase();
        const emptyServerMessage = !details.message || details.message === "{}" || details.message === "[object object]";

        if (details.code === "invalid_credentials" || value.includes("invalid login")) {
            return "Correo o contraseña incorrectos.";
        }
        if (details.code === "email_not_confirmed" || value.includes("email not confirmed")) {
            return "Primero confirmá tu correo desde el mensaje que te enviamos.";
        }
        if (details.code === "email_exists" || value.includes("already registered") || value.includes("already been registered")) {
            return "Ese correo ya tiene una cuenta.";
        }
        if (details.code === "over_email_send_rate_limit") {
            return "Ya se solicitó un correo recientemente. Esperá unos minutos y volvé a intentar.";
        }
        if (details.code === "over_request_rate_limit" || details.status === 429 || value.includes("rate limit")) {
            return "Hay demasiados intentos seguidos. Esperá unos minutos y probá nuevamente.";
        }
        if (details.code === "email_address_not_authorized") {
            return "El correo de salida todavía no está habilitado para enviar a esta dirección. Revisá la configuración SMTP de Supabase.";
        }
        if (details.code === "email_provider_disabled") {
            return "La recuperación por correo está desactivada en Supabase.";
        }
        if (
            action === "recovery" &&
            (details.code === "unexpected_failure" || details.status >= 500 || emptyServerMessage || value.includes("smtp") || value.includes("sending recovery"))
        ) {
            return "Supabase no pudo enviar el correo. Revisá en SMTP que remitente y usuario sean el mismo Gmail y que la clave sea una contraseña de aplicación válida.";
        }
        if (details.code === "weak_password" || value.includes("password")) {
            return "La contraseña debe tener al menos 8 caracteres y no ser fácil de adivinar.";
        }
        if (value.includes("tardó demasiado") || value.includes("failed to fetch") || value.includes("network")) {
            return "No pudimos comunicarnos con el servidor. Revisá tu conexión y probá nuevamente.";
        }
        if (emptyServerMessage) return "No pudimos completar la operación. Probá nuevamente en unos minutos.";
        return details.message || "No pudimos completar la operación.";
    }

    function safeNextPage() {
        const next = new URLSearchParams(location.search).get("next") || "app.html";
        return /^[a-z0-9-]+\.html(?:#[a-z0-9-]+)?$/i.test(next) ? next : "app.html";
    }

    function changeView(view) {
        const titles = {
            login: ["Bienvenido de vuelta", "Ingresá con tu correo y contraseña."],
            register: ["Creá tu espacio", "Cada persona usa su propia cuenta y sus propios datos."],
            forgot: ["Recuperá tu acceso", "Te enviaremos un enlace seguro para crear otra contraseña."]
        };
        document.querySelectorAll("[data-auth-form]").forEach(form => {
            form.hidden = form.dataset.authForm !== view;
        });
        document.querySelectorAll(".auth-tabs [data-auth-view]").forEach(button => {
            button.classList.toggle("active", button.dataset.authView === view);
        });
        document.querySelector(".auth-tabs")?.toggleAttribute("hidden", view === "forgot");
        document.querySelector("#authTitle").textContent = titles[view][0];
        document.querySelector("#authSubtitle").textContent = titles[view][1];
        setMessage("");
        document.querySelector(`[data-auth-form="${view}"] input`)?.focus();
    }

    document.querySelectorAll("[data-auth-view]").forEach(button => {
        button.addEventListener("click", () => changeView(button.dataset.authView));
    });

    document.querySelectorAll("[data-toggle-password]").forEach(button => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.togglePassword);
            const visible = input.type === "text";
            input.type = visible ? "password" : "text";
            button.textContent = visible ? "Ver" : "Ocultar";
        });
    });

    async function initLoginPage() {
        const setupNotice = document.querySelector("#setupNotice");
        const loginForm = document.querySelector("#loginForm");
        const registerForm = document.querySelector("#registerForm");
        const forgotForm = document.querySelector("#forgotForm");

        // Los eventos se conectan antes de consultar la sesión. Si el navegador
        // tarda en leerla, los botones siguen respondiendo y mostrando estado.
        loginForm?.addEventListener("submit", async event => {
            event.preventDefault();
            const form = event.currentTarget;
            setBusy(form, true);
            setMessage("Verificando…");
            try {
                const { error } = await withTimeout(auth.client.auth.signInWithPassword({
                    email: document.querySelector("#loginEmail").value.trim(),
                    password: document.querySelector("#loginPassword").value
                }));
                if (error) throw error;
                location.replace(safeNextPage());
            } catch (error) {
                reportAuthError(error, "inicio de sesión");
                setMessage(friendlyError(error, "login"), "error");
                setBusy(form, false);
            }
        });

        registerForm?.addEventListener("submit", async event => {
            event.preventDefault();
            const form = event.currentTarget;
            setBusy(form, true);
            setMessage("Creando tu espacio…");
            try {
                const { data, error } = await withTimeout(auth.client.auth.signUp({
                    email: document.querySelector("#registerEmail").value.trim(),
                    password: document.querySelector("#registerPassword").value,
                    options: {
                        data: { full_name: document.querySelector("#registerName").value.trim() },
                        emailRedirectTo: auth.redirectUrl("login.html")
                    }
                }));
                if (error) throw error;
                if (data.session) {
                    location.replace("app.html");
                    return;
                }
                form.reset();
                setMessage("Cuenta creada. Revisá tu correo y confirmá el acceso antes de ingresar.", "success");
            } catch (error) {
                reportAuthError(error, "registro");
                setMessage(friendlyError(error, "register"), "error");
            } finally {
                setBusy(form, false);
            }
        });

        forgotForm?.addEventListener("submit", async event => {
            event.preventDefault();
            const form = event.currentTarget;
            setBusy(form, true);
            setMessage("Enviando un enlace seguro a tu correo…");
            try {
                const { error } = await withTimeout(auth.client.auth.resetPasswordForEmail(
                    document.querySelector("#forgotEmail").value.trim(),
                    { redirectTo: auth.redirectUrl("reset-password.html") }
                ));
                if (error) throw error;
                form.reset();
                setMessage("Si el correo está registrado, el enlace llegará en breve. Revisá Recibidos y Spam.", "success");
            } catch (error) {
                reportAuthError(error, "recuperación de contraseña");
                setMessage(friendlyError(error, "recovery"), "error");
            } finally {
                setBusy(form, false);
            }
        });

        if (!auth?.isConfigured()) {
            setupNotice.hidden = false;
            document.querySelectorAll(".auth-form input, .auth-form button").forEach(control => {
                control.disabled = true;
            });
            setMessage("La interfaz está lista; falta completar la conexión indicada en la guía.", "warning");
            return;
        }

        // La redirección de una sesión ya abierta ocurre en segundo plano y no
        // bloquea la interfaz si el almacenamiento del navegador está lento.
        withTimeout(auth.getSession(), 8000)
            .then(existing => {
                if (existing) location.replace(safeNextPage());
            })
            .catch(() => {
                // No interrumpimos el acceso: cada acción mostrará su propio error.
            });
    }

    async function initResetPage() {
        if (!auth?.isConfigured()) {
            setMessage("Falta configurar la conexión de ATLAS SO.", "error");
            return;
        }
        await auth.getSession();
        const form = document.querySelector("#resetForm");
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const password = document.querySelector("#resetPassword").value;
            const confirmation = document.querySelector("#resetPasswordConfirm").value;
            if (password !== confirmation) {
                setMessage("Las contraseñas no coinciden.", "error");
                return;
            }
            setBusy(form, true);
            try {
                const { error } = await auth.client.auth.updateUser({ password });
                if (error) throw error;
                setMessage("Contraseña actualizada. Ya podés volver a ingresar.", "success");
                window.setTimeout(async () => {
                    await auth.client.auth.signOut();
                    location.replace("login.html");
                }, 1300);
            } catch (error) {
                reportAuthError(error, "cambio de contraseña");
                setMessage(friendlyError(error, "password-update"), "error");
                setBusy(form, false);
            }
        });
    }

    if (page === "login") initLoginPage().catch(error => {
        reportAuthError(error, "carga del acceso");
        setMessage(friendlyError(error), "error");
    });
    if (page === "reset") initResetPage().catch(error => {
        reportAuthError(error, "carga de recuperación");
        setMessage(friendlyError(error), "error");
    });

    const requestedView = new URLSearchParams(location.search).get("view");
    if (page === "login" && ["login", "register", "forgot"].includes(requestedView)) {
        changeView(requestedView);
    }

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
        navigator.serviceWorker.register("sw.js").catch(error => {
            console.warn("No se actualizó el modo instalable:", error.message);
        });
    }
})();
