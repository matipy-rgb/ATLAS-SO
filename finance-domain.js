(function (root) {
    const Core = root.AtlasFinanceCore;
    if (!Core) throw new Error("El núcleo financiero debe cargarse antes del dominio.");

    const OBLIGATION_TYPES = Object.freeze([
        ["payable", "Cuenta por pagar"], ["receivable", "Cuenta por cobrar"],
        ["loan", "Préstamo"], ["installment", "Compra en cuotas"],
        ["card", "Tarjeta de crédito"], ["recurring", "Compromiso recurrente"]
    ].map(([value, label]) => ({ value, label })));
    const FREQUENCIES = Object.freeze([
        ["once", "Una vez"], ["weekly", "Semanal"], ["monthly", "Mensual"],
        ["quarterly", "Trimestral"], ["yearly", "Anual"]
    ].map(([value, label]) => ({ value, label })));
    const ASSET_TYPES = Object.freeze([
        ["cash", "Dinero"], ["vehicle", "Vehículo"], ["property", "Inmueble"],
        ["equipment", "Equipo"], ["inventory", "Inventario"], ["investment", "Inversión"],
        ["loan", "Préstamo"], ["card", "Tarjeta"], ["other", "Otro"]
    ].map(([value, label]) => ({ value, label })));

    const allowed = (items, value, fallback) => items.some(item => item.value === value) ? value : fallback;
    const nowISO = options => options.now || new Date().toISOString();
    const monthOf = value => String(value || "").slice(0, 7);
    const active = record => record?.status !== "archived" && record?.status !== "void";

    function common(input, options, existing = null) {
        return Core.recordVersion(existing, input, options);
    }

    function requiredText(value, label, maxLength = 160) {
        const text = Core.cleanText(value, maxLength);
        if (!text) throw new Error(`${label} es obligatorio.`);
        return text;
    }

    function requireContext(input) {
        if (!input.context_id) throw new Error("Elegí un contexto financiero.");
        return input.context_id;
    }

    function dateTime(value) {
        const text = String(value || "").trim();
        if (Core.isISODate(text)) return `${text}T12:00:00-04:00`;
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(text)) {
            return /(?:Z|[+-]\d{2}:\d{2})$/.test(text) ? text : `${text.length === 16 ? `${text}:00` : text}-04:00`;
        }
        throw new Error("La fecha y hora no son válidas.");
    }

    function monthDate(month) {
        if (!/^\d{4}-\d{2}$/.test(String(month || ""))) throw new Error("El mes no es válido.");
        const [year, number] = month.split("-").map(Number);
        if (number < 1 || number > 12) throw new Error("El mes no es válido.");
        return new Date(Date.UTC(year, number - 1, 1));
    }

    function addMonths(month, count) {
        const date = monthDate(month);
        date.setUTCMonth(date.getUTCMonth() + count);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    function paymentMethodRecord(input, options, existing = null) {
        const methodType = allowed(Core.PAYMENT_METHOD_TYPES, input.method_type, "other");
        return {
            ...common(input, options, existing),
            context_id: requireContext(input),
            account_id: input.account_id || null,
            name: requiredText(input.name, "El nombre del medio de pago", 80),
            method_type: methodType,
            notes: Core.cleanText(input.notes, 500),
            status: input.status === "archived" ? "archived" : "active",
            archived_at: input.status === "archived" ? input.archived_at || nowISO(options) : null
        };
    }

    function transactionRecord(input, options, existing = null) {
        const amount = Core.positiveMoney(input.amount);
        if (!amount) throw new Error("El importe debe ser un entero positivo en guaraníes.");
        if (!input.account_id) throw new Error("Elegí la cuenta afectada.");
        const operationKind = allowed(Core.OPERATION_TYPES, input.operation_kind, input.transaction_type === "income" ? "income" : "expense");
        const transactionType = input.transaction_type === "income" ? "income" : "expense";
        const requestedDelta = Core.safeInteger(input.balance_delta, { allowNegative: true });
        const delta = requestedDelta === null || requestedDelta === 0
            ? (transactionType === "income" ? amount : -amount)
            : requestedDelta;
        const defaultEffect = Core.OPERATION_TYPES.find(item => item.value === operationKind)?.reporting || transactionType;
        const reportingEffect = ["income", "expense", "neutral"].includes(input.reporting_effect)
            ? input.reporting_effect : defaultEffect;
        return {
            ...common(input, options, existing),
            context_id: requireContext(input),
            account_id: input.account_id,
            category_id: input.category_id || null,
            payment_method_id: input.payment_method_id || null,
            operation_group_id: input.operation_group_id || input.id || Core.createId(),
            operation_kind: operationKind,
            operation_leg: ["single", "source", "destination"].includes(input.operation_leg) ? input.operation_leg : "single",
            transaction_type: transactionType,
            reporting_effect: reportingEffect,
            balance_delta: delta,
            status: ["pending", "confirmed", "void"].includes(input.status) ? input.status : "confirmed",
            occurred_at: dateTime(input.occurred_at),
            amount,
            description: requiredText(input.description, "La descripción", 160),
            counterparty: Core.cleanText(input.counterparty, 120),
            tags: [...new Set((Array.isArray(input.tags) ? input.tags : String(input.tags || "").split(","))
                .map(tag => Core.cleanText(tag, 32)).filter(Boolean))].slice(0, 20),
            note: Core.cleanText(input.note, 1000),
            related_obligation_id: input.related_obligation_id || null,
            related_payment_id: input.related_payment_id || null,
            void_reason: input.status === "void" ? requiredText(input.void_reason, "El motivo de anulación", 300) : "",
            voided_at: input.status === "void" ? input.voided_at || nowISO(options) : null,
            idempotency_key: input.idempotency_key || `transaction:${input.id || Core.createId()}:1`
        };
    }

    function obligationRecord(input, options, existing = null) {
        const principal = Core.positiveMoney(input.principal_amount);
        const interest = Core.safeInteger(input.interest_amount) ?? 0;
        const surcharge = Core.safeInteger(input.surcharge_amount) ?? 0;
        const paid = Core.safeInteger(input.paid_amount) ?? 0;
        if (!principal) throw new Error("El importe del compromiso debe ser positivo.");
        if (interest < 0 || surcharge < 0 || principal + interest + surcharge > Core.MAX_PYG) throw new Error("El interés o recargo no es válido.");
        const total = principal + interest + surcharge;
        if (paid < 0 || paid > total) throw new Error("El total pagado no puede superar el compromiso.");
        if (!Core.isISODate(input.due_date)) throw new Error("El vencimiento no es válido.");
        const obligationType = allowed(OBLIGATION_TYPES, input.obligation_type, "payable");
        const direction = obligationType === "receivable" ? "receivable" : "payable";
        const installmentTotal = input.installment_total ? Core.safeInteger(input.installment_total) : null;
        const installmentNumber = input.installment_number ? Core.safeInteger(input.installment_number) : null;
        if (obligationType === "installment" && (!installmentTotal || installmentTotal > 600 || !installmentNumber || installmentNumber > installmentTotal)) {
            throw new Error("La cuota y el total de cuotas deben ser válidos.");
        }
        const computedStatus = input.status === "void" ? "void" : paid === total ? "paid" : paid ? "partial" : "pending";
        return {
            ...common(input, options, existing),
            context_id: requireContext(input),
            account_id: input.account_id || null,
            category_id: input.category_id || null,
            recurrence_id: input.recurrence_id || null,
            obligation_type: obligationType,
            direction,
            name: requiredText(input.name, "El nombre del compromiso", 120),
            counterparty: Core.cleanText(input.counterparty, 120),
            principal_amount: principal,
            interest_amount: interest,
            surcharge_amount: surcharge,
            paid_amount: paid,
            due_date: input.due_date,
            frequency: allowed(FREQUENCIES, input.frequency, "once"),
            installment_number: obligationType === "installment" ? installmentNumber : null,
            installment_total: obligationType === "installment" ? installmentTotal : null,
            reminder_days: Math.min(Core.safeInteger(input.reminder_days) ?? 3, 365),
            note: Core.cleanText(input.note, 1000),
            status: computedStatus,
            void_reason: computedStatus === "void" ? requiredText(input.void_reason, "El motivo de anulación", 300) : "",
            voided_at: computedStatus === "void" ? input.voided_at || nowISO(options) : null,
            idempotency_key: input.idempotency_key || `obligation:${input.id || Core.createId()}:1`
        };
    }

    function paymentRecord(input, options, existing = null) {
        const amount = Core.positiveMoney(input.amount);
        if (!amount) throw new Error("El pago debe ser positivo.");
        if (!input.obligation_id || !input.account_id) throw new Error("Elegí el compromiso y la cuenta.");
        if (!Core.isISODate(input.paid_on)) throw new Error("La fecha de pago no es válida.");
        return {
            ...common(input, options, existing),
            context_id: requireContext(input),
            obligation_id: input.obligation_id,
            account_id: input.account_id,
            linked_transaction_id: input.linked_transaction_id || null,
            payment_method_id: input.payment_method_id || null,
            amount,
            paid_on: input.paid_on,
            reference: Core.cleanText(input.reference, 160),
            note: Core.cleanText(input.note, 1000),
            status: input.status === "void" ? "void" : "confirmed",
            void_reason: input.status === "void" ? requiredText(input.void_reason, "El motivo de anulación", 300) : "",
            voided_at: input.status === "void" ? input.voided_at || nowISO(options) : null,
            idempotency_key: input.idempotency_key || `payment:${input.id || Core.createId()}:1`
        };
    }

    function attachmentRecord(input, options, existing = null) {
        const mime = String(input.mime_type || "");
        const size = Core.safeInteger(input.byte_size);
        if (!input.payment_id && !input.transaction_id) throw new Error("El comprobante necesita un movimiento o pago.");
        if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mime)) throw new Error("Usá JPG, PNG, WebP o PDF.");
        if (size === null || size > 10485760) throw new Error("El comprobante no puede superar 10 MB.");
        return {
            ...common(input, options, existing),
            context_id: requireContext(input),
            payment_id: input.payment_id || null,
            transaction_id: input.transaction_id || null,
            bucket_id: "atlas-finance-files",
            storage_path: input.storage_path || null,
            original_name: requiredText(input.original_name, "El nombre del archivo", 180),
            mime_type: mime,
            byte_size: size,
            sync_state: ["local_pending", "remote", "removed"].includes(input.sync_state) ? input.sync_state : "local_pending",
            idempotency_key: input.idempotency_key || `attachment:${input.id || Core.createId()}:1`
        };
    }

    function recurrenceRecord(input, options, existing = null) {
        if (!Core.isISODate(input.starts_on)) throw new Error("La fecha inicial de la recurrencia no es válida.");
        if (input.ends_on && !Core.isISODate(input.ends_on)) throw new Error("La fecha final de la recurrencia no es válida.");
        return {
            ...common(input, options, existing),
            context_id: requireContext(input),
            template_type: input.template_type === "transaction" ? "transaction" : "obligation",
            name: requiredText(input.name, "El nombre de la recurrencia", 120),
            frequency: allowed(FREQUENCIES, input.frequency, "monthly"),
            interval_count: Math.min(Math.max(Core.safeInteger(input.interval_count) || 1, 1), 52),
            starts_on: input.starts_on,
            ends_on: input.ends_on || null,
            next_on: input.next_on || input.starts_on,
            template: input.template && typeof input.template === "object" ? structuredClone(input.template) : {},
            status: input.status === "archived" ? "archived" : "active",
            archived_at: input.status === "archived" ? input.archived_at || nowISO(options) : null
        };
    }

    function budgetRecord(input, options, existing = null) {
        const amount = Core.positiveMoney(input.planned_amount);
        if (!amount) throw new Error("El presupuesto debe ser positivo.");
        monthDate(input.month);
        if (!input.category_id) throw new Error("Elegí una categoría para el presupuesto.");
        return {
            ...common(input, options, existing), context_id: requireContext(input),
            category_id: input.category_id, month: input.month, planned_amount: amount,
            alert_percent: Math.min(Math.max(Core.safeInteger(input.alert_percent) || 80, 1), 100),
            notes: Core.cleanText(input.notes, 500), status: input.status === "archived" ? "archived" : "active"
        };
    }

    function goalRecord(input, options, existing = null) {
        const target = Core.positiveMoney(input.target_amount);
        if (!target) throw new Error("La meta debe tener un objetivo positivo.");
        if (input.target_date && !Core.isISODate(input.target_date)) throw new Error("La fecha objetivo no es válida.");
        return {
            ...common(input, options, existing), context_id: requireContext(input),
            account_id: input.account_id || null, name: requiredText(input.name, "El nombre de la meta", 120),
            target_amount: target, target_date: input.target_date || null, notes: Core.cleanText(input.notes, 500),
            status: ["active", "completed", "archived"].includes(input.status) ? input.status : "active"
        };
    }

    function goalEntryRecord(input, options, existing = null) {
        const amount = Core.positiveMoney(input.amount);
        if (!amount || !input.goal_id) throw new Error("Elegí una meta y un importe positivo.");
        if (!Core.isISODate(input.occurred_on)) throw new Error("La fecha del aporte no es válida.");
        return {
            ...common(input, options, existing), context_id: requireContext(input), goal_id: input.goal_id,
            entry_type: input.entry_type === "withdrawal" ? "withdrawal" : "contribution",
            amount, occurred_on: input.occurred_on, note: Core.cleanText(input.note, 500)
        };
    }

    function assetRecord(input, options, existing = null) {
        const value = Core.positiveMoney(input.opening_value);
        if (!value) throw new Error("La valuación inicial debe ser positiva.");
        if (!Core.isISODate(input.valued_on)) throw new Error("La fecha de valuación no es válida.");
        return {
            ...common(input, options, existing), context_id: requireContext(input),
            asset_class: input.asset_class === "liability" ? "liability" : "asset",
            asset_type: allowed(ASSET_TYPES, input.asset_type, "other"),
            name: requiredText(input.name, "El nombre del activo o pasivo", 120),
            opening_value: value, valued_on: input.valued_on, notes: Core.cleanText(input.notes, 500),
            status: input.status === "archived" ? "archived" : "active"
        };
    }

    function valuationRecord(input, options, existing = null) {
        const value = Core.safeInteger(input.value);
        if (value === null || value < 0 || value > Core.MAX_PYG) throw new Error("La valuación debe ser un entero válido.");
        if (!input.asset_id || !Core.isISODate(input.valued_on)) throw new Error("Elegí el activo y una fecha válida.");
        return {
            ...common(input, options, existing), context_id: requireContext(input), asset_id: input.asset_id,
            value, valued_on: input.valued_on, source: Core.cleanText(input.source || "Manual", 120),
            note: Core.cleanText(input.note, 500)
        };
    }

    function savedFilterRecord(input, options, existing = null) {
        return {
            ...common(input, options, existing), context_id: requireContext(input),
            name: requiredText(input.name, "El nombre del filtro", 80),
            filters: input.filters && typeof input.filters === "object" ? structuredClone(input.filters) : {},
            status: input.status === "archived" ? "archived" : "active"
        };
    }

    function obligationState(obligation, today = new Date().toISOString().slice(0, 10)) {
        if (obligation.status === "void") return "void";
        if (Number(obligation.paid_amount) >= obligationTotal(obligation)) return obligation.direction === "receivable" ? "collected" : "paid";
        if (obligation.due_date < today) return "overdue";
        if (obligation.due_date === today) return "due_today";
        const warning = new Date(`${today}T00:00:00Z`);
        warning.setUTCDate(warning.getUTCDate() + Number(obligation.reminder_days || 3));
        if (obligation.due_date <= warning.toISOString().slice(0, 10)) return "due_soon";
        return Number(obligation.paid_amount) > 0 ? "partial" : "pending";
    }

    function obligationTotal(obligation) {
        return Number(obligation.principal_amount || 0) + Number(obligation.interest_amount || 0) + Number(obligation.surcharge_amount || 0);
    }

    function paidAtCutoff(obligation, payments, cutoff) {
        const related = (payments || []).filter(item => item.obligation_id === obligation.id);
        if (!related.length) return Number(obligation.paid_amount || 0);
        return related.filter(item => item.paid_on <= cutoff && (item.status !== "void"
            || (item.voided_at && String(item.voided_at).slice(0, 10) > cutoff)))
            .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    }

    function budgetSummary({ budgets = [], transactions = [], obligations = [], payments = [], month, contextId }) {
        const rows = new Map();
        const cutoff = `${month}-31`;
        budgets.filter(item => item.month === month
            && (item.status !== "archived" || (item.archived_at && String(item.archived_at).slice(0, 10) > cutoff))
            && (contextId === "general" || item.context_id === contextId))
            .forEach(item => rows.set(item.category_id, { ...item, spent: 0, committed: 0, available: Number(item.planned_amount), projection: 0 }));
        transactions.forEach(item => {
            const row = rows.get(item.category_id);
            const effective = item.status === "confirmed"
                || (item.status === "void" && item.voided_at && String(item.voided_at).slice(0, 10) > `${month}-31`);
            if (!row || !effective || item.reporting_effect !== "expense" || monthOf(item.occurred_at) !== month) return;
            row.spent += Number(item.amount || 0);
        });
        obligations.forEach(item => {
            const row = rows.get(item.category_id);
            if (!row || item.direction === "receivable" || ["loan", "card"].includes(item.obligation_type)
                || (item.status === "void" && (!item.voided_at || String(item.voided_at).slice(0, 10) <= cutoff))
                || monthOf(item.due_date) !== month) return;
            row.committed += Math.max(0, obligationTotal(item) - paidAtCutoff(item, payments, cutoff));
        });
        const today = new Date();
        const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
        const elapsed = month === Core.currentMonth(today) ? Math.max(today.getDate(), 1) : days;
        rows.forEach(row => {
            row.available = row.planned_amount - row.spent - row.committed;
            row.projection = Math.round(row.spent / elapsed * days) + row.committed;
            row.percent = Math.round((row.spent + row.committed) / row.planned_amount * 100);
            row.alert = row.percent >= row.alert_percent;
        });
        return [...rows.values()];
    }

    function goalProgress(goal, entries = [], cutoff = null) {
        const saved = entries.filter(item => item.goal_id === goal.id && (!cutoff || item.occurred_on <= cutoff))
            .reduce((sum, item) => sum + (item.entry_type === "withdrawal" ? -Number(item.amount) : Number(item.amount)), 0);
        return { saved, remaining: Math.max(0, Number(goal.target_amount) - saved), percent: Math.max(0, Math.min(100, Math.round(saved / goal.target_amount * 100))) };
    }

    function netWorth({ accounts = [], transactions = [], obligations = [], payments = [], assets = [], valuations = [], contextId = "general", month = Core.currentMonth() }) {
        const cutoff = `${month}-31`;
        let assetTotal = 0;
        let liabilityTotal = 0;
        accounts.filter(item => item.opened_on <= cutoff
            && (contextId === "general" || item.context_id === contextId)).forEach(account => {
            const balance = Core.accountBalance(account, transactions, cutoff);
            if (["credit_card", "liability"].includes(account.account_type)) {
                if (balance >= 0) liabilityTotal += balance;
                else assetTotal += Math.abs(balance);
            }
            else assetTotal += balance;
        });
        assets.filter(item => item.valued_on <= cutoff
            && (item.status !== "archived" || (item.archived_at && String(item.archived_at).slice(0, 10) > cutoff))
            && (contextId === "general" || item.context_id === contextId)).forEach(item => {
            const latest = valuations.filter(value => value.asset_id === item.id && value.valued_on <= cutoff)
                .sort((a, b) => b.valued_on.localeCompare(a.valued_on))[0];
            const value = Number(latest?.value ?? item.opening_value ?? 0);
            if (item.asset_class === "liability") liabilityTotal += value;
            else assetTotal += value;
        });
        const accountById = new Map(accounts.map(item => [item.id, item]));
        obligations.filter(item => item.due_date <= cutoff && String(item.created_at || item.due_date).slice(0, 10) <= cutoff
            && !(item.status === "void" && (!item.voided_at || String(item.voided_at).slice(0, 10) <= cutoff))
            && (contextId === "general" || item.context_id === contextId)).forEach(item => {
            const linked = accountById.get(item.account_id);
            if (linked && ["credit_card", "liability"].includes(linked.account_type)) return;
            const outstanding = Math.max(0, obligationTotal(item) - paidAtCutoff(item, payments, cutoff));
            if (item.direction === "receivable") assetTotal += outstanding;
            else liabilityTotal += outstanding;
        });
        return { assets: assetTotal, liabilities: liabilityTotal, net: assetTotal - liabilityTotal };
    }

    function isMonthClosed(closes, contextId, month) {
        return closes.filter(item => item.context_id === contextId && item.month === month)
            .sort((a, b) => Number(b.version_number || 0) - Number(a.version_number || 0))[0]?.state === "closed";
    }

    function closeSnapshot(data, contextId, month, { observations = "", reconciliations = [] } = {}) {
        const summary = Core.financialSummary({ ...data, contextId, month });
        const budgets = budgetSummary({ ...data, contextId, month });
        const worth = netWorth({ ...data, contextId, month });
        const cutoff = `${month}-31`;
        const obligations = (data.obligations || []).filter(item => item.context_id === contextId
            && String(item.created_at || item.due_date).slice(0, 10) <= cutoff
            && !(item.status === "void" && (!item.voided_at || String(item.voided_at).slice(0, 10) <= cutoff)))
            .map(item => ({ ...item, paid_at_close: paidAtCutoff(item, data.payments || [], cutoff) }))
            .filter(item => obligationTotal(item) > item.paid_at_close);
        const reportedByAccount = new Map((reconciliations || []).map(item => [item.account_id, item]));
        const accounts = (data.accounts || []).filter(item => item.context_id === contextId && item.opened_on <= cutoff).map(item => {
            const balance = Core.accountBalance(item, data.transactions || [], cutoff);
            const reported = Core.safeInteger(reportedByAccount.get(item.id)?.reported_balance, { allowNegative: true });
            const reportedBalance = reported === null ? balance : reported;
            return {
                id: item.id, name: item.name, account_type: item.account_type, balance,
                reported_balance: reportedBalance, difference: reportedBalance - balance, status: item.status
            };
        });
        const transferGroups = new Map();
        (data.transactions || []).filter(item => item.context_id === contextId && item.operation_kind === "transfer"
            && item.status === "confirmed" && monthOf(item.occurred_at) === month).forEach(item => {
            if (!transferGroups.has(item.operation_group_id)) transferGroups.set(item.operation_group_id, Number(item.amount));
        });
        const goals = (data.goals || []).filter(item => item.context_id === contextId
            && String(item.created_at || item.target_date || cutoff).slice(0, 10) <= cutoff
            && (item.status !== "archived" || (item.archived_at && String(item.archived_at).slice(0, 10) > cutoff)))
            .map(item => ({ id: item.id, name: item.name, target_amount: item.target_amount, ...goalProgress(item, data.goalEntries || [], cutoff) }));
        return {
            generated_at: new Date().toISOString(), context_id: contextId, month,
            observations: Core.cleanText(observations, 1000), summary, accounts, budgets, goals, net_worth: worth,
            transfers: { count: transferGroups.size, total: [...transferGroups.values()].reduce((sum, amount) => sum + amount, 0) },
            outstanding: obligations.reduce((sum, item) => sum + obligationTotal(item) - item.paid_at_close, 0),
            payable: obligations.filter(item => item.direction !== "receivable").reduce((sum, item) => sum + obligationTotal(item) - item.paid_at_close, 0),
            receivable: obligations.filter(item => item.direction === "receivable").reduce((sum, item) => sum + obligationTotal(item) - item.paid_at_close, 0),
            counts: { transactions: (data.transactions || []).filter(item => item.context_id === contextId && monthOf(item.occurred_at) === month).length, obligations: obligations.length }
        };
    }

    function csv(rows, columns) {
        const safe = value => {
            let text = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("|") : String(value);
            if (/^[=+\-@]/.test(text)) text = `'${text}`;
            return `"${text.replaceAll('"', '""')}"`;
        };
        return [columns.map(item => safe(item.label)).join(","), ...rows.map(row => columns.map(item => safe(row[item.key])).join(","))].join("\r\n");
    }

    root.AtlasFinanceDomain = Object.freeze({
        OBLIGATION_TYPES, FREQUENCIES, ASSET_TYPES, monthOf, monthDate, addMonths, dateTime, paidAtCutoff,
        paymentMethodRecord, transactionRecord, obligationRecord, paymentRecord, attachmentRecord,
        recurrenceRecord, budgetRecord, goalRecord, goalEntryRecord, assetRecord, valuationRecord,
        savedFilterRecord, obligationState, obligationTotal, budgetSummary, goalProgress, netWorth, isMonthClosed, closeSnapshot, csv
    });
})(typeof window !== "undefined" ? window : globalThis);
