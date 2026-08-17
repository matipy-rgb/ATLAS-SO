(function (root) {
    const ACCOUNT_TYPES = Object.freeze([
        { value: "cash", label: "Efectivo" },
        { value: "bank", label: "Cuenta bancaria" },
        { value: "wallet", label: "Billetera electrónica" },
        { value: "debit_card", label: "Tarjeta de débito" },
        { value: "credit_card", label: "Tarjeta de crédito" },
        { value: "business_cash", label: "Caja de emprendimiento" },
        { value: "savings", label: "Ahorro" },
        { value: "investment", label: "Inversión" },
        { value: "liability", label: "Préstamo o pasivo" },
        { value: "other", label: "Otra cuenta" }
    ]);

    const FLOW_TYPES = Object.freeze([
        { value: "expense", label: "Gasto" },
        { value: "income", label: "Ingreso" },
        { value: "both", label: "Ingreso y gasto" }
    ]);
    const OPERATION_TYPES = Object.freeze([
        { value: "expense", label: "Gasto", reporting: "expense" },
        { value: "income", label: "Ingreso", reporting: "income" },
        { value: "transfer", label: "Transferencia", reporting: "neutral" },
        { value: "adjustment", label: "Ajuste", reporting: "neutral" },
        { value: "owner_contribution", label: "Aporte del propietario", reporting: "neutral" },
        { value: "owner_withdrawal", label: "Retiro del propietario", reporting: "neutral" },
        { value: "refund", label: "Reembolso", reporting: "income" },
        { value: "collection", label: "Cobro", reporting: "income" },
        { value: "payment", label: "Pago", reporting: "expense" }
    ]);
    const PAYMENT_METHOD_TYPES = Object.freeze([
        ["cash", "Efectivo"], ["transfer", "Transferencia"], ["debit_card", "Tarjeta de débito"],
        ["credit_card", "Tarjeta de crédito"], ["qr", "QR"], ["wallet", "Billetera"],
        ["deposit", "Depósito"], ["cheque", "Cheque"], ["other", "Otro"]
    ].map(([value, label]) => ({ value, label })));
    const MAX_PYG = 90000000000000;

    const DEFAULT_CATEGORY_NAMES = Object.freeze([
        ["Alimentación", "expense", "#ef4444", "🍽"],
        ["Transporte", "expense", "#f97316", "🚌"],
        ["Vivienda", "expense", "#8b5cf6", "⌂"],
        ["Servicios", "expense", "#0ea5e9", "⚡"],
        ["Salud", "expense", "#14b8a6", "+"],
        ["Educación", "expense", "#6366f1", "▣"],
        ["Ingresos", "income", "#16a34a", "↑"],
        ["Otros", "both", "#64748b", "●"]
    ]);

    function createId() {
        if (root.crypto?.randomUUID) return root.crypto.randomUUID();
        const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
        return `${random()}${random()}-${random()}-4${random().slice(1)}-a${random().slice(1)}-${random()}${random()}${random()}`;
    }

    function derivedId(sourceId, seed = 0) {
        const source = String(sourceId || "").toLowerCase().replaceAll("-", "");
        if (!/^[0-9a-f]{32}$/.test(source)) return createId();
        let state = (Number(seed) >>> 0) || 1;
        const digits = source.split("").map((digit, index) => {
            state = (Math.imul(state, 1664525) + 1013904223 + index) >>> 0;
            return (Number.parseInt(digit, 16) ^ (state & 15)).toString(16);
        });
        digits[12] = "5";
        digits[16] = "a";
        const hex = digits.join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    function personalContextId(workspaceId) {
        return derivedId(workspaceId, 101);
    }

    function cleanText(value, maxLength = 500) {
        return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
    }

    function safeInteger(value, { allowNegative = false } = {}) {
        if (typeof value === "string" && !/^-?\d+(?:\.0+)?$/.test(value.trim())) return null;
        const numeric = Number(value);
        if (!Number.isSafeInteger(numeric)) return null;
        if (!allowNegative && numeric < 0) return null;
        return numeric;
    }

    function positiveMoney(value) {
        const amount = safeInteger(value);
        return amount !== null && amount > 0 && amount <= MAX_PYG ? amount : null;
    }

    function isISODate(value) {
        const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return false;
        const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
        return date.getUTCFullYear() === Number(match[1])
            && date.getUTCMonth() === Number(match[2]) - 1
            && date.getUTCDate() === Number(match[3]);
    }

    function datePart(value) {
        const part = String(value || "").slice(0, 10);
        return isISODate(part) ? part : "";
    }

    function currentMonth(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    function formatMoney(value) {
        return new Intl.NumberFormat("es-PY", {
            style: "currency",
            currency: "PYG",
            maximumFractionDigits: 0
        }).format(Number(value || 0));
    }

    function formatMonth(value) {
        if (!/^\d{4}-\d{2}$/.test(String(value || ""))) return "Mes no válido";
        const [year, month] = value.split("-").map(Number);
        return new Intl.DateTimeFormat("es-PY", { month: "long", year: "numeric" })
            .format(new Date(year, month - 1, 1));
    }

    function baseRecord(input, options) {
        const now = options.now || new Date().toISOString();
        return {
            id: input.id || createId(),
            workspace_id: options.workspaceId,
            created_by: input.created_by || options.userId,
            updated_by: options.userId,
            created_at: input.created_at || now,
            updated_at: now,
            version: Number.isInteger(input.version) && input.version > 0 ? input.version : 1
        };
    }

    function recordVersion(existing, input, options) {
        const record = baseRecord(input, options);
        if (!existing) return record;
        return {
            ...record,
            created_at: existing.created_at,
            created_by: existing.created_by,
            version: Number(existing.version || 1) + 1
        };
    }

    function contextRecord(input, options) {
        const kind = input.kind === "business" ? "business" : "personal";
        const name = cleanText(input.name, 80);
        if (!name) throw new Error("El contexto necesita un nombre.");
        return {
            ...baseRecord(input, options),
            kind,
            name,
            description: cleanText(input.description, 500),
            status: input.status === "archived" ? "archived" : "active",
            archived_at: input.status === "archived" ? input.archived_at || new Date().toISOString() : null
        };
    }

    function accountRecord(input, options) {
        const name = cleanText(input.name, 80);
        const openingBalance = safeInteger(input.opening_balance, { allowNegative: true });
        if (!name) throw new Error("La cuenta necesita un nombre.");
        if (!ACCOUNT_TYPES.some(item => item.value === input.account_type)) {
            throw new Error("Elegí un tipo de cuenta válido.");
        }
        if (openingBalance === null) throw new Error("El saldo inicial debe ser un entero en guaraníes.");
        if (!isISODate(input.opened_on)) throw new Error("La fecha de apertura no es válida.");
        if (!input.context_id) throw new Error("Elegí un contexto para la cuenta.");
        return {
            ...baseRecord(input, options),
            context_id: input.context_id,
            name,
            account_type: input.account_type,
            currency: "PYG",
            opening_balance: openingBalance,
            opened_on: input.opened_on,
            notes: cleanText(input.notes, 500),
            status: input.status === "archived" ? "archived" : "active",
            archived_at: input.status === "archived" ? input.archived_at || new Date().toISOString() : null
        };
    }

    function categoryRecord(input, options) {
        const name = cleanText(input.name, 80);
        const flowType = FLOW_TYPES.some(item => item.value === input.flow_type) ? input.flow_type : "both";
        if (!name) throw new Error("La categoría necesita un nombre.");
        if (!input.context_id) throw new Error("Elegí un contexto para la categoría.");
        return {
            ...baseRecord(input, options),
            context_id: input.context_id,
            parent_id: input.parent_id || null,
            name,
            flow_type: flowType,
            color: /^#[0-9a-f]{6}$/i.test(input.color || "") ? input.color : "#2563eb",
            icon: cleanText(input.icon || "●", 12),
            sort_order: safeInteger(input.sort_order, { allowNegative: true }) ?? 0,
            status: input.status === "archived" ? "archived" : "active",
            archived_at: input.status === "archived" ? input.archived_at || new Date().toISOString() : null
        };
    }

    function defaultCategories(contextId, options) {
        return DEFAULT_CATEGORY_NAMES.map(([name, flowType, color, icon], index) => categoryRecord({
            id: derivedId(contextId, 1000 + index),
            context_id: contextId,
            name,
            flow_type: flowType,
            color,
            icon,
            sort_order: index * 10
        }, options));
    }

    function accountBalance(account, transactions, cutoff = null) {
        return (transactions || []).reduce((balance, transaction) => {
            if (transaction.account_id !== account.id) return balance;
            const occurredOn = String(transaction.occurred_at || "").slice(0, 10);
            if (cutoff && occurredOn > cutoff) return balance;
            const effective = transaction.status === "confirmed"
                || (cutoff && transaction.status === "void" && transaction.voided_at && String(transaction.voided_at).slice(0, 10) > cutoff);
            if (!effective) return balance;
            const fallback = transaction.transaction_type === "income" ? Number(transaction.amount || 0) : -Number(transaction.amount || 0);
            return balance + Number(transaction.balance_delta ?? fallback);
        }, Number(account.opening_balance || 0));
    }

    function financialSummary({ accounts = [], transactions = [], contextId = "general", month = currentMonth() }) {
        const cutoff = `${month}-31`;
        const scopedAccounts = contextId === "general"
            ? accounts.filter(account => account.opened_on <= cutoff)
            : accounts.filter(account => account.context_id === contextId && account.opened_on <= cutoff);
        const activeAtCutoff = account => account.status !== "archived"
            || Boolean(account.archived_at && String(account.archived_at).slice(0, 10) > cutoff);
        const accountIds = new Set(scopedAccounts.map(account => account.id));
        const balances = new Map(scopedAccounts
            .filter(activeAtCutoff)
            .map(account => [account.id, Number(account.opening_balance || 0)]));
        let income = 0;
        let expense = 0;
        for (const transaction of transactions) {
            if (!accountIds.has(transaction.account_id)) continue;
            const effective = transaction.status === "confirmed"
                || (transaction.status === "void" && transaction.voided_at && String(transaction.voided_at).slice(0, 10) > cutoff);
            if (!effective) continue;
            const amount = Number(transaction.amount || 0);
            const fallback = transaction.transaction_type === "income" ? amount : -amount;
            if (balances.has(transaction.account_id) && String(transaction.occurred_at || "").slice(0, 10) <= cutoff) {
                balances.set(transaction.account_id, balances.get(transaction.account_id) + Number(transaction.balance_delta ?? fallback));
            }
            if (String(transaction.occurred_at || "").slice(0, 7) !== month) continue;
            const effect = transaction.reporting_effect
                || (transaction.operation_kind === "transfer" ? "neutral" : transaction.transaction_type);
            if (effect === "income") income += amount;
            if (effect === "expense") expense += amount;
        }
        const available = scopedAccounts
            .filter(account => activeAtCutoff(account) && !["credit_card", "liability"].includes(account.account_type))
            .reduce((sum, account) => sum + Number(balances.get(account.id) || 0), 0);
        return { available, income, expense, result: income - expense, accounts: scopedAccounts.filter(activeAtCutoff).length };
    }

    function legacyId(item, index) {
        return cleanText(item?.id, 128) || `row-${index + 1}`;
    }

    function previewLegacy(transactionsInput, obligationsInput) {
        const transactions = Array.isArray(transactionsInput) ? transactionsInput : [];
        const obligations = Array.isArray(obligationsInput) ? obligationsInput : [];
        const errors = [];
        let income = 0;
        let expense = 0;
        let obligationTotal = 0;
        let paidTotal = 0;
        let paymentCount = 0;
        let attachmentCount = 0;

        transactions.forEach((item, index) => {
            const id = legacyId(item, index);
            const amount = positiveMoney(item?.amount);
            if (!amount) errors.push({ sourceType: "transaction", sourceId: id, field: "amount", code: "invalid_amount" });
            if (!["income", "expense"].includes(item?.type)) {
                errors.push({ sourceType: "transaction", sourceId: id, field: "type", code: "invalid_type" });
            }
            if (!datePart(item?.createdAt)) {
                errors.push({ sourceType: "transaction", sourceId: id, field: "createdAt", code: "invalid_date" });
            }
            if (amount && item?.type === "income") income += amount;
            if (amount && item?.type === "expense") expense += amount;
        });

        obligations.forEach((item, index) => {
            const id = legacyId(item, index);
            const amount = positiveMoney(item?.amount);
            if (!amount) errors.push({ sourceType: "obligation", sourceId: id, field: "amount", code: "invalid_amount" });
            if (!datePart(item?.dueDate)) {
                errors.push({ sourceType: "obligation", sourceId: id, field: "dueDate", code: "invalid_date" });
            }
            if (amount) obligationTotal += amount;
            let obligationPaid = 0;
            const payments = Array.isArray(item?.payments) ? item.payments : [];
            payments.forEach((payment, paymentIndex) => {
                const paymentId = cleanText(payment?.id, 128) || `${id}-payment-${paymentIndex + 1}`;
                const paymentAmount = positiveMoney(payment?.amount);
                if (!paymentAmount) errors.push({ sourceType: "payment", sourceId: paymentId, field: "amount", code: "invalid_amount" });
                if (!datePart(payment?.date)) errors.push({ sourceType: "payment", sourceId: paymentId, field: "date", code: "invalid_date" });
                if (paymentAmount) {
                    paymentCount += 1;
                    obligationPaid += paymentAmount;
                    paidTotal += paymentAmount;
                }
                if (payment?.receipt) attachmentCount += 1;
            });
            if (amount && obligationPaid > amount) {
                errors.push({ sourceType: "obligation", sourceId: id, field: "payments", code: "payments_exceed_obligation" });
            }
        });

        return {
            counts: {
                transactions: transactions.length,
                obligations: obligations.length,
                payments: paymentCount,
                attachments: attachmentCount,
                errors: errors.length
            },
            totals: { income, expense, obligations: obligationTotal, paid: paidTotal },
            errors,
            canImport: transactions.length + obligations.length > 0
        };
    }

    function stableStringify(value) {
        if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
        if (value && typeof value === "object") {
            return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
        }
        return JSON.stringify(value);
    }

    function searchText(value) {
        return cleanText(value, 300).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    root.AtlasFinanceCore = Object.freeze({
        ACCOUNT_TYPES,
        FLOW_TYPES,
        OPERATION_TYPES,
        PAYMENT_METHOD_TYPES,
        MAX_PYG,
        createId,
        derivedId,
        personalContextId,
        cleanText,
        safeInteger,
        positiveMoney,
        isISODate,
        datePart,
        currentMonth,
        formatMoney,
        formatMonth,
        baseRecord,
        recordVersion,
        contextRecord,
        accountRecord,
        categoryRecord,
        defaultCategories,
        accountBalance,
        financialSummary,
        previewLegacy,
        stableStringify,
        searchText
    });
})(typeof window !== "undefined" ? window : globalThis);
