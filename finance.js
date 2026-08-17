(function () {
    const Core = window.AtlasFinanceCore;
    const Domain = window.AtlasFinanceDomain;
    const Repository = window.AtlasFinanceRepository?.FinanceRepository;
    const Migration = window.AtlasFinanceMigration?.FinanceMigration;
    if (!Core || !Domain || !Repository || !Migration) throw new Error("Finanzas v0.10 no pudo cargar sus módulos.");

    const $ = selector => document.querySelector(selector);
    const $$ = selector => [...document.querySelectorAll(selector)];
    const EMPTY = "<div class=\"finance-empty\">Todavía no hay registros en este alcance.</div>";
    const CLOSE_STEPS = [
        "Revisé ingresos y gastos confirmados.", "Revisé transferencias y ajustes.",
        "Revisé comprobantes pendientes de sincronización.", "Revisé cuentas y saldos.",
        "Revisé deudas, cuotas y tarjetas.", "Revisé cuentas por cobrar.",
        "Revisé presupuesto gastado y comprometido.", "Revisé metas y movimientos de ahorro.",
        "Actualicé las valuaciones patrimoniales necesarias.", "Revisé el resumen y acepto crear una fotografía inmutable."
    ];
    const state = {
        repository: null, migration: null, data: {}, activeContext: "general", activeMonth: Core.currentMonth(),
        activeView: "home", planningTab: "budgets", search: "", movementType: "", movementLimit: 250,
        movementDateFrom: "", movementDateTo: "", commitmentState: "", activeConflict: null, migrationPreview: null, closeMode: "close"
    };

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
    }

    function localDate(date = new Date()) {
        const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return copy.toISOString().slice(0, 10);
    }

    function localDateTime(date = new Date()) {
        const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return copy.toISOString().slice(0, 16);
    }

    function notify(message, tone = "success") {
        if (window.Atlas?.notify) return window.Atlas.notify(message, tone);
        const notice = $("#financeAccessNotice");
        notice.hidden = false;
        notice.textContent = message;
        window.setTimeout(() => { if (notice.textContent === message && state.repository?.remoteReady) notice.hidden = true; }, 4500);
    }

    function concreteContexts() { return (state.data.contexts || []).filter(item => item.status === "active"); }
    function contextName(id) { return state.data.contexts?.find(item => item.id === id)?.name || "Contexto"; }
    function scoped(records) { return state.activeContext === "general" ? records || [] : (records || []).filter(item => item.context_id === state.activeContext); }
    function currentContextId() { return state.activeContext === "general" ? null : state.activeContext; }
    function assertConcreteContext(message = "Elegí Personal o un emprendimiento para registrar cambios.") {
        if (currentContextId()) return true;
        notify(message, "warning");
        return false;
    }
    function accountName(id) { return state.data.accounts?.find(item => item.id === id)?.name || "Cuenta"; }
    function categoryName(id) { return state.data.categories?.find(item => item.id === id)?.name || "Sin categoría"; }
    function methodName(id) { return state.data.paymentMethods?.find(item => item.id === id)?.name || "Sin medio"; }
    function balanceLabel(account, balance) {
        if (!["credit_card", "liability"].includes(account.account_type)) return Core.formatMoney(balance);
        return balance >= 0 ? `Deuda ${Core.formatMoney(balance)}` : `A favor ${Core.formatMoney(Math.abs(balance))}`;
    }
    function matchesCommitmentState(item, filter, today = localDate()) {
        if (!filter) return true;
        const status = Domain.obligationState(item, today);
        if (filter === "attention") return ["overdue", "due_today", "due_soon"].includes(status);
        if (filter === "receivable") return item.direction === "receivable" && !["collected", "void"].includes(status);
        if (filter === "partial") return Number(item.paid_amount) > 0 && !["paid", "collected", "void"].includes(status);
        if (filter === "paid") return status === "paid";
        return status === filter;
    }
    function formatDate(value) { return value ? new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`)) : "Sin fecha"; }
    function emptyOr(html) { return html || EMPTY; }

    function options(items, selected, { empty = "", label = item => item.name } = {}) {
        return `${empty !== null ? `<option value="">${escapeHTML(empty)}</option>` : ""}${items.map(item => `<option value="${escapeHTML(item.id)}"${item.id === selected ? " selected" : ""}>${escapeHTML(label(item))}</option>`).join("")}`;
    }

    async function refresh({ render = true } = {}) {
        state.data = await state.repository.snapshot();
        if (render) renderAll();
        return state.data;
    }

    function renderScope() {
        const select = $("#financeContext");
        select.innerHTML = `<option value="general">General · solo lectura</option>${concreteContexts().map(item => `<option value="${item.id}">${escapeHTML(item.name)}${item.kind === "personal" ? " · Personal" : ""}</option>`).join("")}`;
        select.value = state.activeContext;
        $("#financeMonth").value = state.activeMonth;
        $("#financeSearch").value = state.search;
        $("#financeScopeCopy").textContent = state.activeContext === "general"
            ? `Vista consolidada de ${Core.formatMonth(state.activeMonth)}. Elegí un contexto para registrar o editar.`
            : `${contextName(state.activeContext)} · ${Core.formatMonth(state.activeMonth)} · todos los importes en guaraníes.`;
    }

    function filteredTransactions() {
        const search = Core.searchText(state.search);
        return scoped(state.data.transactions).filter(item => {
            const date = String(item.occurred_at || "").slice(0, 10);
            if (state.movementDateFrom && date < state.movementDateFrom) return false;
            if (state.movementDateTo && date > state.movementDateTo) return false;
            return state.movementDateFrom || state.movementDateTo || Domain.monthOf(item.occurred_at) === state.activeMonth;
        })
            .filter(item => !state.movementType || item.operation_kind === state.movementType || item.reporting_effect === state.movementType)
            .filter(item => !$("#movementAccountFilter")?.value || item.account_id === $("#movementAccountFilter").value)
            .filter(item => !$("#movementCategoryFilter")?.value || item.category_id === $("#movementCategoryFilter").value)
            .filter(item => !$("#movementMethodFilter")?.value || item.payment_method_id === $("#movementMethodFilter").value)
            .filter(item => !$("#movementStatusFilter")?.value || item.status === $("#movementStatusFilter").value)
            .filter(item => !search || Core.searchText(`${item.description} ${item.counterparty} ${(item.tags || []).join(" ")} ${item.amount} ${accountName(item.account_id)} ${categoryName(item.category_id)}`).includes(search))
            .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)) || b.id.localeCompare(a.id));
    }

    function logicalTransactions(records) {
        const groups = new Map();
        records.forEach(item => {
            const key = item.operation_group_id || item.id;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        });
        return [...groups.entries()].map(([id, items]) => ({ id, items, record: items.find(item => item.operation_leg === "source") || items.find(item => Number(item.balance_delta) < 0) || items[0] }));
    }

    function renderSummary() {
        const summary = Core.financialSummary({ accounts: state.data.accounts, transactions: state.data.transactions, contextId: state.activeContext, month: state.activeMonth });
        $("#summaryAvailable").textContent = Core.formatMoney(summary.available);
        $("#summaryIncome").textContent = Core.formatMoney(summary.income);
        $("#summaryExpense").textContent = Core.formatMoney(summary.expense);
        $("#summaryResult").textContent = Core.formatMoney(summary.result);
        const today = localDate();
        const open = scoped(state.data.obligations).filter(item => matchesCommitmentState(item, "attention", today));
        const due = open.reduce((sum, item) => sum + Domain.obligationTotal(item) - Number(item.paid_amount), 0);
        $("#summaryDue").textContent = Core.formatMoney(due);
        $("#summaryDueCopy").textContent = `${open.length} compromiso${open.length === 1 ? "" : "s"} abierto${open.length === 1 ? "" : "s"}`;
        const receivables = scoped(state.data.obligations).filter(item => matchesCommitmentState(item, "receivable", today));
        $("#summaryReceivable").textContent = Core.formatMoney(receivables.reduce((sum, item) => sum + Domain.obligationTotal(item) - Number(item.paid_amount), 0));
        $("#summaryReceivableCopy").textContent = receivables.length ? `${receivables.length} cobro${receivables.length === 1 ? "" : "s"} pendiente${receivables.length === 1 ? "" : "s"}` : "Sin cuentas por cobrar";
        const budgets = Domain.budgetSummary({ ...state.data, contextId: state.activeContext, month: state.activeMonth });
        const available = budgets.reduce((sum, item) => sum + item.available, 0);
        $("#summaryBudget").textContent = Core.formatMoney(available);
        $("#summaryBudgetCopy").textContent = budgets.length ? `${budgets.filter(item => item.alert).length} alerta(s)` : "Sin presupuestos";
        const goals = scoped(state.data.goals).filter(item => item.status === "active");
        const saved = goals.reduce((sum, item) => sum + Domain.goalProgress(item, state.data.goalEntries, `${state.activeMonth}-31`).saved, 0);
        const target = goals.reduce((sum, item) => sum + Number(item.target_amount), 0);
        $("#summaryGoals").textContent = Core.formatMoney(saved);
        $("#summaryGoalsCopy").textContent = goals.length ? `${goals.length} meta${goals.length === 1 ? "" : "s"} · objetivo ${Core.formatMoney(target)}` : "Sin metas activas";
        const contextId = currentContextId();
        const latestClose = contextId ? state.data.monthlyCloses.filter(item => item.context_id === contextId && item.month === state.activeMonth).sort((a, b) => Number(b.version_number) - Number(a.version_number))[0] : null;
        $("#summaryClose").textContent = !contextId ? "Por contexto" : latestClose?.state === "closed" ? "Cerrado" : "Abierto";
        $("#summaryCloseCopy").textContent = !contextId ? "Elegí un contexto para cerrar" : latestClose?.state === "closed" ? `Fotografía v${latestClose.version_number}` : "Revisar y cerrar el mes";
    }

    function renderHome() {
        const accounts = scoped(state.data.accounts).filter(item => item.status === "active").slice(0, 5);
        $("#homeAccounts").innerHTML = emptyOr(accounts.map(item => {
            const balance = Core.accountBalance(item, state.data.transactions);
            const debt = ["credit_card", "liability"].includes(item.account_type);
            return `<button class="finance-list-card finance-list-button" type="button" data-open-view="accounts"><span class="finance-list-icon">${debt ? "−" : "₲"}</span><span class="finance-list-copy"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(contextName(item.context_id))}</small></span><span class="finance-list-amount">${balanceLabel(item, balance)}</span></button>`;
        }).join(""));
        const today = localDate();
        const horizon = new Date(`${today}T00:00:00`); horizon.setDate(horizon.getDate() + 7);
        const due = scoped(state.data.obligations).filter(item => !["paid", "void"].includes(item.status) && item.due_date <= localDate(horizon)).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6);
        $("#homeCommitments").innerHTML = emptyOr(due.map(item => `<button class="finance-list-card finance-list-button" type="button" data-open-view="commitments" data-commitment-state="attention"><span class="finance-list-icon">${Domain.obligationState(item) === "overdue" ? "!" : "◷"}</span><span class="finance-list-copy"><strong>${escapeHTML(item.name)}</strong><small>${formatDate(item.due_date)} · ${escapeHTML(item.counterparty || categoryName(item.category_id))}</small></span><span class="finance-list-amount">${Core.formatMoney(Domain.obligationTotal(item) - Number(item.paid_amount))}</span></button>`).join(""));
        const worth = Domain.netWorth({ ...state.data, contextId: state.activeContext, month: state.activeMonth });
        $("#homeNetWorth").innerHTML = `<strong>${Core.formatMoney(worth.net)}</strong><span>Activos ${Core.formatMoney(worth.assets)} · Pasivos ${Core.formatMoney(worth.liabilities)}</span>`;
        const contexts = concreteContexts();
        $("#contextBreakdown").innerHTML = emptyOr(contexts.map(item => {
            const summary = Core.financialSummary({ accounts: state.data.accounts, transactions: state.data.transactions, contextId: item.id, month: state.activeMonth });
            return `<div class="context-breakdown-item"><span><strong>${escapeHTML(item.name)}</strong><small>${Core.formatMoney(summary.available)} disponible</small></span><button type="button" data-select-context="${item.id}">Abrir</button></div>`;
        }).join(""));
    }

    function renderMovementFilters() {
        const contextId = currentContextId();
        const accounts = (state.data.accounts || []).filter(item => (!contextId || item.context_id === contextId) && item.status === "active");
        const categories = (state.data.categories || []).filter(item => (!contextId || item.context_id === contextId) && item.status === "active");
        const methods = (state.data.paymentMethods || []).filter(item => (!contextId || item.context_id === contextId) && item.status === "active");
        const current = {
            account: $("#movementAccountFilter")?.value || "", category: $("#movementCategoryFilter")?.value || "",
            method: $("#movementMethodFilter")?.value || "", status: $("#movementStatusFilter")?.value || ""
        };
        $("#movementTypeFilter").innerHTML = `<option value="">Todos los tipos</option>${Core.OPERATION_TYPES.map(item => `<option value="${item.value}">${item.label}</option>`).join("")}`;
        $("#movementTypeFilter").value = state.movementType;
        $("#movementAccountFilter").innerHTML = options(accounts, current.account, { empty: "Todas las cuentas", label: item => `${item.name} · ${contextName(item.context_id)}` });
        $("#movementCategoryFilter").innerHTML = options(categories, current.category, { empty: "Todas las categorías", label: item => `${item.name} · ${contextName(item.context_id)}` });
        $("#movementMethodFilter").innerHTML = options(methods, current.method, { empty: "Todos los medios", label: item => `${item.name} · ${contextName(item.context_id)}` });
        $("#movementStatusFilter").value = current.status;
        $("#movementDateFrom").value = state.movementDateFrom;
        $("#movementDateTo").value = state.movementDateTo;
    }

    function renderMovements() {
        $("#movementsMonthLabel").textContent = Core.formatMonth(state.activeMonth);
        renderMovementFilters();
        const records = filteredTransactions();
        const groups = logicalTransactions(records);
        $("#movementCount").textContent = `${groups.length} movimiento${groups.length === 1 ? "" : "s"}`;
        $("#movementsList").innerHTML = emptyOr(groups.slice(0, state.movementLimit).map(({ id, items, record }) => {
            const transfer = record.operation_kind === "transfer";
            const label = Core.OPERATION_TYPES.find(item => item.value === record.operation_kind)?.label || record.operation_kind;
            const status = record.status === "void" ? "Anulado" : record.status === "pending" ? "Pendiente" : "Confirmado";
            const amountClass = record.reporting_effect === "income" ? "income" : record.reporting_effect === "expense" ? "expense" : "neutral";
            const compound = items.length > 1;
            const orderedItems = compound ? [...items].sort((a, b) => (a.operation_leg === "source" ? -1 : 1) - (b.operation_leg === "source" ? -1 : 1)) : items;
            const accounts = compound ? orderedItems.map(item => accountName(item.account_id)).join(" → ") : accountName(record.account_id);
            const paymentId = record.related_payment_id;
            const attachments = state.data.attachments.filter(item => ((item.transaction_id && items.some(tx => tx.id === item.transaction_id)) || (paymentId && item.payment_id === paymentId)) && item.sync_state !== "removed");
            const editable = record.status !== "void" && state.activeContext !== "general";
            const actions = paymentId
                ? `<button type="button" data-payment-edit="${paymentId}"${editable ? "" : " disabled"}>Editar pago</button><button type="button" data-payment-void="${paymentId}"${editable ? "" : " disabled"}>Anular pago</button>`
                : `<button type="button" data-operation-edit="${id}"${editable ? "" : " disabled"}>Editar</button>${record.status === "pending" ? `<button type="button" data-operation-delete="${id}"${editable ? "" : " disabled"}>Eliminar borrador</button>` : `<button type="button" data-operation-void="${id}"${editable ? "" : " disabled"}>Anular</button>`}`;
            return `<article class="finance-movement-item ${record.status === "void" ? "void" : ""}"><span class="movement-kind ${amountClass}">${record.reporting_effect === "income" ? "↑" : record.reporting_effect === "expense" ? "↓" : "↔"}</span><span class="finance-list-copy"><strong>${escapeHTML(record.description)}</strong><small>${escapeHTML(label)} · ${escapeHTML(accounts)} · ${formatDate(record.occurred_at)} · ${escapeHTML(status)}</small><small>${escapeHTML(record.counterparty || categoryName(record.category_id))}${record.tags?.length ? ` · #${record.tags.map(escapeHTML).join(" #")}` : ""}</small></span><span class="movement-side"><strong class="movement-amount ${amountClass}">${Core.formatMoney(record.amount)}</strong><span class="list-actions">${actions}${attachments.map(file => `<button type="button" data-attachment-open="${file.id}">Comprobante</button><button type="button" data-attachment-remove="${file.id}"${editable ? "" : " disabled"}>Quitar comprobante</button>`).join("")}</span></span></article>`;
        }).join(""));
        const filters = scoped(state.data.savedFilters);
        $("#savedFilters").innerHTML = filters.map(item => `<span class="saved-filter-item"><button type="button" data-saved-filter="${item.id}"${item.status === "archived" ? " disabled" : ""}>${escapeHTML(item.name)}</button><button type="button" data-simple-edit="savedFilter" data-id="${item.id}">Editar</button><button type="button" data-entity="savedFilters" data-action="${item.status === "archived" ? "restore" : "archive"}" data-id="${item.id}">${item.status === "archived" ? "Reactivar" : "Archivar"}</button></span>`).join("");
    }

    function renderAccounts() {
        const search = Core.searchText(state.search);
        const rows = scoped(state.data.accounts).filter(item => !search || Core.searchText(`${item.name} ${item.notes}`).includes(search));
        $("#accountsList").innerHTML = emptyOr(rows.map(item => {
            const balance = Core.accountBalance(item, state.data.transactions);
            const type = Core.ACCOUNT_TYPES.find(typeItem => typeItem.value === item.account_type)?.label || item.account_type;
            return `<article class="finance-account-card ${item.status}"><div class="account-card-top"><span class="account-type-badge">${escapeHTML(type)}</span><span class="status-badge">${item.status === "active" ? "Activa" : "Archivada"}</span></div><h3>${escapeHTML(item.name)}</h3><small>${escapeHTML(contextName(item.context_id))}</small><div class="account-balance">${balanceLabel(item, balance)}</div><div class="account-card-actions"><button type="button" data-simple-edit="account" data-id="${item.id}"${state.activeContext === "general" ? " disabled" : ""}>Editar</button><button type="button" data-entity="accounts" data-action="${item.status === "active" ? "archive" : "restore"}" data-id="${item.id}"${state.activeContext === "general" ? " disabled" : ""}>${item.status === "active" ? "Archivar" : "Reactivar"}</button></div></article>`;
        }).join(""));
    }

    function renderCommitments() {
        const today = localDate();
        const rows = scoped(state.data.obligations).filter(item => matchesCommitmentState(item, state.commitmentState, today))
            .filter(item => !state.search || Core.searchText(`${item.name} ${item.counterparty}`).includes(Core.searchText(state.search)))
            .sort((a, b) => a.due_date.localeCompare(b.due_date));
        $("#commitmentStateFilter").value = state.commitmentState;
        $("#commitmentsList").innerHTML = emptyOr(rows.map(item => {
            const total = Domain.obligationTotal(item);
            const remaining = total - Number(item.paid_amount);
            const status = Domain.obligationState(item, today);
            const charges = Number(item.interest_amount || 0) + Number(item.surcharge_amount || 0);
            return `<article class="finance-list-card commitment-card ${status}"><span class="finance-list-icon">${item.direction === "receivable" ? "↑" : "↓"}</span><span class="finance-list-copy"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.counterparty || categoryName(item.category_id))} · vence ${formatDate(item.due_date)} · ${escapeHTML(status.replaceAll("_", " "))}</small><small>Pagado ${Core.formatMoney(item.paid_amount)} de ${Core.formatMoney(total)}${charges ? ` · interés/recargo ${Core.formatMoney(charges)}` : ""}</small><progress max="${total}" value="${item.paid_amount}"></progress></span><span class="movement-side"><strong>${Core.formatMoney(remaining)}</strong><span class="list-actions"><button type="button" data-obligation-pay="${item.id}"${["paid", "void"].includes(item.status) || state.activeContext === "general" ? " disabled" : ""}>${item.direction === "receivable" ? "Cobrar" : "Pagar"}</button><button type="button" data-obligation-edit="${item.id}"${["paid", "void"].includes(item.status) || state.activeContext === "general" ? " disabled" : ""}>Editar</button><button type="button" data-obligation-void="${item.id}"${["paid", "void"].includes(item.status) || state.activeContext === "general" ? " disabled" : ""}>Anular</button></span></span></article>`;
        }).join(""));
        const recurrences = scoped(state.data.recurrences);
        $("#recurrencesList").innerHTML = emptyOr(recurrences.map(item => `<div class="finance-list-card"><span class="finance-list-icon">↻</span><span class="finance-list-copy"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.frequency)} · próxima ${formatDate(item.next_on)}</small></span><span class="list-actions"><button type="button" data-simple-edit="recurrence" data-id="${item.id}">Editar</button><button type="button" data-entity="recurrences" data-action="${item.status === "active" ? "archive" : "restore"}" data-id="${item.id}">${item.status === "active" ? "Archivar" : "Reactivar"}</button></span></div>`).join(""));
    }

    function renderPlanning() {
        $$('[data-planning-tab]').forEach(button => button.classList.toggle("active", button.dataset.planningTab === state.planningTab));
        $$('[data-planning-panel]').forEach(panel => panel.hidden = panel.dataset.planningPanel !== state.planningTab);
        const budgets = Domain.budgetSummary({ ...state.data, contextId: state.activeContext, month: state.activeMonth });
        const planned = budgets.reduce((sum, item) => sum + Number(item.planned_amount), 0);
        const used = budgets.reduce((sum, item) => sum + item.spent + item.committed, 0);
        $("#budgetTotals").textContent = budgets.length ? `${Core.formatMoney(used)} usado o comprometido de ${Core.formatMoney(planned)}` : "Sin presupuesto para este mes";
        const budgetCards = budgets.map(item => `<article class="finance-list-card ${item.alert ? "budget-alert" : ""}"><span class="category-dot" style="background:${escapeHTML(state.data.categories.find(category => category.id === item.category_id)?.color || "#2563eb")}">${escapeHTML(state.data.categories.find(category => category.id === item.category_id)?.icon || "●")}</span><span class="finance-list-copy"><strong>${escapeHTML(categoryName(item.category_id))}</strong><small>Gastado ${Core.formatMoney(item.spent)} · comprometido ${Core.formatMoney(item.committed)} · proyección ${Core.formatMoney(item.projection)}</small><progress max="100" value="${Math.min(item.percent, 100)}"></progress></span><span class="movement-side"><strong>${Core.formatMoney(item.available)}</strong><small>${item.percent}%</small><span class="list-actions"><button type="button" data-simple-edit="budget" data-id="${item.id}"${state.activeContext === "general" ? " disabled" : ""}>Editar</button><button type="button" data-entity="budgets" data-action="archive" data-id="${item.id}"${state.activeContext === "general" ? " disabled" : ""}>Archivar</button></span></span></article>`);
        const archivedBudgetCards = scoped(state.data.budgets).filter(item => item.month === state.activeMonth && item.status === "archived").map(item => `<article class="finance-list-card archived"><span class="finance-list-copy"><strong>${escapeHTML(categoryName(item.category_id))}</strong><small>Presupuesto archivado · ${Core.formatMoney(item.planned_amount)}</small></span><span class="list-actions"><button type="button" data-entity="budgets" data-action="restore" data-id="${item.id}">Reactivar</button></span></article>`);
        $("#budgetsList").innerHTML = emptyOr([...budgetCards, ...archivedBudgetCards].join(""));
        const goals = scoped(state.data.goals);
        $("#goalsList").innerHTML = emptyOr(goals.map(item => {
            const progress = Domain.goalProgress(item, state.data.goalEntries, `${state.activeMonth}-31`);
            const entries = state.data.goalEntries.filter(entry => entry.goal_id === item.id).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
            return `<article class="finance-account-card ${item.status}"><span class="status-badge">${item.status === "archived" ? "Archivada" : `${progress.percent}%`}</span><h3>${escapeHTML(item.name)}</h3><small>${item.target_date ? `Meta ${formatDate(item.target_date)}` : "Sin fecha límite"}</small><div class="account-balance">${Core.formatMoney(progress.saved)}</div><progress max="100" value="${progress.percent}"></progress><small>Faltan ${Core.formatMoney(progress.remaining)} de ${Core.formatMoney(item.target_amount)}</small><div class="mini-history">${entries.slice(0, 5).map(entry => `<button type="button" data-simple-edit="goalEntry" data-id="${entry.id}">${formatDate(entry.occurred_on)} · ${entry.entry_type === "withdrawal" ? "Retiro" : "Aporte"} ${Core.formatMoney(entry.amount)}</button>`).join("")}</div><div class="account-card-actions"><button type="button" data-goal-entry="${item.id}" data-entry-type="contribution"${item.status === "archived" ? " disabled" : ""}>Aportar</button><button type="button" data-goal-entry="${item.id}" data-entry-type="withdrawal"${item.status === "archived" ? " disabled" : ""}>Retirar</button><button type="button" data-simple-edit="goal" data-id="${item.id}">Editar</button><button type="button" data-entity="goals" data-action="${item.status === "archived" ? "restore" : "archive"}" data-id="${item.id}">${item.status === "archived" ? "Reactivar" : "Archivar"}</button></div></article>`;
        }).join(""));
        const worth = Domain.netWorth({ ...state.data, contextId: state.activeContext, month: state.activeMonth });
        $("#netWorthSummary").innerHTML = `<div><span>Activos</span><strong>${Core.formatMoney(worth.assets)}</strong></div><div><span>Pasivos</span><strong>${Core.formatMoney(worth.liabilities)}</strong></div><div><span>Patrimonio neto</span><strong>${Core.formatMoney(worth.net)}</strong></div>`;
        const assets = scoped(state.data.assets);
        $("#assetsList").innerHTML = emptyOr(assets.map(item => {
            const history = state.data.valuations.filter(value => value.asset_id === item.id).sort((a, b) => b.valued_on.localeCompare(a.valued_on));
            const latest = history.find(value => value.valued_on <= `${state.activeMonth}-31`);
            return `<article class="finance-account-card ${item.status}"><span class="account-type-badge">${item.asset_class === "asset" ? "Activo" : "Pasivo"}${item.status === "archived" ? " · archivado" : ""}</span><h3>${escapeHTML(item.name)}</h3><small>Valuación ${formatDate(latest?.valued_on || item.valued_on)} · manual</small><div class="account-balance">${Core.formatMoney(latest?.value ?? item.opening_value)}</div><div class="mini-history">${history.slice(0, 5).map(value => `<button type="button" data-simple-edit="valuation" data-id="${value.id}">${formatDate(value.valued_on)} · ${Core.formatMoney(value.value)}</button>`).join("")}</div><div class="account-card-actions"><button type="button" data-simple-edit="asset" data-id="${item.id}">Editar</button><button type="button" data-asset-valuation="${item.id}"${item.status === "archived" ? " disabled" : ""}>Valuar</button><button type="button" data-entity="assets" data-action="${item.status === "archived" ? "restore" : "archive"}" data-id="${item.id}">${item.status === "archived" ? "Reactivar" : "Archivar"}</button></div></article>`;
        }).join(""));
    }

    function renderEntityLists() {
        const contexts = state.data.contexts || [];
        $("#contextsList").innerHTML = emptyOr(contexts.map(item => `<div class="finance-list-card"><span class="finance-list-icon">${item.kind === "personal" ? "●" : "◆"}</span><span class="finance-list-copy"><strong>${escapeHTML(item.name)}</strong><small>${item.kind === "personal" ? "Personal obligatorio" : escapeHTML(item.description || "Emprendimiento")}</small></span><span class="list-actions"><button type="button" data-simple-edit="context" data-id="${item.id}">Editar</button>${item.kind !== "personal" ? `<button type="button" data-entity="contexts" data-action="${item.status === "active" ? "archive" : "restore"}" data-id="${item.id}">${item.status === "active" ? "Archivar" : "Reactivar"}</button>` : ""}</span></div>`).join(""));
        const search = Core.searchText(state.search);
        const categories = scoped(state.data.categories).filter(item => !search || Core.searchText(item.name).includes(search));
        $("#categoriesList").innerHTML = emptyOr(categories.map(item => `<div class="finance-list-card"><span class="category-dot" style="background:${escapeHTML(item.color)}">${escapeHTML(item.icon)}</span><span class="finance-list-copy"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.flow_type)} · ${escapeHTML(contextName(item.context_id))}</small></span><span class="list-actions"><button type="button" data-simple-edit="category" data-id="${item.id}">Editar</button><button type="button" data-entity="categories" data-action="${item.status === "active" ? "archive" : "restore"}" data-id="${item.id}">${item.status === "active" ? "Archivar" : "Reactivar"}</button></span></div>`).join(""));
        const methods = scoped(state.data.paymentMethods);
        $("#paymentMethodsList").innerHTML = emptyOr(methods.map(item => `<div class="finance-list-card"><span class="finance-list-icon">₲</span><span class="finance-list-copy"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(Core.PAYMENT_METHOD_TYPES.find(type => type.value === item.method_type)?.label || item.method_type)}${item.account_id ? ` · ${escapeHTML(accountName(item.account_id))}` : ""}</small></span><span class="list-actions"><button type="button" data-simple-edit="paymentMethod" data-id="${item.id}">Editar</button><button type="button" data-entity="paymentMethods" data-action="${item.status === "active" ? "archive" : "restore"}" data-id="${item.id}">${item.status === "active" ? "Archivar" : "Reactivar"}</button></span></div>`).join(""));
        const audit = scoped(state.data.auditLog).sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at))).slice(0, 100);
        $("#auditLogList").innerHTML = emptyOr(audit.map(item => {
            const beforeVersion = item.before_value?.version;
            const afterVersion = item.after_value?.version;
            const version = beforeVersion && afterVersion ? ` · v${beforeVersion} → v${afterVersion}` : afterVersion ? ` · v${afterVersion}` : "";
            const occurred = item.occurred_at ? new Intl.DateTimeFormat("es-PY", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.occurred_at)) : "Sin fecha";
            return `<div class="finance-list-card"><span class="finance-list-icon">✓</span><span class="finance-list-copy"><strong>${escapeHTML(item.action)} · ${escapeHTML(String(item.entity_type || "registro").replace("finance_", ""))}</strong><small>${escapeHTML(occurred)}${escapeHTML(version)} · usuario ${escapeHTML(String(item.actor_id || "sistema").slice(0, 8))}</small><small>${escapeHTML(item.reason || (item.session_id ? `Sesión ${String(item.session_id).slice(0, 12)}` : "Cambio registrado por el servidor"))}</small></span></div>`;
        }).join(""));
    }

    function renderCloseAndReports() {
        const contextId = currentContextId();
        const closes = contextId ? state.data.monthlyCloses.filter(item => item.context_id === contextId && item.month === state.activeMonth).sort((a, b) => Number(b.version_number) - Number(a.version_number)) : [];
        const latest = closes[0];
        const closed = latest?.state === "closed";
        $("#closeStateTitle").textContent = !contextId ? "Elegí un contexto" : closed ? `Cierre v${latest.version_number}` : "Mes abierto";
        $("#closeStateBadge").textContent = closed ? "Cerrado" : "Abierto";
        $("#closeStateBadge").dataset.state = closed ? "closed" : "open";
        const snapshot = contextId ? Domain.closeSnapshot(state.data, contextId, state.activeMonth) : null;
        if (snapshot) {
            const budget = snapshot.budgets.reduce((sum, item) => sum + item.available, 0);
            const payable = snapshot.payable;
            const receivable = snapshot.receivable;
            $("#closePreview").innerHTML = `<div class="report-metrics"><div><span>Resultado</span><strong>${Core.formatMoney(snapshot.summary.result)}</strong></div><div><span>Flujo disponible</span><strong>${Core.formatMoney(snapshot.summary.available)}</strong></div><div><span>Presupuesto libre</span><strong>${Core.formatMoney(budget)}</strong></div><div><span>Patrimonio</span><strong>${Core.formatMoney(snapshot.net_worth.net)}</strong></div></div><div class="report-lines"><p><span>Deudas y pagos pendientes</span><strong>${Core.formatMoney(payable)}</strong></p><p><span>Cobranzas pendientes</span><strong>${Core.formatMoney(receivable)}</strong></p><p><span>Movimientos del mes</span><strong>${snapshot.counts.transactions}</strong></p></div>${closes.length > 1 ? `<p>${closes.length} versiones conservadas.</p>` : ""}`;
        } else {
            $("#closePreview").innerHTML = `<p>La vista General es informativa; el cierre se realiza por contexto.</p>`;
        }
        $("#openCloseDialog").textContent = closed ? "Reabrir con motivo" : "Cerrar mes";
        $("#openCloseDialog").disabled = !contextId;
        const current = Core.financialSummary({ accounts: state.data.accounts, transactions: state.data.transactions, contextId: state.activeContext, month: state.activeMonth });
        const previousMonth = Domain.addMonths(state.activeMonth, -1);
        const previous = Core.financialSummary({ accounts: state.data.accounts, transactions: state.data.transactions, contextId: state.activeContext, month: previousMonth });
        const change = (a, b) => b ? Math.round((a - b) / Math.abs(b) * 100) : a ? 100 : 0;
        $("#monthComparison").innerHTML = `<div class="comparison-row"><span>Ingresos</span><strong>${Core.formatMoney(current.income)}</strong><small>${change(current.income, previous.income)}%</small></div><div class="comparison-row"><span>Gastos</span><strong>${Core.formatMoney(current.expense)}</strong><small>${change(current.expense, previous.expense)}%</small></div><div class="comparison-row"><span>Resultado</span><strong>${Core.formatMoney(current.result)}</strong><small>${change(current.result, previous.result)}%</small></div><p>Comparado con ${Core.formatMonth(previousMonth)}.</p>`;
    }

    function renderMigration() {
        const preview = state.migrationPreview;
        const latest = [...(state.data.migrationRuns || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        $("#migrationBadge").textContent = latest ? (latest.state === "completed" ? "Importada" : latest.state) : preview ? "Analizada" : "Sin revisar";
        $("#migrationPreview").hidden = !preview;
        if (preview) $("#migrationPreview").innerHTML = `<div><span>Movimientos</span><strong>${preview.counts.transactions}</strong></div><div><span>Compromisos</span><strong>${preview.counts.obligations}</strong></div><div><span>Pagos</span><strong>${preview.counts.payments}</strong></div><div><span>Errores</span><strong>${preview.counts.errors}</strong></div>`;
        $("#openMigration").hidden = !preview?.canImport;
        $("#downloadMigrationErrors").hidden = !(latest?.error_count > 0);
        $("#downloadMigrationErrors").dataset.runId = latest?.id || "";
    }

    function renderConflicts() {
        const count = state.data.conflicts?.length || 0;
        const notice = $("#financeConflictNotice");
        notice.hidden = !count;
        notice.innerHTML = count ? `${count} conflicto${count === 1 ? "" : "s"} requiere${count === 1 ? "" : "n"} decisión. <button type="button" data-action="open-conflict">Resolver</button>` : "";
    }

    function renderViews() {
        $$('[data-finance-view]').forEach(view => { view.hidden = view.dataset.financeView !== state.activeView; view.classList.toggle("active", !view.hidden); });
        $$('[data-finance-nav]').forEach(button => button.classList.toggle("active", button.dataset.financeNav === state.activeView));
    }

    function renderAll() {
        renderScope(); renderSummary(); renderHome(); renderMovements(); renderAccounts(); renderCommitments(); renderPlanning(); renderEntityLists(); renderCloseAndReports(); renderMigration(); renderConflicts(); renderViews();
    }

    function setView(view) {
        state.activeView = ["home", "movements", "accounts", "commitments", "planning", "more"].includes(view) ? view : "home";
        renderViews();
        window.scrollTo?.({ top: 0, behavior: "smooth" });
    }

    function openDialog(dialog) { if (dialog && !dialog.open) dialog.showModal(); }
    function closeDialog(dialog) { if (dialog?.open) dialog.close(); }
    function activeOptions() {
        const contextId = currentContextId();
        return {
            accounts: state.data.accounts.filter(item => item.context_id === contextId && item.status === "active"),
            categories: state.data.categories.filter(item => item.context_id === contextId && item.status === "active"),
            methods: state.data.paymentMethods.filter(item => item.context_id === contextId && item.status === "active")
        };
    }

    function openOperation(groupId = null) {
        if (!assertConcreteContext()) return;
        const group = groupId ? state.data.transactions.filter(item => item.operation_group_id === groupId || item.id === groupId) : [];
        const record = group.find(item => item.operation_leg === "source") || group.find(item => Number(item.balance_delta) < 0) || group[0];
        const credit = group.find(item => item.operation_leg === "destination") || group.find(item => item.id !== record?.id);
        const sets = activeOptions();
        $("#operationForm").reset();
        $("#operationId").value = record?.id || "";
        $("#operationGroupId").value = record?.operation_group_id || "";
        $("#operationKind").innerHTML = Core.OPERATION_TYPES.map(item => `<option value="${item.value}">${item.label}</option>`).join("");
        $("#operationKind").value = record?.operation_kind || "expense";
        $("#operationStatus").value = record?.status === "pending" ? "pending" : "confirmed";
        $("#operationDirection").value = Number(record?.balance_delta || 0) > 0 ? "income" : "expense";
        $("#operationAccount").innerHTML = options(sets.accounts, record?.account_id, { empty: null });
        $("#operationDestination").innerHTML = options(sets.accounts, credit?.account_id, { empty: "Elegir destino" });
        $("#operationCategory").innerHTML = options(sets.categories, record?.category_id, { empty: "Sin categoría" });
        $("#operationMethod").innerHTML = options(sets.methods, record?.payment_method_id, { empty: "Sin medio" });
        $("#operationAmount").value = record?.amount || "";
        $("#operationDate").value = record?.occurred_at ? String(record.occurred_at).slice(0, 16) : localDateTime();
        $("#operationCounterparty").value = record?.counterparty || "";
        $("#operationDescription").value = record?.description || "";
        $("#operationTags").value = record?.tags?.join(", ") || "";
        $("#operationNote").value = record?.note || "";
        $("#operationDialogTitle").textContent = record ? "Editar operación completa" : "Nueva operación";
        toggleOperationFields();
        openDialog($("#operationDialog"));
    }

    function toggleOperationFields() {
        const transfer = $("#operationKind").value === "transfer";
        const adjustment = $("#operationKind").value === "adjustment";
        $("#operationDestinationField").hidden = !transfer;
        $("#operationDirectionField").hidden = !adjustment;
        $("#operationDestination").required = transfer;
        $("#operationCategory").disabled = transfer;
    }

    async function saveOperation(event) {
        event.preventDefault();
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const records = await state.repository.postOperation({
                id: $("#operationId").value || undefined, operation_group_id: $("#operationGroupId").value || undefined,
                context_id: currentContextId(), operation_kind: $("#operationKind").value,
                direction: $("#operationDirection").value,
                amount: $("#operationAmount").value, account_id: $("#operationAccount").value,
                destination_account_id: $("#operationDestination").value, occurred_at: $("#operationDate").value,
                category_id: $("#operationCategory").value || null, payment_method_id: $("#operationMethod").value || null,
                counterparty: $("#operationCounterparty").value, description: $("#operationDescription").value,
                tags: $("#operationTags").value, note: $("#operationNote").value, status: $("#operationStatus").value
            });
            const file = $("#operationReceipt").files[0];
            if (file) await state.repository.attachFile({ file, context_id: currentContextId(), transaction_id: records[0].id });
            closeDialog($("#operationDialog"));
            await refresh();
            notify(records.length === 2 ? "Transferencia guardada en ambos lados." : "Operación guardada.");
        } catch (error) { notify(error.message, "warning"); }
        finally { button.disabled = false; }
    }

    function openObligation(id = null) {
        if (!assertConcreteContext()) return;
        const record = state.data.obligations.find(item => item.id === id);
        const sets = activeOptions();
        $("#obligationForm").reset();
        $("#obligationId").value = record?.id || "";
        $("#obligationType").innerHTML = Domain.OBLIGATION_TYPES.map(item => `<option value="${item.value}">${item.label}</option>`).join("");
        $("#obligationType").value = record?.obligation_type || "payable";
        $("#obligationName").value = record?.name || ""; $("#obligationCounterparty").value = record?.counterparty || "";
        $("#obligationAmount").value = record?.principal_amount || ""; $("#obligationInterest").value = record?.interest_amount || 0; $("#obligationSurcharge").value = record?.surcharge_amount || 0; $("#obligationDueDate").value = record?.due_date || localDate();
        $("#obligationCategory").innerHTML = options(sets.categories, record?.category_id, { empty: "Sin categoría" });
        $("#obligationAccount").innerHTML = options(sets.accounts, record?.account_id, { empty: "Sin cuenta asociada" });
        $("#installmentNumber").value = record?.installment_number || ""; $("#installmentTotal").value = record?.installment_total || "";
        $("#obligationReminderDays").value = record?.reminder_days ?? 3; $("#obligationNote").value = record?.note || "";
        $("#obligationDialogTitle").textContent = record ? "Editar compromiso" : "Nuevo compromiso";
        toggleInstallments(); openDialog($("#obligationDialog"));
    }

    function toggleInstallments() {
        const type = $("#obligationType").value;
        const visible = type === "installment";
        $("#installmentFields").hidden = !visible;
        $("#installmentNumber").required = visible;
        $("#installmentTotal").required = visible;
        if (visible && !$("#installmentNumber").value) $("#installmentNumber").value = 1;
        const accountSelect = $("#obligationAccount");
        const selected = accountSelect.value;
        const restricted = ["loan", "card"].includes(type);
        const accounts = activeOptions().accounts.filter(item => !restricted || ["credit_card", "liability"].includes(item.account_type));
        accountSelect.innerHTML = options(accounts, accounts.some(item => item.id === selected) ? selected : "", { empty: type === "card" ? "Elegí la tarjeta o pasivo" : "Sin cuenta asociada" });
        accountSelect.required = type === "card";
    }

    async function saveObligation(event) {
        event.preventDefault();
        const id = $("#obligationId").value;
        const existing = state.data.obligations.find(item => item.id === id);
        try {
            const input = {
                ...existing, id: id || undefined, context_id: currentContextId(), obligation_type: $("#obligationType").value,
                name: $("#obligationName").value, counterparty: $("#obligationCounterparty").value,
                principal_amount: $("#obligationAmount").value, interest_amount: $("#obligationInterest").value,
                surcharge_amount: $("#obligationSurcharge").value, paid_amount: existing?.paid_amount || 0,
                due_date: $("#obligationDueDate").value, category_id: $("#obligationCategory").value || null,
                account_id: $("#obligationAccount").value || null, installment_number: $("#installmentNumber").value || null,
                installment_total: $("#installmentTotal").value || null, reminder_days: $("#obligationReminderDays").value,
                note: $("#obligationNote").value, status: existing?.status || "pending"
            };
            let created = 1;
            if (!existing && input.obligation_type === "installment") {
                const first = Number(input.installment_number);
                const total = Number(input.installment_total);
                created = 0;
                for (let number = first; number <= total; number += 1) {
                    const dueMonth = Domain.addMonths(Domain.monthOf(input.due_date), number - first);
                    const dueDay = String(Math.min(Number(input.due_date.slice(8, 10)), new Date(Number(dueMonth.slice(0, 4)), Number(dueMonth.slice(5, 7)), 0).getDate())).padStart(2, "0");
                    await state.repository.save("obligations", { ...input, id: undefined, name: `${input.name} · cuota ${number}/${total}`, installment_number: number, due_date: `${dueMonth}-${dueDay}` });
                    created += 1;
                }
            } else {
                await state.repository.save("obligations", input);
            }
            closeDialog($("#obligationDialog")); await refresh(); notify(existing ? "Compromiso actualizado." : "Compromiso creado.");
            if (!existing && created > 1) notify(`${created} cuotas creadas con vencimientos mensuales independientes.`);
        } catch (error) { notify(error.message, "warning"); }
    }

    function openPayment(id, paymentId = null) {
        const obligation = state.data.obligations.find(item => item.id === id);
        if (!obligation) return;
        const payment = paymentId ? state.data.payments.find(item => item.id === paymentId) : null;
        const sets = activeOptions(); const remaining = Domain.obligationTotal(obligation) - Number(obligation.paid_amount) + Number(payment?.amount || 0);
        $("#paymentForm").reset(); $("#paymentId").value = payment?.id || ""; $("#paymentObligationId").value = id;
        $("#paymentDialogTitle").textContent = payment ? `Corregir ${obligation.direction === "receivable" ? "cobro" : "pago"}` : obligation.direction === "receivable" ? `Cobrar ${obligation.name}` : `Pagar ${obligation.name}`;
        $("#paymentBalanceCopy").textContent = `${payment ? "Máximo corregido" : "Saldo pendiente"}: ${Core.formatMoney(remaining)}.`;
        $("#paymentAmount").value = payment?.amount || remaining; $("#paymentAmount").max = remaining; $("#paymentDate").value = payment?.paid_on || localDate();
        const debtPayment = ["loan", "card"].includes(obligation.obligation_type);
        const suggestedAccount = payment?.account_id || (debtPayment
            ? sets.accounts.find(item => !["credit_card", "liability"].includes(item.account_type) && item.id !== obligation.account_id)?.id
            : obligation.account_id) || sets.accounts.find(item => item.id !== obligation.account_id)?.id;
        $("#paymentAccount").innerHTML = options(sets.accounts.filter(item => !debtPayment || item.id !== obligation.account_id), suggestedAccount, { empty: null });
        $("#paymentMethod").innerHTML = options(sets.methods, payment?.payment_method_id, { empty: "Sin medio" });
        $("#paymentReference").value = payment?.reference || ""; $("#paymentNote").value = payment?.note || "";
        openDialog($("#paymentDialog"));
    }

    async function savePayment(event) {
        event.preventDefault();
        try {
            const input = { id: $("#paymentId").value || undefined, obligation_id: $("#paymentObligationId").value, amount: $("#paymentAmount").value, paid_on: $("#paymentDate").value, account_id: $("#paymentAccount").value, payment_method_id: $("#paymentMethod").value || null, reference: $("#paymentReference").value, note: $("#paymentNote").value };
            const result = input.id ? await state.repository.updatePayment(input) : await state.repository.payObligation(input);
            const file = $("#paymentReceipt").files[0];
            if (file) await state.repository.attachFile({ file, context_id: result.payment.context_id, payment_id: result.payment.id });
            closeDialog($("#paymentDialog")); await refresh(); notify(input.id ? "Pago corregido y auditado." : "Pago o cobro aplicado sin duplicar el resultado.");
        } catch (error) { notify(error.message, "warning"); }
    }

    const simpleConfigs = {
        context: { entity: "contexts", title: "Contexto financiero", kicker: "CONTEXTO", fields: record => `<label class="field"><span>Nombre</span><input name="name" maxlength="80" required value="${escapeHTML(record?.name || "")}"></label><label class="field"><span>Descripción</span><textarea name="description" maxlength="500">${escapeHTML(record?.description || "")}</textarea></label>` },
        account: { entity: "accounts", title: "Cuenta", kicker: "CUENTA", fields: record => `<label class="field"><span>Nombre</span><input name="name" maxlength="80" required value="${escapeHTML(record?.name || "")}"></label><label class="field"><span>Tipo</span><select name="account_type">${Core.ACCOUNT_TYPES.map(item => `<option value="${item.value}"${record?.account_type === item.value ? " selected" : ""}>${item.label}</option>`).join("")}</select></label><label class="field"><span>Saldo inicial PYG</span><input name="opening_balance" type="number" step="1" required value="${record?.opening_balance ?? 0}"></label><label class="field"><span>Fecha de apertura</span><input name="opened_on" type="date" required value="${record?.opened_on || localDate()}"></label><label class="field"><span>Notas</span><textarea name="notes" maxlength="500">${escapeHTML(record?.notes || "")}</textarea></label>` },
        category: { entity: "categories", title: "Categoría", kicker: "CATEGORÍA", fields: record => `<label class="field"><span>Nombre</span><input name="name" maxlength="80" required value="${escapeHTML(record?.name || "")}"></label><label class="field"><span>Uso</span><select name="flow_type">${Core.FLOW_TYPES.map(item => `<option value="${item.value}"${record?.flow_type === item.value ? " selected" : ""}>${item.label}</option>`).join("")}</select></label><label class="field"><span>Categoría superior</span><select name="parent_id">${options(activeOptions().categories.filter(item => !item.parent_id && item.id !== record?.id), record?.parent_id, { empty: "Ninguna" })}</select></label><div class="category-appearance"><label class="field"><span>Color</span><input name="color" type="color" value="${record?.color || "#2563eb"}"></label><label class="field"><span>Icono</span><input name="icon" maxlength="12" value="${escapeHTML(record?.icon || "●")}"></label></div>` },
        paymentMethod: { entity: "paymentMethods", title: "Medio de pago", kicker: "MEDIO", fields: record => `<label class="field"><span>Nombre</span><input name="name" maxlength="80" required value="${escapeHTML(record?.name || "")}"></label><label class="field"><span>Tipo</span><select name="method_type">${Core.PAYMENT_METHOD_TYPES.map(item => `<option value="${item.value}"${record?.method_type === item.value ? " selected" : ""}>${item.label}</option>`).join("")}</select></label><label class="field"><span>Cuenta vinculada</span><select name="account_id">${options(activeOptions().accounts, record?.account_id, { empty: "Ninguna" })}</select></label><label class="field"><span>Notas</span><textarea name="notes">${escapeHTML(record?.notes || "")}</textarea></label>` },
        recurrence: { entity: "recurrences", title: "Recurrencia", kicker: "RECURRENCIA", fields: record => `<label class="field"><span>Nombre</span><input name="name" maxlength="120" required value="${escapeHTML(record?.name || "")}"></label><label class="field"><span>Frecuencia</span><select name="frequency">${Domain.FREQUENCIES.filter(item => item.value !== "once").map(item => `<option value="${item.value}"${record?.frequency === item.value ? " selected" : ""}>${item.label}</option>`).join("")}</select></label><label class="field"><span>Primera fecha</span><input name="starts_on" type="date" required value="${record?.starts_on || localDate()}"></label><label class="field"><span>Fecha final opcional</span><input name="ends_on" type="date" value="${record?.ends_on || ""}"></label><label class="field"><span>Importe PYG</span><input name="template_amount" type="number" min="1" required value="${record?.template?.principal_amount || ""}"></label><label class="field"><span>Tipo de compromiso</span><select name="template_obligation_type">${Domain.OBLIGATION_TYPES.map(item => `<option value="${item.value}"${record?.template?.obligation_type === item.value ? " selected" : ""}>${item.label}</option>`).join("")}</select></label><label class="field"><span>Contraparte</span><input name="template_counterparty" maxlength="120" value="${escapeHTML(record?.template?.counterparty || "")}"></label>` },
        budget: { entity: "budgets", title: "Presupuesto mensual", kicker: "PRESUPUESTO", fields: record => `<label class="field"><span>Mes</span><input name="month" type="month" required value="${record?.month || state.activeMonth}"></label><label class="field"><span>Categoría</span><select name="category_id" required>${options(activeOptions().categories.filter(item => ["expense", "both"].includes(item.flow_type)), record?.category_id, { empty: null })}</select></label><label class="field"><span>Importe planificado PYG</span><input name="planned_amount" type="number" min="1" required value="${record?.planned_amount || ""}"></label><label class="field"><span>Alertar al porcentaje</span><input name="alert_percent" type="number" min="1" max="100" value="${record?.alert_percent || 80}"></label><label class="field"><span>Notas</span><textarea name="notes">${escapeHTML(record?.notes || "")}</textarea></label>` },
        goal: { entity: "goals", title: "Meta de ahorro", kicker: "META", fields: record => `<label class="field"><span>Nombre</span><input name="name" maxlength="120" required value="${escapeHTML(record?.name || "")}"></label><label class="field"><span>Objetivo PYG</span><input name="target_amount" type="number" min="1" required value="${record?.target_amount || ""}"></label><label class="field"><span>Fecha objetivo</span><input name="target_date" type="date" value="${record?.target_date || ""}"></label><label class="field"><span>Cuenta asociada</span><select name="account_id">${options(activeOptions().accounts, record?.account_id, { empty: "Ninguna" })}</select></label><label class="field"><span>Notas</span><textarea name="notes">${escapeHTML(record?.notes || "")}</textarea></label>` },
        goalEntry: { entity: "goalEntries", title: "Movimiento de meta", kicker: "AHORRO", fields: record => `<input name="goal_id" type="hidden" value="${escapeHTML(record.goal_id)}"><input name="entry_type" type="hidden" value="${escapeHTML(record.entry_type)}"><p>${record.entry_type === "withdrawal" ? "Retiro" : "Aporte"} en ${escapeHTML(state.data.goals.find(item => item.id === record.goal_id)?.name || "meta")}</p><label class="field"><span>Importe PYG</span><input name="amount" type="number" min="1" required value="${record.amount || ""}"></label><label class="field"><span>Fecha</span><input name="occurred_on" type="date" required value="${record.occurred_on || localDate()}"></label><label class="field"><span>Nota</span><textarea name="note">${escapeHTML(record.note || "")}</textarea></label>` },
        asset: { entity: "assets", title: "Activo o pasivo", kicker: "PATRIMONIO", fields: record => `<label class="field"><span>Clase</span><select name="asset_class"><option value="asset"${record?.asset_class !== "liability" ? " selected" : ""}>Activo</option><option value="liability"${record?.asset_class === "liability" ? " selected" : ""}>Pasivo</option></select></label><label class="field"><span>Tipo</span><select name="asset_type">${Domain.ASSET_TYPES.map(item => `<option value="${item.value}"${record?.asset_type === item.value ? " selected" : ""}>${item.label}</option>`).join("")}</select></label><label class="field"><span>Nombre</span><input name="name" maxlength="120" required value="${escapeHTML(record?.name || "")}"></label><label class="field"><span>Valor inicial PYG</span><input name="opening_value" type="number" min="1" required value="${record?.opening_value || ""}"></label><label class="field"><span>Fecha de valuación</span><input name="valued_on" type="date" required value="${record?.valued_on || localDate()}"></label><label class="field"><span>Notas</span><textarea name="notes">${escapeHTML(record?.notes || "")}</textarea></label>` },
        valuation: { entity: "valuations", title: "Valuación", kicker: "VALUACIÓN MANUAL", fields: record => `<input name="asset_id" type="hidden" value="${escapeHTML(record.asset_id)}"><label class="field"><span>Valor PYG</span><input name="value" type="number" min="0" required value="${record.value ?? ""}"></label><label class="field"><span>Fecha</span><input name="valued_on" type="date" required value="${record.valued_on || localDate()}"></label><label class="field"><span>Fuente</span><input name="source" maxlength="120" value="${escapeHTML(record.source || "Manual")}"></label><label class="field"><span>Nota</span><textarea name="note">${escapeHTML(record.note || "")}</textarea></label>` },
        savedFilter: { entity: "savedFilters", title: "Guardar filtro", kicker: "FILTRO", fields: record => `<label class="field"><span>Nombre</span><input name="name" maxlength="80" required value="${escapeHTML(record.name || "")}"></label>` }
    };

    function openSimple(type, record = null) {
        if (type !== "context" && !assertConcreteContext()) return;
        const config = simpleConfigs[type]; if (!config) return;
        $("#simpleForm").reset(); $("#simpleEntity").value = type; $("#simpleId").value = record?.id || "";
        $("#simpleTitle").textContent = `${record?.id ? "Editar" : "Nuevo"} ${config.title.toLowerCase()}`; $("#simpleKicker").textContent = config.kicker;
        $("#simpleFields").innerHTML = config.fields(record || {}); openDialog($("#simpleDialog"));
    }

    async function saveSimple(event) {
        event.preventDefault();
        const type = $("#simpleEntity").value; const config = simpleConfigs[type]; const id = $("#simpleId").value;
        const existing = id ? state.data[config.entity].find(item => item.id === id) : null;
        const values = Object.fromEntries(new FormData(event.currentTarget).entries());
        try {
            let input = { ...existing, ...values, id: id || undefined, context_id: existing?.context_id || currentContextId() };
            if (type === "context") input = { ...input, kind: existing?.kind || "business", context_id: undefined };
            if (type === "recurrence") input = { ...input, template_type: "obligation", next_on: existing?.next_on || values.starts_on, interval_count: 1, template: { ...existing?.template, name: values.name, principal_amount: values.template_amount, obligation_type: values.template_obligation_type, counterparty: values.template_counterparty, due_date: values.starts_on, paid_amount: 0, status: "pending" } };
            let saved;
            if (type === "goalEntry") saved = await state.repository.addGoalEntry(input); else if (type === "savedFilter") input.filters = existing?.filters || currentMovementFilter();
            if (type !== "goalEntry") saved = await state.repository.save(config.entity, input);
            if (type === "context" && !existing) {
                for (const category of Core.defaultCategories(saved.id, state.repository.options())) await state.repository.save("categories", category);
            }
            closeDialog($("#simpleDialog")); await refresh({ render: false });
            if (type === "context" && !existing) await selectContext(saved.id); else renderAll();
            notify("Registro guardado.");
        } catch (error) { notify(error.message, "warning"); }
    }

    function currentMovementFilter() { return { type: state.movementType, account: $("#movementAccountFilter").value, category: $("#movementCategoryFilter").value, method: $("#movementMethodFilter").value, status: $("#movementStatusFilter").value, dateFrom: state.movementDateFrom, dateTo: state.movementDateTo, search: state.search }; }
    function applySavedFilter(id) { const item = state.data.savedFilters.find(filter => filter.id === id); if (!item) return; state.movementType = item.filters.type || ""; state.movementDateFrom = item.filters.dateFrom || ""; state.movementDateTo = item.filters.dateTo || ""; state.search = item.filters.search || ""; renderAll(); $("#movementAccountFilter").value = item.filters.account || ""; $("#movementCategoryFilter").value = item.filters.category || ""; $("#movementMethodFilter").value = item.filters.method || ""; $("#movementStatusFilter").value = item.filters.status || ""; renderMovements(); }

    async function archiveEntity(entity, id, restore) {
        if (entity !== "contexts" && !assertConcreteContext()) return;
        try { if (!restore && !confirm("¿Archivar este registro? Seguirá en el historial.")) return; await state.repository.archive(entity, id, !restore); await refresh(); notify(restore ? "Registro reactivado." : "Registro archivado."); } catch (error) { notify(error.message, "warning"); }
    }

    async function voidOperation(id) { const reason = prompt("Motivo obligatorio de anulación:"); if (!reason) return; try { await state.repository.voidOperation(id, reason); await refresh(); notify("Movimiento anulado y auditado."); } catch (error) { notify(error.message, "warning"); } }
    async function deletePendingOperation(id) { if (!confirm("¿Eliminar este borrador pendiente? Esta acción quita el registro sin afectar saldos.")) return; try { await state.repository.deletePendingOperation(id); await refresh(); notify("Borrador eliminado."); } catch (error) { notify(error.message, "warning"); } }
    async function voidPayment(id) {
        const payment = state.data.payments.find(item => item.id === id);
        const reason = prompt("Motivo obligatorio de anulación del pago o cobro:");
        if (!payment || !reason) return;
        try {
            await state.repository.updatePayment({ ...payment, status: "void", void_reason: reason });
            await refresh();
            notify("Pago anulado; el saldo del compromiso fue recalculado.");
        } catch (error) { notify(error.message, "warning"); }
    }
    async function removeAttachment(id) { if (!confirm("¿Quitar este comprobante privado?")) return; try { await state.repository.removeAttachment(id); await refresh(); notify("Comprobante quitado."); } catch (error) { notify(error.message, "warning"); } }
    async function voidObligation(id) { const record = state.data.obligations.find(item => item.id === id); const reason = prompt("Motivo obligatorio de anulación:"); if (!record || !reason) return; try { await state.repository.save("obligations", { ...record, status: "void", void_reason: reason }); await refresh(); notify("Compromiso anulado."); } catch (error) { notify(error.message, "warning"); } }

    async function copyBudgets() {
        if (!assertConcreteContext()) return;
        const rows = state.data.budgets.filter(item => item.context_id === currentContextId() && item.month === state.activeMonth && item.status === "active");
        if (!rows.length) return notify("No hay presupuestos para copiar.", "warning");
        const target = Domain.addMonths(state.activeMonth, 1);
        if (!confirm(`¿Copiar ${rows.length} presupuesto(s) a ${Core.formatMonth(target)}?`)) return;
        let created = 0;
        for (const row of rows) {
            if (state.data.budgets.some(item => item.context_id === row.context_id && item.category_id === row.category_id && item.month === target && item.status === "active")) continue;
            await state.repository.save("budgets", { ...row, id: undefined, created_at: undefined, month: target, version: 1 }); created += 1;
        }
        await refresh(); notify(`${created} presupuesto(s) copiado(s); los existentes no se duplicaron.`);
    }

    function downloadBlob(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    function exportRows() { return filteredTransactions().map(item => ({ Fecha: String(item.occurred_at).slice(0, 16), Tipo: item.operation_kind, Estado: item.status, Cuenta: accountName(item.account_id), Categoría: categoryName(item.category_id), Medio: methodName(item.payment_method_id), Descripción: item.description, Contraparte: item.counterparty, Etiquetas: (item.tags || []).join("|"), Importe_PYG: item.amount, Efecto_saldo: item.balance_delta, Efecto_resultado: item.reporting_effect })); }
    function exportCsv() { const rows = exportRows(); downloadBlob(`atlas-finanzas-${state.activeMonth}.csv`, Domain.csv(rows, Object.keys(rows[0] || { Fecha: "" }).map(key => ({ key, label: key }))), "text/csv;charset=utf-8"); }
    function exportXlsx(rows = exportRows(), name = `atlas-finanzas-${state.activeMonth}.xlsx`) { if (!window.XLSX) return notify("El exportador Excel no está disponible.", "warning"); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Finanzas"); XLSX.writeFile(book, name); }

    function monthlyReportRows() {
        const cutoff = `${state.activeMonth}-31`;
        const summary = Core.financialSummary({ accounts: state.data.accounts, transactions: state.data.transactions, contextId: state.activeContext, month: state.activeMonth });
        const worth = Domain.netWorth({ ...state.data, contextId: state.activeContext, month: state.activeMonth });
        const rows = [{ Sección: "Flujo", Indicador: "Ingresos", PYG: summary.income }, { Sección: "Flujo", Indicador: "Gastos", PYG: summary.expense }, { Sección: "Flujo", Indicador: "Resultado", PYG: summary.result }, { Sección: "Caja", Indicador: "Disponible", PYG: summary.available }, { Sección: "Patrimonio", Indicador: "Activos", PYG: worth.assets }, { Sección: "Patrimonio", Indicador: "Pasivos", PYG: worth.liabilities }, { Sección: "Patrimonio", Indicador: "Patrimonio neto", PYG: worth.net }];
        Domain.budgetSummary({ ...state.data, contextId: state.activeContext, month: state.activeMonth }).forEach(item => rows.push({ Sección: "Presupuesto", Indicador: categoryName(item.category_id), PYG: item.available }));
        scoped(state.data.obligations).filter(item => String(item.created_at || item.due_date).slice(0, 10) <= cutoff
            && !(item.status === "void" && (!item.voided_at || String(item.voided_at).slice(0, 10) <= cutoff)))
            .forEach(item => {
                const remaining = Domain.obligationTotal(item) - Domain.paidAtCutoff(item, state.data.payments, cutoff);
                if (remaining > 0) rows.push({ Sección: item.direction === "receivable" ? "Cobranzas" : "Deudas", Indicador: item.name, PYG: remaining });
            });
        return rows;
    }

    function printReport() {
        let report = $("#financePrintReport"); if (!report) { report = document.createElement("article"); report.id = "financePrintReport"; document.body.append(report); }
        report.innerHTML = `<h1>ATLAS SO · Informe financiero</h1><p>${escapeHTML(currentContextId() ? contextName(currentContextId()) : "General")} · ${escapeHTML(Core.formatMonth(state.activeMonth))} · PYG</p><table>${monthlyReportRows().map(row => `<tr><th>${escapeHTML(row.Sección)}</th><td>${escapeHTML(row.Indicador)}</td><td>${escapeHTML(Core.formatMoney(row.PYG))}</td></tr>`).join("")}</table><h2>Movimientos</h2><table><thead><tr><th>Fecha</th><th>Descripción</th><th>Cuenta</th><th>Importe</th></tr></thead><tbody>${exportRows().map(row => `<tr><td>${escapeHTML(row.Fecha)}</td><td>${escapeHTML(row.Descripción)}</td><td>${escapeHTML(row.Cuenta)}</td><td>${escapeHTML(Core.formatMoney(row.Importe_PYG))}</td></tr>`).join("")}</tbody></table><p>Generado ${escapeHTML(new Date().toLocaleString("es-PY"))}</p>`;
        document.body.classList.add("print-finance-report"); window.print(); window.setTimeout(() => document.body.classList.remove("print-finance-report"), 500);
    }

    function openClose() {
        const contextId = currentContextId(); if (!contextId) return;
        $("#closeForm").reset();
        const latest = state.data.monthlyCloses.filter(item => item.context_id === contextId && item.month === state.activeMonth).sort((a, b) => Number(b.version_number) - Number(a.version_number))[0];
        state.closeMode = latest?.state === "closed" ? "reopen" : "close";
        $("#closeDialogTitle").textContent = state.closeMode === "close" ? `Cerrar ${Core.formatMonth(state.activeMonth)}` : `Reabrir ${Core.formatMonth(state.activeMonth)}`;
        const cutoff = `${state.activeMonth}-31`;
        const closeAccounts = state.data.accounts.filter(item => item.context_id === contextId && item.opened_on <= cutoff);
        $("#closeReconciliation").innerHTML = closeAccounts.map(item => {
            const calculated = Core.accountBalance(item, state.data.transactions, cutoff);
            return `<label class="close-reconciliation-row"><span><strong>${escapeHTML(item.name)}</strong><small>Calculado ${Core.formatMoney(calculated)}</small></span><input type="number" step="1" required value="${calculated}" data-close-reported="${item.id}" data-calculated="${calculated}" aria-label="Saldo informado de ${escapeHTML(item.name)}"><output data-close-difference="${item.id}">Diferencia ${Core.formatMoney(0)}</output></label>`;
        }).join("") || EMPTY;
        $("#closeChecklist").innerHTML = CLOSE_STEPS.map((text, index) => `<label><input type="checkbox" name="closeStep" value="${index}"${state.closeMode === "reopen" ? " disabled checked" : ""}><span>${index + 1}. ${escapeHTML(text)}</span></label>`).join("");
        $("#closeReconciliationField").hidden = state.closeMode === "reopen";
        $("#reopenReasonField").hidden = state.closeMode !== "reopen"; $("#reopenReason").required = state.closeMode === "reopen";
        $("#closeObservationsField").hidden = state.closeMode === "reopen";
        $("#closeConfirmationField").hidden = state.closeMode === "reopen"; $("#closeConfirmation").checked = false;
        openDialog($("#closeDialog"));
    }

    async function submitClose(event) {
        event.preventDefault();
        try {
            const contextId = currentContextId();
            const latest = state.data.monthlyCloses.filter(item => item.context_id === contextId && item.month === state.activeMonth).sort((a, b) => Number(b.version_number) - Number(a.version_number))[0];
            if (state.closeMode === "reopen") await state.repository.reopenMonth(latest.id, $("#reopenReason").value);
            else {
                if ($$('input[name="closeStep"]:checked').length !== CLOSE_STEPS.length) throw new Error("Completá los diez controles antes de cerrar.");
                const reconciliations = $$('[data-close-reported]').map(input => {
                    const reported = Core.safeInteger(input.value, { allowNegative: true });
                    if (reported === null) throw new Error("Todos los saldos informados deben ser enteros en guaraníes.");
                    return { account_id: input.dataset.closeReported, calculated_balance: Number(input.dataset.calculated), reported_balance: reported, difference: reported - Number(input.dataset.calculated) };
                });
                await state.repository.closeMonth(contextId, state.activeMonth, state.data, $("#closeConfirmation").checked, $("#closeObservations").value, reconciliations);
            }
            closeDialog($("#closeDialog")); await refresh(); notify(state.closeMode === "reopen" ? "Mes reabierto; la versión anterior se conservó." : "Mes cerrado con fotografía inmutable.");
        } catch (error) { notify(error.message, "warning"); }
    }

    function detectMigration() { const { preview } = state.migration.readSource(); state.migrationPreview = preview; renderMigration(); notify(preview.canImport ? "Análisis terminado." : "No encontramos datos v0.9.", preview.canImport ? "success" : "warning"); }
    function updateMigrationTargets() { const contextId = $("#migrationContext").value; $("#migrationAccount").innerHTML = options(state.data.accounts.filter(item => item.context_id === contextId && item.status === "active"), "", { empty: null }); $("#migrationCategory").innerHTML = options(state.data.categories.filter(item => item.context_id === contextId && item.status === "active"), "", { empty: "Sin categoría" }); }
    function showMigrationDialog() { if (!state.migrationPreview?.canImport) return; $("#migrationForm").reset(); $("#migrationContext").innerHTML = options(concreteContexts(), currentContextId() || concreteContexts()[0]?.id, { empty: null }); updateMigrationTargets(); openDialog($("#migrationDialog")); }
    async function importMigration(event) { event.preventDefault(); try { const result = await state.migration.import({ contextId: $("#migrationContext").value, accountId: $("#migrationAccount").value, categoryId: $("#migrationCategory").value || null }); closeDialog($("#migrationDialog")); await refresh(); notify(result.repeated ? "Importación repetida sin duplicados." : "Migración completada; el origen se conservó."); } catch (error) { notify(error.message, "warning"); } }

    function showConflict() { state.activeConflict = state.data.conflicts[0] || null; if (!state.activeConflict) return; $("#conflictDetails").innerHTML = `<strong>${escapeHTML(state.activeConflict.entity)}</strong><p>Este dispositivo: versión ${Number(state.activeConflict.localRecord?.version || 0)} · Servidor: versión ${Number(state.activeConflict.serverRecord?.version || 0)}</p>`; openDialog($("#conflictDialog")); }
    async function resolveConflict(choice) { if (!state.activeConflict) return; try { await state.repository.resolveConflict(state.activeConflict.operationId, choice); state.activeConflict = null; closeDialog($("#conflictDialog")); await refresh(); notify("Conflicto resuelto."); } catch (error) { notify(error.message, "warning"); } }

    async function selectContext(id) { state.activeContext = id; state.search = ""; state.movementLimit = 250; await state.repository.storage.setMeta(state.repository.workspaceId, "activeContext", id); renderAll(); if (id !== "general") state.repository.generateRecurrences(state.activeMonth, id).then(created => created.length && refresh()).catch(error => console.warn(error.message)); }

    async function loadMovementRange() {
        if (!state.movementDateFrom || !state.movementDateTo) return renderMovements();
        if (state.movementDateFrom > state.movementDateTo) return notify("La fecha Desde no puede ser posterior a Hasta.", "warning");
        try { await state.repository.pullRange(state.movementDateFrom, state.movementDateTo); await refresh(); }
        catch (error) { notify(error.message, "warning"); }
    }

    function wireEvents() {
        document.addEventListener("click", async event => {
            const nav = event.target.closest("[data-finance-nav]"); if (nav) return setView(nav.dataset.financeNav);
            if (event.target.closest("[data-quick-open]")) return openDialog($("#quickDialog"));
            const openView = event.target.closest("[data-open-view]");
            if (openView) {
                if (openView.dataset.openView === "movements") {
                    state.movementType = openView.dataset.movementType || "";
                    renderMovements();
                }
                if (openView.dataset.openView === "commitments") {
                    state.commitmentState = openView.dataset.commitmentState || "";
                    renderCommitments();
                }
                if (openView.dataset.openView === "planning") {
                    state.planningTab = openView.dataset.planningTarget || "budgets";
                    renderPlanning();
                }
                setView(openView.dataset.openView);
                if (openView.hasAttribute("data-focus-close")) window.setTimeout(() => $("#closeStateTitle").scrollIntoView({ behavior: "smooth", block: "center" }), 0);
                return;
            }
            const selected = event.target.closest("[data-select-context]"); if (selected) return selectContext(selected.dataset.selectContext);
            const quick = event.target.closest("[data-quick-action]"); if (quick) { closeDialog(quick.closest("dialog")); const action = quick.dataset.quickAction; if (action === "operation") return openOperation(); if (action === "obligation") return openObligation(); return openSimple(action); }
            const simple = event.target.closest("[data-simple-edit]"); if (simple) { const type = simple.dataset.simpleEdit; const config = simpleConfigs[type]; return openSimple(type, state.data[config.entity].find(item => item.id === simple.dataset.id)); }
            const entity = event.target.closest("[data-entity][data-action]"); if (entity) return archiveEntity(entity.dataset.entity, entity.dataset.id, entity.dataset.action === "restore");
            const operationEdit = event.target.closest("[data-operation-edit]"); if (operationEdit) return openOperation(operationEdit.dataset.operationEdit);
            const operationDelete = event.target.closest("[data-operation-delete]"); if (operationDelete) return deletePendingOperation(operationDelete.dataset.operationDelete);
            const operationVoid = event.target.closest("[data-operation-void]"); if (operationVoid) return voidOperation(operationVoid.dataset.operationVoid);
            const paymentEdit = event.target.closest("[data-payment-edit]"); if (paymentEdit) { const payment = state.data.payments.find(item => item.id === paymentEdit.dataset.paymentEdit); if (payment) return openPayment(payment.obligation_id, payment.id); }
            const paymentVoid = event.target.closest("[data-payment-void]"); if (paymentVoid) return voidPayment(paymentVoid.dataset.paymentVoid);
            const obligationEdit = event.target.closest("[data-obligation-edit]"); if (obligationEdit) return openObligation(obligationEdit.dataset.obligationEdit);
            const obligationPay = event.target.closest("[data-obligation-pay]"); if (obligationPay) return openPayment(obligationPay.dataset.obligationPay);
            const obligationVoid = event.target.closest("[data-obligation-void]"); if (obligationVoid) return voidObligation(obligationVoid.dataset.obligationVoid);
            const goal = event.target.closest("[data-goal-entry]"); if (goal) return openSimple("goalEntry", { goal_id: goal.dataset.goalEntry, entry_type: goal.dataset.entryType });
            const valuation = event.target.closest("[data-asset-valuation]"); if (valuation) return openSimple("valuation", { asset_id: valuation.dataset.assetValuation });
            const saved = event.target.closest("[data-saved-filter]"); if (saved) return applySavedFilter(saved.dataset.savedFilter);
            const file = event.target.closest("[data-attachment-open]"); if (file) { try { window.open(await state.repository.attachmentUrl(file.dataset.attachmentOpen), "_blank", "noopener,noreferrer"); } catch (error) { notify(error.message, "warning"); } return; }
            const removeFile = event.target.closest("[data-attachment-remove]"); if (removeFile) return removeAttachment(removeFile.dataset.attachmentRemove);
            const planning = event.target.closest("[data-planning-tab]"); if (planning) { state.planningTab = planning.dataset.planningTab; return renderPlanning(); }
            if (event.target.closest('[data-action="open-conflict"]')) return showConflict();
            const close = event.target.closest("[data-close-dialog]"); if (close) return closeDialog(close.closest("dialog"));
        });
        $("#financeContext").addEventListener("change", event => selectContext(event.target.value));
        $("#financeMonth").addEventListener("change", async event => { if (!/^\d{4}-\d{2}$/.test(event.target.value)) return; state.activeMonth = event.target.value; state.movementLimit = 250; state.movementDateFrom = ""; state.movementDateTo = ""; await state.repository.storage.setMeta(state.repository.workspaceId, "activeMonth", state.activeMonth); if (currentContextId()) state.repository.generateRecurrences(state.activeMonth, currentContextId()).catch(error => console.warn(error.message)); state.repository.pullMonth(state.activeMonth).then(() => refresh()).catch(error => console.warn(error.message)); renderAll(); });
        $("#financeSearch").addEventListener("input", event => { state.search = event.target.value; renderMovements(); renderAccounts(); renderCommitments(); renderEntityLists(); });
        ["movementTypeFilter", "movementAccountFilter", "movementCategoryFilter", "movementMethodFilter", "movementStatusFilter"].forEach(id => $("#" + id).addEventListener("change", event => { if (id === "movementTypeFilter") state.movementType = event.target.value; renderMovements(); }));
        $("#movementDateFrom").addEventListener("change", event => { state.movementDateFrom = event.target.value; loadMovementRange(); });
        $("#movementDateTo").addEventListener("change", event => { state.movementDateTo = event.target.value; loadMovementRange(); });
        $("#commitmentStateFilter").addEventListener("change", event => { state.commitmentState = event.target.value; renderCommitments(); });
        $("#operationKind").addEventListener("change", toggleOperationFields); $("#obligationType").addEventListener("change", toggleInstallments);
        $("#operationForm").addEventListener("submit", saveOperation); $("#obligationForm").addEventListener("submit", saveObligation); $("#paymentForm").addEventListener("submit", savePayment); $("#simpleForm").addEventListener("submit", saveSimple);
        $("#saveMovementFilter").addEventListener("click", () => openSimple("savedFilter")); $("#copyBudgets").addEventListener("click", copyBudgets);
        $("#exportMovementsCsv").addEventListener("click", exportCsv); $("#exportMovementsXlsx").addEventListener("click", () => exportXlsx());
        $("#printMonthlyReport").addEventListener("click", printReport); $("#exportMonthlyReport").addEventListener("click", () => exportXlsx(monthlyReportRows(), `atlas-informe-${state.activeMonth}.xlsx`));
        $("#openCloseDialog").addEventListener("click", openClose); $("#closeForm").addEventListener("submit", submitClose);
        $("#closeReconciliation").addEventListener("input", event => {
            const input = event.target.closest("[data-close-reported]"); if (!input) return;
            const output = $(`[data-close-difference="${input.dataset.closeReported}"]`);
            const reported = Core.safeInteger(input.value, { allowNegative: true });
            output.textContent = reported === null ? "Valor no válido" : `Diferencia ${Core.formatMoney(reported - Number(input.dataset.calculated))}`;
        });
        $("#generateRecurrences").addEventListener("click", async () => { if (!assertConcreteContext()) return; const created = await state.repository.generateRecurrences(state.activeMonth, currentContextId()); await refresh(); notify(`${created.length} ocurrencia(s) nueva(s); no se duplicaron pendientes anteriores.`); });
        $("#loadPreviousMonth").addEventListener("click", () => { $("#financeMonth").value = Domain.addMonths(state.activeMonth, -1); $("#financeMonth").dispatchEvent(new Event("change", { bubbles: true })); });
        $("#detectMigration").addEventListener("click", detectMigration); $("#openMigration").addEventListener("click", showMigrationDialog); $("#migrationContext").addEventListener("change", updateMigrationTargets); $("#migrationForm").addEventListener("submit", importMigration);
        $("#downloadMigrationErrors").addEventListener("click", event => state.migration.downloadErrorReport(event.currentTarget.dataset.runId).catch(error => notify(error.message, "warning")));
        $("#keepServerVersion").addEventListener("click", () => resolveConflict("server")); $("#retryLocalVersion").addEventListener("click", () => resolveConflict("local"));
        $$("dialog").forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(dialog); }));
        window.addEventListener("online", () => state.repository.flush().then(() => refresh()).catch(error => console.warn(error.message)));
        document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh().catch(error => console.warn(error.message)); });
    }

    async function boot() {
        const role = window.AtlasStore?.workspaceRole || "";
        if (role !== "owner") {
            $("#financeAccessNotice").hidden = false; $("#financeAccessNotice").textContent = "Finanzas v0.10 es privada para el propietario. Esta cuenta no puede consultar ni guardar datos financieros.";
            $$("button, input, select, textarea").forEach(control => control.disabled = true); return;
        }
        state.repository = new Repository({ workspaceId: window.AtlasStore?.workspaceId || "local-workspace", userId: window.AtlasStore?.userId || window.AtlasAuth?.user?.id || "local-user", workspaceRole: role, client: window.AtlasAuth?.client || null });
        state.migration = new Migration(state.repository);
        state.repository.addEventListener("sync-status", event => { $("#financeSyncState").textContent = event.detail.message; $("#financeSyncState").dataset.state = event.detail.status; });
        state.repository.addEventListener("changed", () => refresh().catch(error => console.warn(error.message)));
        state.repository.addEventListener("external-change", () => refresh().catch(error => console.warn(error.message)));
        state.repository.addEventListener("conflict", () => refresh().then(showConflict).catch(error => console.warn(error.message)));
        await state.repository.initialize();
        state.activeContext = await state.repository.storage.getMeta(state.repository.workspaceId, "activeContext", "general");
        state.activeMonth = await state.repository.storage.getMeta(state.repository.workspaceId, "activeMonth", Core.currentMonth());
        await refresh({ render: false });
        if (!state.data.contexts.some(context => context.id === state.activeContext)) state.activeContext = "general";
        wireEvents(); renderAll();
        const preview = state.migration.readSource().preview; if (preview.canImport) { state.migrationPreview = preview; renderMigration(); }
        if (state.repository.remoteReady) state.repository.pullMonth(state.activeMonth).then(() => refresh()).catch(error => console.warn(error.message));
        else { $("#financeAccessNotice").hidden = false; $("#financeAccessNotice").textContent = "Modo local verificable: la base SQL v0.10 todavía no fue aplicada. Los cambios quedan en la cola durable y no se marcan como sincronizados."; }
    }

    boot().catch(error => { console.error(error); $("#financeAccessNotice").hidden = false; $("#financeAccessNotice").textContent = `No se pudo abrir Finanzas: ${error.message}`; });
})();
