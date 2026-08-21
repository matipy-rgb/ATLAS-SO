import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(ROOT, file), "utf8");

const dom = new JSDOM("<!doctype html><body></body>", {
    url: "https://atlas.test/finance.html",
    runScripts: "outside-only"
});
const { window } = dom;
window.structuredClone = structuredClone;
window.BroadcastChannel = undefined;
window.eval(await read("finance-core.js"));
window.eval(await read("finance-domain.js"));
window.eval(await read("finance-storage.js"));
window.eval(await read("finance-repository.js"));
window.eval(await read("finance-migration.js"));

const Core = window.AtlasFinanceCore;
const Domain = window.AtlasFinanceDomain;
const { FinanceStorage } = window.AtlasFinanceStorage;
const { FinanceRepository } = window.AtlasFinanceRepository;
const { FinanceMigration } = window.AtlasFinanceMigration;
const options = { workspaceId: "11111111-1111-4111-8111-111111111111", userId: "user-test", now: "2026-08-17T12:00:00.000Z" };

assert.match(Core.formatMoney(1500000), /1[.\s]?500[.\s]?000/);
assert.equal(Core.safeInteger("125000"), 125000);
assert.equal(Core.safeInteger("1.5"), null);
assert.equal(Core.positiveMoney(0), null);
assert.equal(Core.positiveMoney(Core.MAX_PYG + 1), null);
assert.deepEqual([...Core.splitMoney(100, 3)], [34, 33, 33]);
assert.equal(Core.splitMoney(1000001, 12).reduce((sum, amount) => sum + amount, 0), 1000001);
assert.equal(Core.isISODate("2026-02-29"), false);
assert.equal(Core.personalContextId(options.workspaceId), Core.personalContextId(options.workspaceId));
assert.notEqual(Core.personalContextId(options.workspaceId), options.workspaceId);

const personal = Core.contextRecord({ kind: "personal", name: " Personal " }, options);
const business = Core.contextRecord({ kind: "business", name: "Tienda Norte" }, options);
assert.deepEqual(
    Core.defaultCategories(personal.id, options).map(item => item.id),
    Core.defaultCategories(personal.id, options).map(item => item.id),
    "Las categorías iniciales deben ser estables entre dispositivos"
);

const cash = Core.accountRecord({
    context_id: personal.id,
    name: "Efectivo",
    account_type: "cash",
    opening_balance: 500000,
    opened_on: "2026-08-01"
}, options);
assert.equal(personal.name, "Personal");
assert.equal(cash.currency, "PYG");
assert.throws(() => Core.accountRecord({
    context_id: personal.id,
    name: "Cuenta inválida",
    account_type: "cash",
    opening_balance: "10.5",
    opened_on: "2026-08-01"
}, options), /entero/);

const transactions = [
    { id: "in", account_id: cash.id, context_id: personal.id, status: "confirmed", transaction_type: "income", amount: 300000, occurred_at: "2026-08-10T12:00:00Z", description: "Ingreso" },
    { id: "out", account_id: cash.id, context_id: personal.id, status: "confirmed", transaction_type: "expense", amount: 120000, occurred_at: "2026-08-11T12:00:00Z", description: "Gasto" },
    { id: "pending", account_id: cash.id, context_id: personal.id, status: "pending", transaction_type: "expense", amount: 999999, occurred_at: "2026-08-12T12:00:00Z", description: "Pendiente" }
];
assert.equal(Core.accountBalance(cash, transactions), 680000);
assert.deepEqual(
    JSON.parse(JSON.stringify(Core.financialSummary({ accounts: [cash], transactions, contextId: personal.id, month: "2026-08" }))),
    { available: 680000, income: 300000, expense: 120000, result: 180000, accounts: 1 }
);

const transferOut = Domain.transactionRecord({
    id: "22222222-2222-4222-8222-222222222222", context_id: personal.id,
    account_id: cash.id, operation_group_id: "33333333-3333-4333-8333-333333333333",
    operation_kind: "transfer", transaction_type: "expense", reporting_effect: "neutral",
    balance_delta: -50000, amount: 50000, occurred_at: "2026-08-12", description: "Transferencia"
}, options);
assert.equal(transferOut.reporting_effect, "neutral");
assert.equal(transferOut.balance_delta, -50000);
const obligationFixture = Domain.obligationRecord({
    context_id: personal.id, obligation_type: "receivable", name: "Cliente",
    principal_amount: 200000, interest_amount: 10000, surcharge_amount: 5000,
    paid_amount: 50000, due_date: "2026-08-20"
}, options);
assert.equal(obligationFixture.direction, "receivable");
assert.equal(Domain.obligationTotal(obligationFixture), 215000);
assert.equal(Domain.obligationState({ ...obligationFixture, due_date: "2026-08-01" }, "2026-08-17"), "overdue");
const budgetFixture = Domain.budgetRecord({ context_id: personal.id, category_id: "category-test", month: "2026-08", planned_amount: 300000 }, options);
const budgetResult = Domain.budgetSummary({ budgets: [budgetFixture], transactions: [{ ...transactions[1], category_id: "category-test", reporting_effect: "expense" }], obligations: [], month: "2026-08", contextId: personal.id });
assert.equal(budgetResult[0].spent, 120000);
assert.equal(budgetResult[0].available, 180000);
const goalFixture = Domain.goalRecord({ context_id: personal.id, name: "Reserva", target_amount: 1000000 }, options);
const goalEntries = [
    Domain.goalEntryRecord({ context_id: personal.id, goal_id: goalFixture.id, entry_type: "contribution", amount: 250000, occurred_on: "2026-08-10" }, options),
    Domain.goalEntryRecord({ context_id: personal.id, goal_id: goalFixture.id, entry_type: "withdrawal", amount: 50000, occurred_on: "2026-08-11" }, options)
];
assert.deepEqual(JSON.parse(JSON.stringify(Domain.goalProgress(goalFixture, goalEntries))), { saved: 200000, remaining: 800000, percent: 20 });

const historicalAccount = {
    ...cash, id: "historical-account", opening_balance: 100000, opened_on: "2026-07-01",
    status: "archived", archived_at: "2026-08-15T12:00:00Z"
};
const futureAccount = { ...cash, id: "future-account", opening_balance: 900000, opened_on: "2026-09-01" };
const historicalTransactions = [
    { ...transactions[0], id: "historical-income", account_id: historicalAccount.id, amount: 50000, occurred_at: "2026-07-10T12:00:00Z" },
    { ...transactions[1], id: "voided-later", account_id: historicalAccount.id, amount: 20000, status: "void", voided_at: "2026-08-10T12:00:00Z", occurred_at: "2026-07-11T12:00:00Z" },
    { ...transactions[0], id: "future-income", account_id: futureAccount.id, amount: 900000, occurred_at: "2026-09-10T12:00:00Z" }
];
assert.deepEqual(JSON.parse(JSON.stringify(Core.financialSummary({
    accounts: [historicalAccount, futureAccount], transactions: historicalTransactions,
    contextId: personal.id, month: "2026-07"
}))), { available: 130000, income: 50000, expense: 20000, result: 30000, accounts: 1 }, "La consulta histórica debe respetar apertura, archivo y anulación posterior");
const historicalObligation = {
    id: "historical-obligation", context_id: personal.id, account_id: null, category_id: null,
    direction: "payable", obligation_type: "payable", principal_amount: 80000, paid_amount: 80000,
    due_date: "2026-07-25", created_at: "2026-07-01T12:00:00Z", status: "paid"
};
const laterPayment = {
    id: "later-payment", obligation_id: historicalObligation.id, amount: 80000,
    paid_on: "2026-08-02", status: "confirmed"
};
const futureAsset = {
    id: "future-asset", context_id: personal.id, asset_class: "asset", opening_value: 700000,
    valued_on: "2026-09-01", status: "active"
};
assert.deepEqual(JSON.parse(JSON.stringify(Domain.netWorth({
    accounts: [historicalAccount, futureAccount], transactions: historicalTransactions,
    obligations: [historicalObligation], payments: [laterPayment], assets: [futureAsset],
    contextId: personal.id, month: "2026-07"
}))), { assets: 130000, liabilities: 80000, net: 50000 }, "El patrimonio histórico no debe usar pagos ni activos futuros");
const historicalClose = Domain.closeSnapshot({
    accounts: [historicalAccount, futureAccount], transactions: historicalTransactions,
    obligations: [historicalObligation], payments: [laterPayment], budgets: [], assets: [futureAsset], valuations: []
}, personal.id, "2026-07", { observations: "Saldo verificado" });
assert.equal(historicalClose.accounts.length, 1);
assert.equal(historicalClose.payable, 80000);
assert.equal(historicalClose.observations, "Saldo verificado");

const validLegacyTransactions = [{ id: 1, type: "expense", amount: 25000, createdAt: "2026-08-01T12:00:00", description: "Compra" }];
const validLegacyObligations = [{
    id: 2,
    name: "Servicio",
    amount: 100000,
    dueDate: "2026-08-20",
    frequency: "once",
    payments: [{ id: 3, amount: 40000, date: "2026-08-10", receipt: { name: "pago.pdf" } }]
}];
const preview = Core.previewLegacy(validLegacyTransactions, validLegacyObligations);
assert.deepEqual(JSON.parse(JSON.stringify(preview.counts)), { transactions: 1, obligations: 1, payments: 1, attachments: 1, errors: 0 });
assert.equal(preview.totals.expense, 25000);
assert.equal(preview.totals.paid, 40000);
const invalidPreview = Core.previewLegacy([{ id: 4, type: "other", amount: -1, createdAt: "mal" }], []);
assert.equal(invalidPreview.errors.length, 3);

const contexts = Array.from({ length: 10 }, (_, index) => ({ id: `context-${index}`, workspace_id: options.workspaceId, name: `Contexto ${index}`, kind: index ? "business" : "personal", status: "active" }));
const accounts = Array.from({ length: 50 }, (_, index) => ({
    id: `account-${index}`,
    workspace_id: options.workspaceId,
    context_id: contexts[index % contexts.length].id,
    name: `Cuenta ${index}`,
    account_type: "cash",
    opening_balance: 100000,
    opened_on: "2026-01-01",
    status: "active"
}));
const volumeCategories = Array.from({ length: 100 }, (_, index) => ({
    id: `category-${index}`,
    workspace_id: options.workspaceId,
    context_id: contexts[index % contexts.length].id,
    name: `Categoría ${index}`,
    flow_type: index % 2 ? "expense" : "income",
    status: "active"
}));
const volumeTransactions = Array.from({ length: 10000 }, (_, index) => ({
    id: `movement-${index}`,
    workspace_id: options.workspaceId,
    context_id: contexts[index % contexts.length].id,
    account_id: accounts[index % accounts.length].id,
    transaction_type: index % 3 ? "expense" : "income",
    status: "confirmed",
    amount: (index % 100 + 1) * 1000,
    description: `Movimiento sintético ${index}`,
    occurred_at: "2026-08-15T12:00:00Z"
}));
const volumeObligations = Array.from({ length: 1000 }, (_, index) => ({
    id: `obligation-${index}`, workspace_id: options.workspaceId,
    context_id: contexts[index % contexts.length].id, obligation_type: index % 4 ? "payable" : "receivable",
    direction: index % 4 ? "payable" : "receivable", name: `Compromiso sintético ${index}`,
    principal_amount: (index % 20 + 1) * 10000, interest_amount: 0, surcharge_amount: 0,
    paid_amount: 0, due_date: `2026-${String(index % 12 + 1).padStart(2, "0")}-15`, status: "pending"
}));
const volumeCloses = Array.from({ length: 60 }, (_, index) => ({
    id: `close-${index}`, workspace_id: options.workspaceId, context_id: contexts[0].id,
    month: Domain.addMonths("2021-09", index), version_number: 1, state: "closed", snapshot: {}
}));
const filterStart = performance.now();
const matches = volumeTransactions.filter(item => Core.searchText(`${item.description} ${item.amount}`).includes("sintetico 999"));
const filterMs = performance.now() - filterStart;
assert.ok(matches.length > 0);
assert.ok(filterMs < 100, `El filtro de 10.000 movimientos tardó ${filterMs.toFixed(2)} ms`);
const summaryStart = performance.now();
Core.financialSummary({ accounts, transactions: volumeTransactions, contextId: "general", month: "2026-08" });
const summaryMs = performance.now() - summaryStart;
assert.ok(summaryMs < 100, `El resumen de 10.000 movimientos tardó ${summaryMs.toFixed(2)} ms`);
const obligationFilterStart = performance.now();
assert.ok(volumeObligations.filter(item => Core.searchText(item.name).includes("sintetico 999")).length === 1);
assert.ok(performance.now() - obligationFilterStart < 100, "El filtro de 1.000 compromisos debe responder en menos de 100 ms");
assert.equal(Domain.isMonthClosed(volumeCloses, contexts[0].id, "2026-08"), true);

const volumeStorage = new FinanceStorage({ indexedDB: null });
await volumeStorage.open();
await volumeStorage.bulkPut("contexts", contexts);
await volumeStorage.bulkPut("accounts", accounts);
await volumeStorage.bulkPut("categories", volumeCategories);
await volumeStorage.bulkPut("transactions", volumeTransactions);
await volumeStorage.bulkPut("obligations", volumeObligations);
await volumeStorage.bulkPut("monthlyCloses", volumeCloses);
assert.equal((await volumeStorage.list("categories", { workspace_id: options.workspaceId })).length, 100);
assert.equal((await volumeStorage.list("transactions", { workspace_id: options.workspaceId })).length, 10000);
assert.equal((await volumeStorage.list("obligations", { workspace_id: options.workspaceId })).length, 1000);
assert.equal((await volumeStorage.list("monthlyCloses", { workspace_id: options.workspaceId })).length, 60);

const storage = new FinanceStorage({ indexedDB: null });
await storage.open();
await storage.put("contexts", personal);
await storage.bulkPut("accounts", [cash]);
assert.equal((await storage.list("contexts", { workspace_id: options.workspaceId })).length, 1);
assert.equal((await storage.list("accounts", { context_id: personal.id }))[0].name, "Efectivo");
await storage.queue({ operationId: "op-1", workspace_id: options.workspaceId, entity: "accounts", action: "create", record: cash });
assert.equal((await storage.pending(options.workspaceId)).length, 1);
await storage.conflict((await storage.pending(options.workspaceId))[0], { ...cash, version: 2 });
assert.equal((await storage.list("conflicts", { workspace_id: options.workspaceId })).length, 1);
assert.equal((await storage.list("conflicts", { workspace_id: options.workspaceId }))[0].operation.operationId, "op-1");
assert.equal(await storage.clearWorkspace("conflicts", options.workspaceId), 1);
assert.equal((await storage.list("conflicts", { workspace_id: options.workspaceId })).length, 0);

const repositoryStorage = new FinanceStorage({ indexedDB: null });
const repository = new FinanceRepository({
    workspaceId: options.workspaceId,
    userId: options.userId,
    workspaceRole: "owner",
    client: null,
    storage: repositoryStorage
});
await repository.initialize();
let snapshot = await repository.snapshot();
assert.equal(snapshot.contexts.filter(item => item.kind === "personal").length, 1);
assert.equal(snapshot.categories.length, 0, "Un espacio nuevo no debe imponer categorías.");
assert.equal(snapshot.paymentMethods.length, 0, "Un espacio nuevo no debe imponer medios de pago.");
const temporaryCategories = await Promise.all(["Casa", "Comida"].map(name => repository.save("categories", {
    context_id: snapshot.contexts.find(item => item.kind === "personal").id,
    name,
    flow_type: "expense"
})));
await repository.archiveMany("categories", temporaryCategories.map(item => item.id), true);
assert.ok((await repository.list("categories")).every(item => item.status === "archived"), "La limpieza completa debe archivar las categorías en una sola operación local.");
const savedBusiness = await repository.save("contexts", business);
const savedAccount = await repository.save("accounts", {
    context_id: savedBusiness.id,
    name: "Caja",
    account_type: "business_cash",
    opening_balance: 250000,
    opened_on: "2026-08-17"
});
const transferTarget = await repository.save("accounts", {
    context_id: savedBusiness.id, name: "Banco", account_type: "bank",
    opening_balance: 0, opened_on: "2026-08-17"
});
const transferRecords = await repository.postOperation({
    context_id: savedBusiness.id, operation_kind: "transfer", amount: 50000,
    account_id: savedAccount.id, destination_account_id: transferTarget.id,
    occurred_at: "2026-08-17T10:00", description: "Fondo para banco"
});
assert.equal(transferRecords.length, 2);
assert.equal(transferRecords.reduce((sum, item) => sum + item.balance_delta, 0), 0);
assert.equal(Core.financialSummary({ accounts: [savedAccount, transferTarget], transactions: transferRecords, contextId: savedBusiness.id, month: "2026-08" }).expense, 0);

const cardAccount = await repository.save("accounts", {
    context_id: savedBusiness.id, name: "Tarjeta", account_type: "credit_card",
    opening_balance: 100000, opened_on: "2026-08-17"
});
const cardTransfer = await repository.postOperation({
    context_id: savedBusiness.id, operation_kind: "transfer", amount: 10000,
    account_id: savedAccount.id, destination_account_id: cardAccount.id,
    occurred_at: "2026-08-17T11:00", description: "Pago directo a tarjeta"
});
assert.deepEqual(Array.from(cardTransfer, item => item.balance_delta), [-10000, -10000], "Transferir a una tarjeta debe reducir efectivo y deuda");
assert.equal(cardTransfer[0].operation_leg, "source");
assert.equal(cardTransfer[1].operation_leg, "destination");
const cardCharge = await repository.postOperation({
    context_id: savedBusiness.id, operation_kind: "expense", amount: 20000,
    account_id: cardAccount.id, occurred_at: "2026-08-17T12:00", description: "Compra con tarjeta"
});
assert.equal(cardCharge[0].balance_delta, 20000, "Una compra debe aumentar la deuda de tarjeta");
assert.equal(cardCharge[0].reporting_effect, "expense");
const cardRefund = await repository.postOperation({
    context_id: savedBusiness.id, operation_kind: "refund", amount: 5000,
    account_id: cardAccount.id, occurred_at: "2026-08-17T13:00", description: "Reembolso en tarjeta"
});
assert.equal(cardRefund[0].balance_delta, -5000, "Un reembolso debe reducir la deuda de tarjeta");
assert.equal(cardRefund[0].reporting_effect, "income");
const cardDebt = await repository.save("obligations", {
    context_id: savedBusiness.id, account_id: cardAccount.id, obligation_type: "card",
    name: "Resumen tarjeta", principal_amount: 60000, paid_amount: 0,
    due_date: "2026-08-25", status: "pending"
});
await assert.rejects(() => repository.payObligation({
    obligation_id: cardDebt.id, amount: 10000, paid_on: "2026-08-18", account_id: cardAccount.id
}), /distinta de la deuda/);
const cardPayment = await repository.payObligation({
    obligation_id: cardDebt.id, amount: 30000, paid_on: "2026-08-18", account_id: savedAccount.id
});
assert.equal(cardPayment.transactions.length, 2, "Pagar una tarjeta debe afectar efectivo y pasivo");
assert.ok(cardPayment.transactions.every(item => item.reporting_effect === "neutral"), "El pago de tarjeta no debe duplicar el gasto");
assert.equal((await repository.list("obligations")).find(item => item.id === cardDebt.id).status, "partial");
const correctedPayment = await repository.updatePayment({ ...cardPayment.payment, amount: 20000, paid_on: "2026-08-19", account_id: savedAccount.id });
assert.equal(correctedPayment.obligation.paid_amount, 20000);
assert.ok(correctedPayment.transactions.every(item => item.amount === 20000));
const voidedPayment = await repository.updatePayment({ ...correctedPayment.payment, status: "void", void_reason: "Pago cargado por duplicado" });
assert.equal(voidedPayment.obligation.paid_amount, 0);
assert.ok(voidedPayment.transactions.every(item => item.status === "void"));

const budgetSaved = await repository.save("budgets", {
    context_id: savedBusiness.id, category_id: (await repository.list("categories", { context_id: savedBusiness.id }))[0]?.id
        || (await repository.save("categories", { context_id: savedBusiness.id, name: "Operación", flow_type: "expense", color: "#2563eb", icon: "●" })).id,
    month: "2026-08", planned_amount: 500000, alert_percent: 80
});
assert.equal(budgetSaved.month, "2026-08");
assert.equal((await repository.archive("budgets", budgetSaved.id, true)).status, "archived");
assert.equal((await repository.archive("budgets", budgetSaved.id, false)).status, "active");
const methodSaved = await repository.save("paymentMethods", { context_id: savedBusiness.id, name: "QR negocio", method_type: "qr" });
assert.equal((await repository.archive("paymentMethods", methodSaved.id, true)).status, "archived");
assert.equal((await repository.archive("paymentMethods", methodSaved.id, false)).status, "active");
const goalSaved = await repository.save("goals", { context_id: savedBusiness.id, name: "Reserva local", target_amount: 500000 });
const goalEntrySaved = await repository.addGoalEntry({ context_id: savedBusiness.id, goal_id: goalSaved.id, entry_type: "contribution", amount: 50000, occurred_on: "2026-08-18" });
assert.equal((await repository.addGoalEntry({ ...goalEntrySaved, amount: 60000 })).amount, 60000);
assert.equal((await repository.archive("goals", goalSaved.id, true)).status, "archived");
assert.equal((await repository.archive("goals", goalSaved.id, false)).status, "active");
const assetSaved = await repository.save("assets", { context_id: savedBusiness.id, asset_class: "asset", asset_type: "equipment", name: "Equipo de prueba", opening_value: 900000, valued_on: "2026-08-01" });
const valuationSaved = await repository.save("valuations", { context_id: savedBusiness.id, asset_id: assetSaved.id, value: 850000, valued_on: "2026-08-18", source: "Tasación sintética" });
assert.equal((await repository.save("valuations", { ...valuationSaved, value: 840000 })).value, 840000);
assert.equal((await repository.archive("assets", assetSaved.id, true)).status, "archived");
assert.equal((await repository.archive("assets", assetSaved.id, false)).status, "active");
const filterSaved = await repository.save("savedFilters", { context_id: savedBusiness.id, name: "Gastos grandes", filters: { type: "expense" } });
assert.equal((await repository.archive("savedFilters", filterSaved.id, true)).status, "archived");
assert.equal((await repository.archive("savedFilters", filterSaved.id, false)).status, "active");
const recurrenceSaved = await repository.save("recurrences", {
    context_id: savedBusiness.id, template_type: "obligation", name: "Servicio recurrente", frequency: "monthly",
    starts_on: "2026-08-22", next_on: "2026-08-22", interval_count: 1,
    template: { name: "Servicio recurrente", principal_amount: 10000, obligation_type: "recurring", paid_amount: 0, status: "pending" }
});
assert.ok((await repository.generateRecurrences("2026-08", savedBusiness.id)).some(item => item.recurrence_id === recurrenceSaved.id));
assert.equal((await repository.archive("recurrences", recurrenceSaved.id, true)).status, "archived");
assert.equal((await repository.archive("recurrences", recurrenceSaved.id, false)).status, "active");
const balanceBeforeDraft = Core.accountBalance(savedAccount, await repository.list("transactions"));
const draft = await repository.postOperation({
    context_id: savedBusiness.id, operation_kind: "expense", status: "pending", amount: 7000,
    account_id: savedAccount.id, occurred_at: "2026-08-19T09:00", description: "Borrador descartable"
});
assert.equal(Core.accountBalance(savedAccount, await repository.list("transactions")), balanceBeforeDraft, "Un borrador no debe modificar el saldo");
assert.equal(await repository.deletePendingOperation(draft[0].operation_group_id), 1);
assert.ok(!(await repository.list("transactions")).some(item => item.id === draft[0].id));
const closeData = await repository.snapshot();
const calculatedBeforeClose = Core.accountBalance(savedAccount, closeData.transactions, "2026-08-31");
const close = await repository.closeMonth(savedBusiness.id, "2026-08", closeData, true, "Conciliación sintética", [{ account_id: savedAccount.id, reported_balance: calculatedBeforeClose - 5000 }]);
assert.equal(close.state, "closed");
assert.equal(close.snapshot.accounts.find(item => item.id === savedAccount.id).difference, -5000);
await assert.rejects(() => repository.postOperation({ context_id: savedBusiness.id, operation_kind: "expense", amount: 1000, account_id: savedAccount.id, occurred_at: "2026-08-20", description: "Bloqueado" }), /cerrado/);
const reopened = await repository.reopenMonth(close.id, "Corregir comprobante faltante");
assert.equal(reopened.state, "reopened");
assert.notEqual(reopened.id, close.id, "Reabrir debe crear una versión nueva");
assert.equal((await repository.list("monthlyCloses")).find(item => item.id === close.id).state, "closed", "El cierre anterior debe permanecer inmutable");
assert.equal(reopened.version_number, 2);
await repository.postOperation({ context_id: savedBusiness.id, operation_kind: "expense", amount: 1000, account_id: savedAccount.id, occurred_at: "2026-08-20", description: "Permitido tras reapertura" });
const secondClose = await repository.closeMonth(savedBusiness.id, "2026-08", await repository.snapshot(), true);
assert.equal(secondClose.version_number, 3);
assert.equal((await repository.list("monthlyCloses", { context_id: savedBusiness.id, month: "2026-08" })).length, 3);
await repository.archive("accounts", savedAccount.id, true);
snapshot = await repository.snapshot();
assert.equal(snapshot.accounts.find(item => item.id === savedAccount.id).status, "archived");
assert.equal((await repository.archive("accounts", savedAccount.id, false)).status, "active");
assert.equal((await repository.archive("accounts", savedAccount.id, true)).status, "archived");
assert.ok((await repositoryStorage.pending(options.workspaceId)).length >= 3, "Los cambios locales deben quedar en la cola durable");

const conflictStorage = new FinanceStorage({ indexedDB: null });
const conflictRepository = new FinanceRepository({
    workspaceId: options.workspaceId, userId: options.userId, workspaceRole: "owner",
    storage: conflictStorage, client: { async rpc() { return { data: null, error: { code: "40001", message: "finance_version_conflict" } }; } }
});
conflictRepository.remoteReady = true;
await conflictStorage.queue({
    operationId: "rpc-conflict", workspace_id: options.workspaceId, entity: "rpc", action: "rpc",
    rpcName: "finance_post_operation", rpcArgs: { operation_key: "conflict-key", operation: { records: [] } },
    localRecords: []
});
assert.equal(await conflictRepository.flush(), false);
assert.equal((await conflictStorage.list("conflicts", { workspace_id: options.workspaceId }))[0].entity, "rpc");

const reloadedRepository = new FinanceRepository({
    workspaceId: options.workspaceId,
    userId: options.userId,
    workspaceRole: "owner",
    client: null,
    storage: repositoryStorage
});
assert.equal((await reloadedRepository.snapshot()).accounts[0].name, "Caja", "La recarga debe recuperar registros locales");
const deniedRepository = new FinanceRepository({
    workspaceId: options.workspaceId,
    userId: "editor-test",
    workspaceRole: "editor",
    client: null,
    storage: new FinanceStorage({ indexedDB: null })
});
await assert.rejects(() => deniedRepository.initialize(), /privada para el propietario/);

const attachmentStorage = new FinanceStorage({ indexedDB: null });
let uploadCount = 0;
let removeCount = 0;
const attachmentClient = {
    storage: { from() { return {
        async upload() { uploadCount += 1; return { data: { path: "ok" }, error: null }; },
        async remove() { removeCount += 1; return { data: [], error: null }; }
    }; } },
    from() {
        return {
            record: null,
            upsert(record) { this.record = record; return this; },
            update(record) { this.record = record; return this; },
            eq() { return this; },
            order() { return this; },
            select() { return this; },
            async single() { return { data: this.record, error: null }; },
            async maybeSingle() { return { data: this.record, error: null }; },
            async limit() { return { data: [], error: null }; }
        };
    }
};
const attachmentRepository = new FinanceRepository({ workspaceId: options.workspaceId, userId: options.userId, workspaceRole: "owner", client: attachmentClient, storage: attachmentStorage });
const localAttachment = await attachmentRepository.attachFile({
    file: { name: "comprobante.pdf", type: "application/pdf", size: 128, bytes: [1, 2, 3] },
    context_id: personal.id, transaction_id: transferOut.id
});
assert.ok(await attachmentStorage.get("attachmentBlobs", localAttachment.id), "El archivo debe quedar local hasta la confirmación remota");
attachmentRepository.remoteReady = true;
assert.equal(await attachmentRepository.flush(), true);
assert.equal(uploadCount, 1);
assert.equal(await attachmentStorage.get("attachmentBlobs", localAttachment.id), null, "La copia temporal se limpia después de confirmar el servidor");
attachmentRepository.remoteReady = false;
await attachmentRepository.removeAttachment(localAttachment.id);
assert.equal((await attachmentRepository.list("attachments"))[0].sync_state, "removed");
attachmentRepository.remoteReady = true;
assert.equal(await attachmentRepository.flush(), true);
assert.equal(removeCount, 1, "Quitar un comprobante debe borrar también el objeto privado remoto");

const migrationStorage = new FinanceStorage({ indexedDB: null });
await migrationStorage.open();
let migrationCalls = 0;
const migrationRepository = {
    workspaceId: options.workspaceId,
    remoteReady: true,
    client: {
        async rpc(name, payload) {
            assert.equal(name, "finance_import_v09");
            assert.equal(payload.source_transactions.length, 1);
            migrationCalls += 1;
            return { data: { runId: "run-1", repeated: migrationCalls > 1, state: "completed", counts: preview.counts, totals: preview.totals, errors: 0, sourcePreserved: true }, error: null };
        },
        from() {
            return {
                select() { return this; },
                eq() { return this; },
                order() { return this; },
                async limit() { return { data: [], error: null }; }
            };
        }
    },
    storage: migrationStorage,
    syncStatus() {},
    emit() {},
    async pullMonth() { return true; }
};
window.Atlas = {
    readArray(key) {
        return structuredClone(key === "atlasTransactions" ? validLegacyTransactions : validLegacyObligations);
    }
};
const migration = new FinanceMigration(migrationRepository);
migration.readSource();
const firstMigration = await migration.import({ contextId: personal.id, accountId: cash.id });
const repeatedMigration = await migration.import({ contextId: personal.id, accountId: cash.id });
assert.equal(firstMigration.sourcePreserved, true);
assert.equal(repeatedMigration.repeated, true);
assert.deepEqual(validLegacyTransactions, [{ id: 1, type: "expense", amount: 25000, createdAt: "2026-08-01T12:00:00", description: "Compra" }]);
await migrationStorage.put("migrationErrors", {
    id: "error-csv",
    workspace_id: options.workspaceId,
    migration_run_id: "run-csv",
    source_type: "transaction",
    source_id: "=2+2",
    field_name: "amount",
    error_code: "invalid_amount",
    message: "Dato sintético"
});
assert.match(await migration.errorReport("run-csv"), /"'=2\+2"/);

const [html, css, sql, bootstrap, worker, dashboard, domain, financeJs, fixtureHtml, fixtureJs] = await Promise.all([
    read("finance.html"),
    read("finance.css"),
    read("supabase/v0.10-finance-base.sql"),
    read("app-bootstrap.js"),
    read("sw.js"),
    read("dashboard.js"),
    read("finance-domain.js"),
    read("finance.js"),
    read("tests/finance-v010-fixture.html"),
    read("tests/finance-v010-fixture.js")
]);
const htmlDom = new JSDOM(html);
const document = htmlDom.window.document;
assert.equal(document.querySelectorAll(".finance-bottom-nav button").length, 5);
assert.deepEqual(Array.from(document.querySelectorAll(".finance-bottom-nav button"), item => item.lastChild.textContent.trim()), ["Inicio", "Movimientos", "Nuevo", "Pagos", "Más"]);
assert.equal(htmlDom.window.document.querySelectorAll("[data-finance-view]").length, 6);
const ids = Array.from(document.querySelectorAll("[id]"), item => item.id);
assert.equal(new Set(ids).size, ids.length, "Finanzas no debe repetir identificadores HTML");
for (const id of [...financeJs.matchAll(/\$\("#([A-Za-z][\w-]*)"\)/g)].map(match => match[1])) {
    assert.ok(document.getElementById(id), `finance.js referencia un control inexistente: #${id}`);
}
const viewNames = new Set(Array.from(document.querySelectorAll("[data-finance-view]"), item => item.dataset.financeView));
for (const trigger of document.querySelectorAll("[data-open-view]")) assert.ok(viewNames.has(trigger.dataset.openView), `Vista inexistente: ${trigger.dataset.openView}`);
assert.ok(htmlDom.window.document.querySelector("#downloadMigrationErrors"));
assert.ok(htmlDom.window.document.querySelector("#obligationForm"));
assert.ok(htmlDom.window.document.querySelector("#operationForm"));
assert.ok(htmlDom.window.document.querySelector("#closeForm"));
assert.match(html, /finance-core\.js/);
assert.match(html, /finance-domain\.js/);
assert.match(html, /finance-storage\.js/);
assert.match(html, /finance-repository\.js/);
assert.match(html, /finance-migration\.js/);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /@media \(max-width: 720px\)/);
assert.match(bootstrap, /workspaceRole/);
assert.match(bootstrap, /purgeUnauthorizedFinanceData/);
assert.match(bootstrap, /FINANCE_DATA_KEYS/);
assert.match(worker, /finance\.html/);
assert.match(dashboard, /atlas-so-finance-base/);
assert.match(dashboard, /exportFinanceBase/);
assert.match(dashboard, /restoreFinanceBase/);
assert.match(dashboard, /RESTORABLE_FINANCE_ENTITIES/);
assert.match(dashboard, /migration_run_id: null/);
assert.match(dashboard, /repite identificadores/);
assert.match(dashboard, /movimiento financiero no válido/);
assert.match(domain, /budgetSummary/);
assert.match(domain, /netWorth/);
assert.match(domain, /obligationTotal/);

for (const table of [
    "finance_contexts", "finance_accounts", "finance_categories", "finance_transactions",
    "finance_obligations", "finance_payments", "finance_attachments", "finance_payment_methods",
    "finance_recurrences", "finance_budgets", "finance_goals", "finance_goal_entries",
    "finance_assets", "finance_asset_valuations", "finance_monthly_closes", "finance_saved_filters",
    "finance_migration_runs", "finance_migration_errors", "finance_audit_log"
]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
assert.match(sql, /finance_is_workspace_owner/);
assert.match(sql, /create or replace function public\.is_hr_data_key\(target_key text\)/);
assert.ok(
    sql.indexOf("create or replace function public.is_hr_data_key")
        < sql.indexOf("create or replace function public.can_access_app_data"),
    "La migración debe crear is_hr_data_key antes de redefinir can_access_app_data."
);
assert.match(sql, /is_finance_data_key/);
assert.match(sql, /create or replace function public\.can_access_app_data/);
assert.match(sql, /finance_owner_all/);
assert.match(sql, /finance_validate_category_parent/);
assert.match(sql, /atlas-finance-files/);
assert.match(sql, /public\.finance_import_v09/);
assert.match(sql, /public\.finance_post_operation/);
assert.match(sql, /public\.finance_delete_pending_operation/);
assert.match(sql, /public\.finance_pay_obligation/);
assert.match(sql, /public\.finance_update_payment/);
assert.match(sql, /public\.finance_close_month/);
assert.match(sql, /public\.finance_reopen_month/);
assert.match(sql, /finance_assert_record_month_open/);
assert.match(sql, /finance_close_snapshot_immutable/);
assert.match(sql, /finance_transactions_void_v010/);
assert.match(sql, /finance_obligations_void_v010/);
assert.match(sql, /finance_payments_void_v010/);
assert.match(sql, /interest_amount/);
assert.match(sql, /surcharge_amount/);
assert.match(sql, /session_id/);
assert.match(sql, /finance_validate_obligation_account/);
assert.match(sql, /requested_id uuid default null/);
assert.match(sql, /finance_v09_positive_amount/);
assert.match(sql, /sourcePreserved/);
assert.match(sql, /unique \(workspace_id, idempotency_key\)/);
assert.doesNotMatch(sql, /<>\s+case\s+when/i);
assert.doesNotMatch(sql, /can_edit_workspace\(workspace_id\)/);
assert.doesNotMatch(sql, /grant select, insert, update, delete on public\.finance_/);
assert.match(sql, /begin;/);
assert.match(sql, /commit;/);
assert.doesNotMatch(fixtureHtml, /Etapa 1/i);
assert.match(fixtureJs, /finance-domain\.js/);

console.log("ATLAS SO v0.10: cinco etapas, aislamiento, operaciones, planificación, cierre, migración, offline y volumen verificados.", {
    contexts: contexts.length,
    accounts: accounts.length,
    categories: volumeCategories.length,
    movements: volumeTransactions.length,
    obligations: volumeObligations.length,
    closes: volumeCloses.length,
    filterMs: Number(filterMs.toFixed(3)),
    summaryMs: Number(summaryMs.toFixed(3)),
    legacyErrors: invalidPreview.errors.length,
    duplicateReimports: 0
});

dom.window.close();
