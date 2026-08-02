const TRANSACTIONS_KEY = "atlasTransactions";
const OBLIGATIONS_KEY = "atlasObligations";
const RECEIPT_DB_NAME = "atlasSOFiles";
const RECEIPT_STORE_NAME = "paymentReceipts";
const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;

const balanceAmount = document.querySelector("#balanceAmount");
const incomeAmount = document.querySelector("#incomeAmount");
const expenseAmount = document.querySelector("#expenseAmount");
const pendingAmount = document.querySelector("#pendingAmount");
const pendingCount = document.querySelector("#pendingCount");
const financeAlerts = document.querySelector("#financeAlerts");

const obligationForm = document.querySelector("#obligationForm");
const obligationName = document.querySelector("#obligationName");
const obligationAmount = document.querySelector("#obligationAmount");
const obligationDueDate = document.querySelector("#obligationDueDate");
const obligationFrequency = document.querySelector("#obligationFrequency");
const installmentFields = document.querySelector("#installmentFields");
const installmentNumber = document.querySelector("#installmentNumber");
const installmentTotal = document.querySelector("#installmentTotal");
const obligationsList = document.querySelector("#obligationsList");

const transactionForm = document.querySelector("#transactionForm");
const transactionType = document.querySelector("#transactionType");
const transactionDate = document.querySelector("#transactionDate");
const transactionDescription = document.querySelector("#transactionDescription");
const transactionAmount = document.querySelector("#transactionAmount");
const transactionsList = document.querySelector("#transactionsList");

const paymentDialog = document.querySelector("#paymentDialog");
const paymentForm = document.querySelector("#paymentForm");
const paymentTitle = document.querySelector("#paymentTitle");
const paymentRemaining = document.querySelector("#paymentRemaining");
const paymentObligationId = document.querySelector("#paymentObligationId");
const paymentAmount = document.querySelector("#paymentAmount");
const paymentDate = document.querySelector("#paymentDate");
const paymentReference = document.querySelector("#paymentReference");
const paymentNote = document.querySelector("#paymentNote");
const paymentReceipt = document.querySelector("#paymentReceipt");
const receiptSelection = document.querySelector("#receiptSelection");
const closePaymentDialog = document.querySelector("#closePaymentDialog");
const cancelPayment = document.querySelector("#cancelPayment");
const receiptDialog = document.querySelector("#receiptDialog");
const receiptTitle = document.querySelector("#receiptTitle");
const receiptViewer = document.querySelector("#receiptViewer");
const downloadReceipt = document.querySelector("#downloadReceipt");
const closeReceiptDialog = document.querySelector("#closeReceiptDialog");
const doneReceiptDialog = document.querySelector("#doneReceiptDialog");

let activeReceiptUrl = "";
let writingFinanceData = false;

let transactions = loadArray(TRANSACTIONS_KEY).map(normalizeTransaction);
let obligations = loadArray(OBLIGATIONS_KEY).map(normalizeObligation);

function reloadStoredData() {
    transactions = loadArray(TRANSACTIONS_KEY).map(normalizeTransaction);
    obligations = loadArray(OBLIGATIONS_KEY).map(normalizeObligation);
}

function loadArray(key) {
    return window.Atlas?.readArray(key) || [];
}

function receiptRecordId(paymentId) {
    return `${window.AtlasStore?.workspaceId || "local"}:${String(paymentId)}`;
}

function openReceiptDatabase() {
    return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("Este navegador no permite guardar archivos locales."));
            return;
        }

        const request = indexedDB.open(RECEIPT_DB_NAME, 1);

        request.onupgradeneeded = () => {
            const database = request.result;

            if (!database.objectStoreNames.contains(RECEIPT_STORE_NAME)) {
                database.createObjectStore(RECEIPT_STORE_NAME, {
                    keyPath: "paymentId"
                });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveReceipt(paymentId, file) {
    const database = await openReceiptDatabase();

    await new Promise((resolve, reject) => {
        const transaction = database.transaction(RECEIPT_STORE_NAME, "readwrite");
        const store = transaction.objectStore(RECEIPT_STORE_NAME);

        store.put({
            paymentId: receiptRecordId(paymentId),
            originalPaymentId: paymentId,
            workspaceId: window.AtlasStore?.workspaceId || "local",
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            file,
            savedAt: new Date().toISOString()
        });

        transaction.oncomplete = () => {
            database.close();
            resolve();
        };

        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
    });

    const storage = window.AtlasAuth?.client?.storage;
    const workspaceId = window.AtlasStore?.workspaceId;
    if (!storage || !workspaceId) return "";

    const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-").slice(-100) || "comprobante";
    const path = `${workspaceId}/${paymentId}/${safeName}`;
    const { error } = await storage.from("atlas-files").upload(path, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream"
    });
    if (error) {
        console.warn("El comprobante quedó solo en este dispositivo:", error.message);
        return null;
    }
    return path;
}

async function getReceipt(paymentId, cloudPath = "") {
    if (cloudPath && window.AtlasAuth?.client?.storage) {
        const { data, error } = await window.AtlasAuth.client.storage
            .from("atlas-files")
            .download(cloudPath);
        if (!error && data) {
            const payment = obligations.flatMap(item => item.payments || []).find(item => String(item.id) === String(paymentId));
            return {
                paymentId,
                name: payment?.receipt?.name || cloudPath.split("/").pop() || "comprobante",
                type: payment?.receipt?.type || data.type || "application/octet-stream",
                size: data.size,
                file: data
            };
        }
    }
    const database = await openReceiptDatabase();
    const read = key => new Promise((resolve, reject) => {
        const transaction = database.transaction(RECEIPT_STORE_NAME, "readonly");
        const request = transaction.objectStore(RECEIPT_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
    try {
        return await read(receiptRecordId(paymentId)) || await read(paymentId);
    } finally {
        database.close();
    }
}

async function deleteReceipt(paymentId, cloudPath = "") {
    if (cloudPath && window.AtlasAuth?.client?.storage) {
        const { error } = await window.AtlasAuth.client.storage.from("atlas-files").remove([cloudPath]);
        if (error) console.warn("No se borró la copia en la nube:", error.message);
    }
    const database = await openReceiptDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(RECEIPT_STORE_NAME, "readwrite");
        const store = transaction.objectStore(RECEIPT_STORE_NAME);
        store.delete(receiptRecordId(paymentId));
        store.delete(paymentId);

        transaction.oncomplete = () => {
            database.close();
            resolve();
        };

        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
    });
}

function formatFileSize(size) {
    if (size < 1024 * 1024) {
        return `${Math.max(1, Math.round(size / 1024))} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedReceipt(file) {
    const allowedTypes = new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf"
    ]);

    const allowedExtension = /\.(jpe?g|png|webp|pdf)$/i.test(file.name);

    return allowedTypes.has(file.type) || (file.type === "" && allowedExtension);
}

function normalizeObligation(obligation) {
    const payments = Array.isArray(obligation?.payments)
        ? obligation.payments.map(payment => ({
            ...payment,
            id: validIdentifier(payment?.id),
            amount: positiveNumber(payment?.amount),
            date: String(payment?.date || ""),
            reference: String(payment?.reference || ""),
            note: String(payment?.note || "")
        }))
        : [];
    const paidFromHistory = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const allowedFrequencies = new Set(["once", "monthly", "installment"]);

    return {
        ...obligation,
        id: validIdentifier(obligation?.id),
        name: String(obligation?.name || "").trim(),
        amount: positiveNumber(obligation?.amount),
        payments,
        paidAmount: payments.length ? paidFromHistory : positiveNumber(obligation?.paidAmount),
        dueDate: String(obligation?.dueDate || ""),
        frequency: allowedFrequencies.has(obligation?.frequency) ? obligation.frequency : "once",
        installmentNumber: positiveInteger(obligation?.installmentNumber),
        installmentTotal: positiveInteger(obligation?.installmentTotal)
    };
}

function normalizeTransaction(transaction) {
    return {
        ...transaction,
        id: validIdentifier(transaction?.id),
        description: String(transaction?.description || "").trim(),
        amount: positiveNumber(transaction?.amount),
        type: transaction?.type === "income" ? "income" : "expense",
        createdAt: String(transaction?.createdAt || "")
    };
}

function validIdentifier(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && value.length <= 128) return value;
    return createId();
}

function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveInteger(value) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number > 0 ? number : null;
}

function saveData() {
    writingFinanceData = true;
    try {
        window.Atlas?.writeJSON(TRANSACTIONS_KEY, transactions);
        window.Atlas?.writeJSON(OBLIGATIONS_KEY, obligations);
    } finally {
        writingFinanceData = false;
    }
}

function createId() {
    return Date.now() + Math.floor(Math.random() * 1000);
}

function getTodayISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
    return new Date(`${dateString}T00:00:00`);
}

function isValidISODate(dateString) {
    const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1])
        && date.getUTCMonth() === Number(match[2]) - 1
        && date.getUTCDate() === Number(match[3]);
}

function formatDate(dateString) {
    if (!isValidISODate(dateString)) return "Fecha no válida";

    return new Intl.DateTimeFormat("es-PY", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(parseLocalDate(dateString));
}

function formatCurrency(value) {
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

function getRemaining(obligation) {
    return Math.max(0, Number(obligation.amount) - Number(obligation.paidAmount || 0));
}

function daysUntil(dateString) {
    if (!isValidISODate(dateString)) return Number.POSITIVE_INFINITY;
    const today = parseLocalDate(getTodayISO());
    const dueDate = parseLocalDate(dateString);
    return Math.round((dueDate - today) / 86400000);
}

function formatTransactionDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Fecha no válida";
    return new Intl.DateTimeFormat("es-PY", { dateStyle: "medium" }).format(date);
}

function getObligationStatus(obligation) {
    const remaining = getRemaining(obligation);
    const days = daysUntil(obligation.dueDate);
    const hasPartialPayment = remaining > 0 && Number(obligation.paidAmount || 0) > 0;

    if (remaining === 0) {
        return { key: "paid", label: "Pagada" };
    }

    if (days < 0) {
        return {
            key: "overdue",
            label: hasPartialPayment ? "Vencida · pago parcial" : "Vencida"
        };
    }

    if (days === 0) {
        return { key: "today", label: "Vence hoy" };
    }

    if (days <= 7) {
        return { key: "soon", label: `Vence en ${days} día${days === 1 ? "" : "s"}` };
    }

    if (hasPartialPayment) {
        return { key: "partial", label: "Pago parcial" };
    }

    return { key: "pending", label: "Pendiente" };
}

function getFrequencyLabel(obligation) {
    if (obligation.frequency === "monthly") return "Mensual";

    if (obligation.frequency === "installment") {
        return `Cuota ${obligation.installmentNumber} de ${obligation.installmentTotal}`;
    }

    return "Pago único";
}

function renderSummary() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalIncome = 0;
    let totalExpense = 0;
    let monthIncome = 0;
    let monthExpense = 0;

    transactions.forEach((transaction) => {
        const amount = Number(transaction.amount || 0);
        const transactionDate = new Date(transaction.createdAt);
        const isCurrentMonth =
            transactionDate.getMonth() === currentMonth &&
            transactionDate.getFullYear() === currentYear;

        if (transaction.type === "income") {
            totalIncome += amount;
            if (isCurrentMonth) monthIncome += amount;
        } else {
            totalExpense += amount;
            if (isCurrentMonth) monthExpense += amount;
        }
    });

    const unpaid = obligations.filter((obligation) => getRemaining(obligation) > 0);
    const totalPending = unpaid.reduce((sum, obligation) => sum + getRemaining(obligation), 0);

    balanceAmount.textContent = formatCurrency(totalIncome - totalExpense);
    incomeAmount.textContent = formatCurrency(monthIncome);
    expenseAmount.textContent = formatCurrency(monthExpense);
    pendingAmount.textContent = formatCurrency(totalPending);
    pendingCount.textContent = `${unpaid.length} ${unpaid.length === 1 ? "pendiente" : "pendientes"}`;
}

function renderAlerts() {
    const overdue = obligations.filter((obligation) => {
        return getRemaining(obligation) > 0 && daysUntil(obligation.dueDate) < 0;
    });

    const dueSoon = obligations.filter((obligation) => {
        const days = daysUntil(obligation.dueDate);
        return getRemaining(obligation) > 0 && days >= 0 && days <= 7;
    });

    if (overdue.length === 0 && dueSoon.length === 0) {
        financeAlerts.hidden = true;
        financeAlerts.innerHTML = "";
        return;
    }

    const messages = [];

    if (overdue.length > 0) {
        messages.push(`${overdue.length} cuenta${overdue.length === 1 ? " está" : "s están"} vencida${overdue.length === 1 ? "" : "s"}.`);
    }

    if (dueSoon.length > 0) {
        messages.push(`${dueSoon.length} cuenta${dueSoon.length === 1 ? " vence" : "s vencen"} dentro de los próximos 7 días.`);
    }

    financeAlerts.innerHTML = `
        <h2>⚠ Requiere atención</h2>
        <ul>${messages.map((message) => `<li>${message}</li>`).join("")}</ul>
    `;
    financeAlerts.hidden = false;
}

function renderObligations() {
    if (obligations.length === 0) {
        obligationsList.innerHTML = `
            <p class="empty-state">Todavía no registraste cuentas por pagar.</p>
        `;
        return;
    }

    const sortedObligations = [...obligations].sort((a, b) => {
        const aPaid = getRemaining(a) === 0;
        const bPaid = getRemaining(b) === 0;

        if (aPaid !== bPaid) return aPaid ? 1 : -1;
        return parseLocalDate(a.dueDate) - parseLocalDate(b.dueDate);
    });

    obligationsList.innerHTML = sortedObligations.map((obligation) => {
        const remaining = getRemaining(obligation);
        const status = getObligationStatus(obligation);
        const payments = obligation.payments || [];
        const paymentHistory = payments.map((payment) => {
            const reference = payment.reference
                ? ` · Ref: ${escapeHTML(payment.reference)}`
                : "";

            const receiptButton = payment.receipt
                ? `
                    <button
                        class="receipt-button"
                        data-action="view-receipt"
                        data-payment-id="${escapeHTML(String(payment.id))}"
                        type="button"
                    >
                        📎 Ver comprobante
                    </button>
                `
                : "";

            return `
                <li>
                    <span>${formatDate(payment.date)} · ${formatCurrency(payment.amount)}${reference}</span>
                    ${receiptButton}
                </li>
            `;
        }).join("");

        return `
            <article class="obligation-item">
                <div class="obligation-top">
                    <div>
                        <div class="obligation-title-row">
                            <h3>${escapeHTML(obligation.name)}</h3>
                            <span class="status-badge status-${status.key}">${status.label}</span>
                        </div>
                        <p class="obligation-meta">
                            <span>Vence: ${formatDate(obligation.dueDate)}</span>
                            <span>${getFrequencyLabel(obligation)}</span>
                            ${Number(obligation.paidAmount || 0) > 0
                                ? `<span>Pagado: ${formatCurrency(obligation.paidAmount)}</span>`
                                : ""
                            }
                        </p>
                    </div>

                    <div class="obligation-money">
                        <strong>${formatCurrency(remaining)}</strong>
                        <small>${remaining === 0 ? "Cuenta completada" : "Falta pagar"}</small>
                    </div>
                </div>

                <div class="obligation-actions">
                    ${payments.length > 0
                        ? `<button class="small-button" data-action="undo-payment" data-id="${escapeHTML(String(obligation.id))}" type="button">Anular último pago</button>`
                        : ""
                    }
                    ${remaining > 0
                        ? `<button class="primary-button" data-action="pay" data-id="${escapeHTML(String(obligation.id))}" type="button">Registrar pago</button>`
                        : ""
                    }
                    <button class="danger-button" data-action="delete-obligation" data-id="${escapeHTML(String(obligation.id))}" type="button">Eliminar</button>
                </div>

                ${payments.length > 0
                    ? `
                        <details class="payment-history">
                            <summary>Ver historial de pagos (${payments.length})</summary>
                            <ul>${paymentHistory}</ul>
                        </details>
                    `
                    : ""
                }
            </article>
        `;
    }).join("");
}

function renderTransactions() {
    if (transactions.length === 0) {
        transactionsList.innerHTML = `
            <p class="empty-state">Todavía no registraste ingresos ni gastos.</p>
        `;
        return;
    }

    const sortedTransactions = [...transactions].sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    transactionsList.innerHTML = sortedTransactions.map((transaction) => {
        const isIncome = transaction.type === "income";
        const isAutomatic = Boolean(transaction.paymentId);

        return `
            <article class="transaction-item">
                <div class="transaction-info">
                    <strong>${escapeHTML(transaction.description)}</strong>
                    <small>
                        ${formatTransactionDate(transaction.createdAt)}
                        ${isAutomatic ? '<span class="automatic-badge">Pago automático</span>' : ""}
                    </small>
                </div>

                <div class="transaction-side">
                    <span class="transaction-amount ${transaction.type}">
                        ${isIncome ? "+" : "−"} ${formatCurrency(transaction.amount)}
                    </span>
                    ${isAutomatic
                        ? ""
                        : `<button class="danger-button" data-action="delete-transaction" data-id="${escapeHTML(String(transaction.id))}" type="button">Eliminar</button>`
                    }
                </div>
            </article>
        `;
    }).join("");
}

function renderAll() {
    renderSummary();
    renderAlerts();
    renderObligations();
    renderTransactions();
    window.Atlas?.updateNavCounts();
}

function addMonthsSafely(dateString, months) {
    const date = parseLocalDate(dateString);
    const originalDay = date.getDate();
    const targetMonth = date.getMonth() + months;

    date.setDate(1);
    date.setMonth(targetMonth);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(originalDay, lastDay));

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function generateNextObligation(obligation) {
    if (obligation.nextObligationId) return;

    const shouldCreateMonthly = obligation.frequency === "monthly";
    const shouldCreateInstallment =
        obligation.frequency === "installment" &&
        Number(obligation.installmentNumber) < Number(obligation.installmentTotal);

    if (!shouldCreateMonthly && !shouldCreateInstallment) return;

    const nextObligation = {
        id: createId(),
        name: obligation.name,
        amount: obligation.amount,
        paidAmount: 0,
        dueDate: addMonthsSafely(obligation.dueDate, 1),
        frequency: obligation.frequency,
        installmentNumber: shouldCreateInstallment
            ? Number(obligation.installmentNumber) + 1
            : null,
        installmentTotal: shouldCreateInstallment
            ? Number(obligation.installmentTotal)
            : null,
        payments: [],
        createdAt: new Date().toISOString(),
        parentObligationId: obligation.id
    };

    obligation.nextObligationId = nextObligation.id;
    obligations.push(nextObligation);
}

function openPayment(obligationId) {
    const obligation = obligations.find((item) => String(item.id) === String(obligationId));
    if (!obligation) return;

    const remaining = getRemaining(obligation);
    paymentObligationId.value = obligation.id;
    paymentTitle.textContent = obligation.name;
    paymentRemaining.textContent = `Falta pagar: ${formatCurrency(remaining)}`;
    paymentAmount.value = remaining;
    paymentAmount.max = remaining;
    paymentDate.value = getTodayISO();
    paymentReference.value = "";
    paymentNote.value = "";

    if (paymentReceipt) {
        paymentReceipt.value = "";
    }

    if (receiptSelection) {
        receiptSelection.hidden = true;
        receiptSelection.textContent = "";
    }

    paymentDialog.showModal();
}

function closeDialog() {
    paymentDialog.close();
    paymentForm.reset();

    if (receiptSelection) {
        receiptSelection.hidden = true;
        receiptSelection.textContent = "";
    }
}

async function undoLastPayment(obligationId) {
    const obligation = obligations.find((item) => String(item.id) === String(obligationId));
    if (!obligation || !obligation.payments?.length) return;

    if (obligation.nextObligationId) {
        const nextObligation = obligations.find((item) => String(item.id) === String(obligation.nextObligationId));
        const nextHasActivity = nextObligation && Number(nextObligation.paidAmount || 0) > 0;

        if (nextHasActivity) {
            alert("No se puede anular este pago porque la siguiente cuenta ya tiene pagos registrados.");
            return;
        }

        obligations = obligations.filter((item) => String(item.id) !== String(obligation.nextObligationId));
        delete obligation.nextObligationId;
    }

    const lastPayment = obligation.payments[obligation.payments.length - 1];
    const confirmed = confirm(`¿Anular el pago de ${formatCurrency(lastPayment.amount)}?`);
    if (!confirmed) return;

    obligation.payments.pop();
    obligation.paidAmount = obligation.payments.reduce((sum, payment) => {
        return sum + Number(payment.amount || 0);
    }, 0);

    transactions = transactions.filter((transaction) => String(transaction.paymentId) !== String(lastPayment.id));

    if (lastPayment.receipt) {
        try {
            await deleteReceipt(lastPayment.id, lastPayment.receipt?.path || "");
        } catch (error) {
            console.error("No se pudo borrar el comprobante:", error);
        }
    }

    saveData();
    renderAll();
}

function closeReceiptViewer() {
    if (activeReceiptUrl) {
        URL.revokeObjectURL(activeReceiptUrl);
        activeReceiptUrl = "";
    }

    receiptViewer?.replaceChildren();

    if (receiptDialog?.open) {
        receiptDialog.close();
    }
}

async function viewReceipt(paymentId) {
    if (!receiptDialog || !receiptViewer || !receiptTitle || !downloadReceipt) {
        alert("Actualizá finance.html para poder abrir los comprobantes guardados.");
        return;
    }

    try {
        const payment = obligations.flatMap(item => item.payments || []).find(item => String(item.id) === String(paymentId));
        const storedPaymentId = payment?.id ?? paymentId;
        const receipt = await getReceipt(storedPaymentId, payment?.receipt?.path || "");

        if (!receipt?.file) {
            alert("El comprobante no está disponible en este dispositivo.");
            return;
        }

        if (activeReceiptUrl) {
            URL.revokeObjectURL(activeReceiptUrl);
        }

        activeReceiptUrl = URL.createObjectURL(receipt.file);
        receiptTitle.textContent = receipt.name || "Comprobante de pago";
        receiptViewer.replaceChildren();

        if (receipt.type.startsWith("image/")) {
            const image = document.createElement("img");
            image.src = activeReceiptUrl;
            image.alt = "Comprobante de pago";
            receiptViewer.appendChild(image);
        } else {
            const frame = document.createElement("iframe");
            frame.src = activeReceiptUrl;
            frame.title = "Comprobante de pago en PDF";
            receiptViewer.appendChild(frame);
        }

        downloadReceipt.href = activeReceiptUrl;
        downloadReceipt.download = receipt.name || "comprobante";
        receiptDialog.showModal();
    } catch (error) {
        console.error("No se pudo abrir el comprobante:", error);
        alert("No se pudo abrir el comprobante guardado.");
    }
}

obligationFrequency.addEventListener("change", () => {
    installmentFields.hidden = obligationFrequency.value !== "installment";
});

obligationForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = obligationName.value.trim();
    const amount = Math.round(Number(obligationAmount.value));
    const dueDate = obligationDueDate.value;
    const frequency = obligationFrequency.value;
    const currentInstallment = Number(installmentNumber.value);
    const totalInstallments = Number(installmentTotal.value);

    if (!name || !dueDate || !Number.isFinite(amount) || amount <= 0) {
        alert("Completá el nombre, el monto y la fecha de vencimiento.");
        return;
    }

    if (frequency === "installment" && (
        currentInstallment < 1 ||
        totalInstallments < 2 ||
        currentInstallment > totalInstallments
    )) {
        alert("Revisá el número de cuota y el total de cuotas.");
        return;
    }

    obligations.push({
        id: createId(),
        name,
        amount,
        paidAmount: 0,
        dueDate,
        frequency,
        installmentNumber: frequency === "installment" ? currentInstallment : null,
        installmentTotal: frequency === "installment" ? totalInstallments : null,
        payments: [],
        createdAt: new Date().toISOString()
    });

    saveData();
    obligationForm.reset();
    installmentNumber.value = 1;
    installmentTotal.value = 12;
    installmentFields.hidden = true;
    obligationDueDate.value = getTodayISO();
    renderAll();
});

transactionForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const description = transactionDescription.value.trim();
    const amount = Math.round(Number(transactionAmount.value));
    const date = transactionDate.value;

    if (!description || !date || !Number.isFinite(amount) || amount <= 0) {
        alert("Completá la fecha, una descripción y un monto válido.");
        return;
    }

    transactions.push({
        id: createId(),
        description,
        amount,
        type: transactionType.value,
        createdAt: `${date}T12:00:00`
    });

    saveData();
    transactionForm.reset();
    transactionType.value = "expense";
    transactionDate.value = getTodayISO();
    renderAll();
});

paymentReceipt?.addEventListener("change", () => {
    const file = paymentReceipt.files[0];

    if (!file) {
        receiptSelection.hidden = true;
        receiptSelection.textContent = "";
        return;
    }

    if (!isAllowedReceipt(file)) {
        alert("El comprobante debe ser una imagen JPG, PNG, WEBP o un archivo PDF.");
        paymentReceipt.value = "";
        receiptSelection.hidden = true;
        return;
    }

    if (file.size > MAX_RECEIPT_SIZE) {
        alert("El comprobante supera el límite de 10 MB.");
        paymentReceipt.value = "";
        receiptSelection.hidden = true;
        return;
    }

    receiptSelection.textContent = `✓ ${file.name} · ${formatFileSize(file.size)}`;
    receiptSelection.hidden = false;
});

paymentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const obligationId = paymentObligationId.value;
    const obligation = obligations.find((item) => String(item.id) === String(obligationId));
    if (!obligation) return;

    const amount = Math.round(Number(paymentAmount.value));
    const remaining = getRemaining(obligation);

    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
        alert(`El pago debe ser mayor a cero y no superar ${formatCurrency(remaining)}.`);
        return;
    }

    if (!paymentDate.value) {
        alert("Indicá la fecha del pago.");
        return;
    }

    const receiptFile = paymentReceipt?.files?.[0] || null;

    if (receiptFile && (!isAllowedReceipt(receiptFile) || receiptFile.size > MAX_RECEIPT_SIZE)) {
        alert("Revisá el formato o el tamaño del comprobante.");
        return;
    }

    const submitButton = paymentForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Guardando…";

    const payment = {
        id: createId(),
        amount,
        date: paymentDate.value,
        reference: paymentReference.value.trim(),
        note: paymentNote.value.trim(),
        receipt: receiptFile
            ? {
                name: receiptFile.name,
                type: receiptFile.type || "application/octet-stream",
                size: receiptFile.size
            }
            : null,
        createdAt: new Date().toISOString()
    };

    if (receiptFile) {
        try {
            const path = await saveReceipt(payment.id, receiptFile);
            if (path === null) payment.receipt.cloudPending = true;
            else payment.receipt.path = path;
        } catch (error) {
            console.error("No se pudo guardar el comprobante:", error);
            alert("No se pudo guardar el archivo. El pago todavía no fue registrado.");
            submitButton.disabled = false;
            submitButton.textContent = "Confirmar pago";
            return;
        }
    }

    obligation.payments.push(payment);
    obligation.paidAmount = obligation.payments.reduce((sum, item) => {
        return sum + Number(item.amount || 0);
    }, 0);

    transactions.push({
        id: createId(),
        description: `Pago: ${obligation.name}`,
        amount,
        type: "expense",
        createdAt: `${payment.date}T12:00:00`,
        obligationId: obligation.id,
        paymentId: payment.id,
        reference: payment.reference
    });

    if (getRemaining(obligation) === 0) {
        generateNextObligation(obligation);
    }

    saveData();
    closeDialog();
    renderAll();
    window.Atlas?.notify(
        payment.receipt?.cloudPending
            ? "Pago registrado. El comprobante quedó solo en este dispositivo."
            : "Pago registrado.",
        payment.receipt?.cloudPending ? "warning" : "success"
    );

    submitButton.disabled = false;
    submitButton.textContent = "Confirmar pago";
});

obligationsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;

    if (action === "view-receipt") {
        viewReceipt(button.dataset.paymentId);
        return;
    }

    const obligationId = button.dataset.id;

    if (action === "pay") {
        openPayment(obligationId);
        return;
    }

    if (action === "undo-payment") {
        undoLastPayment(obligationId);
        return;
    }

    if (action === "delete-obligation") {
        const obligation = obligations.find((item) => String(item.id) === String(obligationId));
        if (!obligation) return;

        if (obligation.payments?.length) {
            alert("Primero anulá los pagos registrados de esta cuenta.");
            return;
        }

        const confirmed = confirm(`¿Eliminar la cuenta “${obligation.name}”?`);
        if (!confirmed) return;

        obligations = obligations.filter((item) => String(item.id) !== String(obligationId));

        if (obligation.parentObligationId) {
            const parent = obligations.find((item) => String(item.id) === String(obligation.parentObligationId));
            if (parent) delete parent.nextObligationId;
        }

        saveData();
        renderAll();
    }
});

transactionsList.addEventListener("click", (event) => {
    const button = event.target.closest('button[data-action="delete-transaction"]');
    if (!button) return;

    const transactionId = button.dataset.id;
    const confirmed = confirm("¿Eliminar este movimiento?");
    if (!confirmed) return;

    transactions = transactions.filter((transaction) => String(transaction.id) !== String(transactionId));
    saveData();
    renderAll();
});

closePaymentDialog?.addEventListener("click", closeDialog);
cancelPayment?.addEventListener("click", closeDialog);
closeReceiptDialog?.addEventListener("click", closeReceiptViewer);
doneReceiptDialog?.addEventListener("click", closeReceiptViewer);

paymentDialog.addEventListener("click", (event) => {
    if (event.target === paymentDialog) closeDialog();
});

receiptDialog?.addEventListener("click", (event) => {
    if (event.target === receiptDialog) closeReceiptViewer();
});

function synchronizeFinancePage() {
    reloadStoredData();
    renderAll();
}

window.addEventListener("pageshow", synchronizeFinancePage);

window.addEventListener("storage", (event) => {
    if (window.Atlas.storageKeyMatches(event.key, TRANSACTIONS_KEY) || window.Atlas.storageKeyMatches(event.key, OBLIGATIONS_KEY)) {
        synchronizeFinancePage();
    }
});
window.addEventListener("atlas:data-changed", event => {
    if (!writingFinanceData && [TRANSACTIONS_KEY, OBLIGATIONS_KEY].includes(event.detail?.key)) {
        synchronizeFinancePage();
    }
});

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        synchronizeFinancePage();
    }
});

if (obligationDueDate) {
    obligationDueDate.value = getTodayISO();
}

if (paymentDate) {
    paymentDate.value = getTodayISO();
}
if (transactionDate) {
    transactionDate.value = getTodayISO();
}

synchronizeFinancePage();

document.querySelector("#focusObligation")?.addEventListener("click", () => {
    obligationName?.focus();
    obligationForm?.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.querySelector("#focusTransaction")?.addEventListener("click", () => {
    transactionDescription?.focus();
    transactionForm?.scrollIntoView({ behavior: "smooth", block: "center" });
});
