(function () {
    const financeCounter = document.querySelector('[data-category-count="finance"]');

    if (!financeCounter) {
        return;
    }

    const financeCopy = financeCounter.closest("p");

    if (!financeCopy) {
        return;
    }

    let isRendering = false;
    let renderQueued = false;

    function loadObligations() {
        try {
            const stored = JSON.parse(localStorage.getItem("atlasObligations"));
            return Array.isArray(stored) ? stored : [];
        } catch (error) {
            console.error("No se pudo leer el resumen financiero:", error);
            return [];
        }
    }

    function getRemaining(obligation) {
        const payments = Array.isArray(obligation.payments)
            ? obligation.payments
            : [];

        const paidFromHistory = payments.reduce((sum, payment) => {
            return sum + Number(payment.amount || 0);
        }, 0);

        const paidAmount = paidFromHistory || Number(obligation.paidAmount || 0);
        return Math.max(0, Number(obligation.amount || 0) - paidAmount);
    }

    function parseLocalDate(dateValue) {
        if (!dateValue) {
            return null;
        }

        const parts = dateValue.split("-").map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function getToday() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function daysUntil(dateValue) {
        const date = parseLocalDate(dateValue);

        if (!date) {
            return Number.POSITIVE_INFINITY;
        }

        return Math.round((date - getToday()) / 86400000);
    }

    function formatMoney(value) {
        return new Intl.NumberFormat("es-PY", {
            style: "currency",
            currency: "PYG",
            maximumFractionDigits: 0
        }).format(value);
    }

    function buildSummary() {
        const obligations = loadObligations();
        const unpaid = obligations.filter((obligation) => getRemaining(obligation) > 0);
        const overdue = unpaid.filter((obligation) => daysUntil(obligation.dueDate) < 0);
        const dueSoon = unpaid.filter((obligation) => {
            const days = daysUntil(obligation.dueDate);
            return days >= 0 && days <= 7;
        });

        const pendingAmount = unpaid.reduce((sum, obligation) => {
            return sum + getRemaining(obligation);
        }, 0);

        if (overdue.length > 0) {
            return {
                value: String(overdue.length),
                label: `${overdue.length === 1 ? "cuenta vencida" : "cuentas vencidas"} · ${formatMoney(pendingAmount)} por pagar`,
                state: "overdue"
            };
        }

        if (dueSoon.length > 0) {
            return {
                value: String(dueSoon.length),
                label: `${dueSoon.length === 1 ? "pago próximo" : "pagos próximos"} · ${formatMoney(pendingAmount)} por pagar`,
                state: "soon"
            };
        }

        if (unpaid.length > 0) {
            return {
                value: String(unpaid.length),
                label: `${unpaid.length === 1 ? "cuenta pendiente" : "cuentas pendientes"} · ${formatMoney(pendingAmount)}`,
                state: "pending"
            };
        }

        if (obligations.length > 0) {
            return {
                value: "Al día",
                label: "sin cuentas pendientes",
                state: "clear"
            };
        }

        return {
            value: "Sin cuentas",
            label: "cargá tus próximos pagos",
            state: "empty"
        };
    }

    function renderFinanceSummary() {
        const summary = buildSummary();
        const currentLabel = financeCopy.querySelector("[data-finance-dashboard-label]");

        if (
            financeCounter.textContent === summary.value &&
            currentLabel?.textContent === summary.label &&
            financeCopy.dataset.financeState === summary.state
        ) {
            return;
        }

        isRendering = true;

        const label = document.createElement("span");
        label.dataset.financeDashboardLabel = "";
        label.textContent = summary.label;

        financeCounter.textContent = summary.value;
        financeCopy.replaceChildren(
            financeCounter,
            document.createTextNode(" "),
            label
        );

        financeCopy.dataset.financeState = summary.state;
        financeCopy.title = summary.label;
        financeCopy.setAttribute(
            "aria-label",
            `${summary.value} ${summary.label}`
        );

        isRendering = false;
    }

    function queueRender() {
        if (isRendering || renderQueued) {
            return;
        }

        renderQueued = true;

        queueMicrotask(() => {
            renderQueued = false;
            renderFinanceSummary();
        });
    }

    const observer = new MutationObserver(queueRender);
    observer.observe(financeCopy, {
        childList: true,
        characterData: true,
        subtree: true
    });

    window.addEventListener("pageshow", renderFinanceSummary);
    window.addEventListener("focus", renderFinanceSummary);
    window.addEventListener("storage", (event) => {
        if (event.key === "atlasObligations") {
            renderFinanceSummary();
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            renderFinanceSummary();
        }
    });

    renderFinanceSummary();
})();

(function () {
    const studyCounter = document.querySelector(
        '[data-category-count="study"], [data-category-count="studies"]'
    );

    if (!studyCounter) {
        return;
    }

    const studyCopy = studyCounter.closest("p");

    if (!studyCopy) {
        return;
    }

    let isRendering = false;
    let renderQueued = false;

    function loadStudyEvents() {
        try {
            const stored = JSON.parse(localStorage.getItem("atlasStudyEvents"));
            return Array.isArray(stored) ? stored : [];
        } catch (error) {
            console.error("No se pudo leer el resumen académico:", error);
            return [];
        }
    }

    function parseLocalDate(dateValue) {
        if (!dateValue) return null;
        const parts = dateValue.split("-").map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function getToday() {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), today.getDate());
    }

    function daysUntil(dateValue) {
        const date = parseLocalDate(dateValue);
        return date ? Math.round((date - getToday()) / 86400000) : Number.POSITIVE_INFINITY;
    }

    function formatShortDate(dateValue) {
        const date = parseLocalDate(dateValue);

        if (!date) return "sin fecha";

        return new Intl.DateTimeFormat("es-PY", {
            day: "2-digit",
            month: "short"
        }).format(date);
    }

    function buildStudySummary() {
        const events = loadStudyEvents();
        const pending = events
            .filter((event) => !event.completed)
            .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
        const overdue = pending.filter((event) => daysUntil(event.date) < 0);
        const dueSoon = pending.filter((event) => {
            const days = daysUntil(event.date);
            return days >= 0 && days <= 7;
        });
        const nextEvent = pending[0];
        const nextLabel = nextEvent
            ? `${nextEvent.subject || "Estudios"} · ${formatShortDate(nextEvent.date)}`
            : "";

        if (overdue.length > 0) {
            return {
                value: String(overdue.length),
                label: `${overdue.length === 1 ? "actividad vencida" : "actividades vencidas"} · ${nextLabel}`,
                state: "overdue"
            };
        }

        if (dueSoon.length > 0) {
            return {
                value: String(dueSoon.length),
                label: `${dueSoon.length === 1 ? "actividad esta semana" : "actividades esta semana"} · ${nextLabel}`,
                state: "soon"
            };
        }

        if (pending.length > 0) {
            return {
                value: String(pending.length),
                label: `${pending.length === 1 ? "actividad pendiente" : "actividades pendientes"} · Próximo: ${nextLabel}`,
                state: "pending"
            };
        }

        if (events.length > 0) {
            return {
                value: "Al día",
                label: "sin actividades pendientes",
                state: "clear"
            };
        }

        return {
            value: "Sin agenda",
            label: "cargá exámenes y trabajos",
            state: "empty"
        };
    }

    function renderStudySummary() {
        const summary = buildStudySummary();
        const currentLabel = studyCopy.querySelector("[data-study-dashboard-label]");

        if (
            studyCounter.textContent === summary.value &&
            currentLabel?.textContent === summary.label &&
            studyCopy.dataset.studyState === summary.state
        ) {
            return;
        }

        isRendering = true;

        const label = document.createElement("span");
        label.dataset.studyDashboardLabel = "";
        label.textContent = summary.label;

        studyCounter.textContent = summary.value;
        studyCopy.replaceChildren(
            studyCounter,
            document.createTextNode(" "),
            label
        );

        studyCopy.dataset.studyState = summary.state;
        studyCopy.title = summary.label;
        studyCopy.setAttribute("aria-label", `${summary.value} ${summary.label}`);

        isRendering = false;
    }

    function queueRender() {
        if (isRendering || renderQueued) return;

        renderQueued = true;
        queueMicrotask(() => {
            renderQueued = false;
            renderStudySummary();
        });
    }

    const observer = new MutationObserver(queueRender);
    observer.observe(studyCopy, {
        childList: true,
        characterData: true,
        subtree: true
    });

    window.addEventListener("pageshow", renderStudySummary);
    window.addEventListener("focus", renderStudySummary);
    window.addEventListener("storage", (event) => {
        if (event.key === "atlasStudyEvents") renderStudySummary();
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) renderStudySummary();
    });

    renderStudySummary();
})();
