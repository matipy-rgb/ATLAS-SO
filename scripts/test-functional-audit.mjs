import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(ROOT, file), "utf8");
let nextId = 1000;

function localDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseDate(value) {
    const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function page(htmlFile, scriptFile, seed = {}) {
    const virtualConsole = new VirtualConsole();
    const errors = [];
    virtualConsole.on("jsdomError", error => errors.push(error));
    const dom = new JSDOM(await read(htmlFile), {
        url: `https://atlas.test/${htmlFile}`,
        runScripts: "outside-only",
        pretendToBeVisual: true,
        virtualConsole
    });
    const { window } = dom;
    const data = new Map(Object.entries(seed));
    const notices = [];
    const alerts = [];

    window.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
    };
    window.HTMLDialogElement.prototype.close = function () {
        this.open = false;
    };
    window.Element.prototype.scrollIntoView = function () {};
    window.confirm = () => true;
    window.alert = message => alerts.push(String(message));
    window.URL.createObjectURL = () => "blob:atlas-test";
    window.URL.revokeObjectURL = () => {};
    window.AtlasAuth = { client: null };
    window.AtlasStore = {
        workspaceId: "workspace-test",
        userId: "user-test",
        read: (key, fallback) => data.has(key) ? data.get(key) : fallback,
        write: (key, value) => data.set(key, structuredClone(value)),
        has: key => data.has(key)
    };
    window.Atlas = {
        readJSON: (key, fallback) => data.has(key) ? structuredClone(data.get(key)) : fallback,
        readArray: key => Array.isArray(data.get(key)) ? structuredClone(data.get(key)) : [],
        writeJSON(key, value) {
            data.set(key, structuredClone(value));
            window.dispatchEvent(new window.CustomEvent("atlas:data-changed", { detail: { key } }));
        },
        localDate,
        parseDate,
        daysUntil(value) {
            const date = parseDate(value);
            const today = parseDate(localDate());
            return date ? Math.round((date - today) / 86400000) : Number.POSITIVE_INFINITY;
        },
        formatDate(value) {
            const date = parseDate(value);
            return date ? new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "Sin fecha";
        },
        formatMoney(value) {
            return new Intl.NumberFormat("es-PY", { style: "currency", currency: "PYG", maximumFractionDigits: 0 }).format(Number(value || 0));
        },
        escapeHTML,
        createId: () => ++nextId,
        notify: (message, type = "success") => notices.push({ message: String(message), type }),
        updateNavCounts() {},
        storageKeyMatches: (eventKey, dataKey) => eventKey === dataKey || String(eventKey || "").endsWith(`:${dataKey}`)
    };

    window.eval(await read(scriptFile));
    return { dom, window, document: window.document, data, notices, alerts, errors };
}

async function settle() {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
}

async function wait(milliseconds) {
    await new Promise(resolve => setTimeout(resolve, milliseconds));
}

function submit(window, selector) {
    const form = window.document.querySelector(selector);
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

function click(window, selector) {
    const target = window.document.querySelector(selector);
    assert.ok(target, `No se encontró ${selector}`);
    target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

async function testDashboardAndGlobalTools() {
    const virtualConsole = new VirtualConsole();
    const errors = [];
    virtualConsole.on("jsdomError", error => errors.push(error));
    const dom = new JSDOM(await read("app.html"), {
        url: "https://atlas.test/app.html",
        runScripts: "outside-only",
        pretendToBeVisual: true,
        virtualConsole
    });
    const { window } = dom;
    const { document } = window;
    const data = new Map([["atlasPreferences", { onboardingDone: true }]]);
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    window.Element.prototype.scrollIntoView = function () {};
    window.confirm = () => true;
    window.alert = () => {};
    window.ATLAS_IS_HR_ADMIN = false;
    window.AtlasAuth = {
        user: { email: "prueba@example.com", user_metadata: { full_name: "Persona Prueba" } },
        client: null,
        signOut() {}
    };
    window.AtlasStore = {
        workspaceId: "workspace-test",
        userId: "user-test",
        read: (key, fallback) => data.has(key) ? structuredClone(data.get(key)) : fallback,
        write: (key, value) => data.set(key, structuredClone(value)),
        has: key => data.has(key)
    };
    Object.defineProperty(window.navigator, "serviceWorker", {
        configurable: true,
        value: { register: async () => ({}) }
    });

    window.eval(await read("atlas.js"));
    window.eval(await read("dashboard.js"));

    click(window, '[data-atlas-capture="task"]');
    document.querySelector("#captureTaskText").value = "Tarea desde captura";
    document.querySelector("#captureTaskDate").value = localDate();
    submit(window, "#atlasCaptureForm");
    assert.equal(data.get("atlasTasks").length, 1);
    assert.match(document.querySelector("#taskList").textContent, /Tarea desde captura/);

    click(window, '[data-atlas-capture="expense"]');
    document.querySelector("#captureMoneyDescription").value = "Movimiento rápido";
    document.querySelector("#captureMoneyAmount").value = "15000";
    submit(window, "#atlasCaptureForm");
    assert.equal(data.get("atlasTransactions").length, 1);

    click(window, '[data-atlas-capture="study"]');
    document.querySelector("#captureStudySubject").value = "Materia";
    document.querySelector("#captureStudyTitle").value = "Actividad rápida";
    document.querySelector("#captureStudyDate").value = localDate();
    submit(window, "#atlasCaptureForm");
    assert.equal(data.get("atlasStudyEvents").length, 1);

    click(window, '[data-atlas-capture="health"]');
    document.querySelector("#captureHealthWater").value = "2";
    submit(window, "#atlasCaptureForm");
    assert.equal(data.get("atlasHealthRecords").length, 1);

    click(window, '[data-atlas-capture="note"]');
    document.querySelector("#captureNoteText").value = "Idea de prueba";
    submit(window, "#atlasCaptureForm");
    assert.match(data.get("atlasQuickNotes"), /Idea de prueba/);

    document.querySelector('#taskList [data-action="toggle"]').checked = true;
    document.querySelector('#taskList [data-action="toggle"]').dispatchEvent(new window.Event("change", { bubbles: true }));
    assert.equal(data.get("atlasTasks")[0].completed, true);
    click(window, '#taskFilters [data-filter="completed"]');
    click(window, '#taskList [data-action="delete"]');
    assert.equal(data.get("atlasTasks").length, 0);

    document.querySelector("#focusText").value = "Prioridad comprobada";
    submit(window, "#focusForm");
    assert.equal(data.get("atlasDailyFocus").text, "Prioridad comprobada");
    click(window, '#dailyFocusCard [data-focus-action="toggle"]');
    assert.equal(data.get("atlasDailyFocus").completed, true);

    document.querySelector("#quickNotes").value = "Nota manual";
    document.querySelector("#quickNotes").dispatchEvent(new window.Event("input", { bubbles: true }));
    await wait(400);
    assert.equal(data.get("atlasQuickNotes"), "Nota manual");

    click(window, "#openAtlasSearch");
    document.querySelector("#atlasSearchInput").value = "Actividad rápida";
    document.querySelector("#atlasSearchInput").dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.match(document.querySelector("#atlasSearchResults").textContent, /Actividad rápida/);

    data.set("atlasProjects", [{ id: "old-project", name: "Dato que debe reemplazarse" }]);
    const backup = {
        version: "7.1",
        schema: "atlas-so-backup",
        exportedAt: new Date().toISOString(),
        workspace: {
            entries: {
                atlasTasks: [{ id: "restored-task", text: "Tarea restaurada", completed: false }]
            },
            attendance: [],
            receipts: []
        }
    };
    Object.defineProperty(document.querySelector("#backupFile"), "files", {
        configurable: true,
        value: [{
            size: JSON.stringify(backup).length,
            text: async () => JSON.stringify(backup)
        }]
    });
    document.querySelector("#backupFile").dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();
    assert.equal(data.get("atlasTasks")[0].id, "restored-task");
    assert.equal(data.get("atlasProjects"), null, "Restaurar debe reemplazar datos ausentes de la copia");
    assert.match(document.querySelector("#backupStatus").textContent, /restaurada/i);
    assert.equal(errors.length, 0, errors.map(error => error.message).join("\n"));
    dom.window.close();
}

async function testHealth() {
    const today = localDate();
    const yesterday = localDate(new Date(Date.now() - 86400000));
    const before = localDate(new Date(Date.now() - 2 * 86400000));
    const test = await page("health.html", "health.js", {
        atlasHealthRecords: [
            { date: today, sleep: 8 },
            { date: yesterday, weight: 90 },
            { date: before, weight: 89 }
        ]
    });
    const { window, document, data } = test;
    assert.match(document.querySelector("#latestWeight").textContent, /90/);
    assert.match(document.querySelector("#weightChange").textContent, /\+1\.0/);

    document.querySelector("#healthDate").value = localDate(new Date(Date.now() + 86400000));
    document.querySelector("#healthDate").dispatchEvent(new window.Event("change", { bubbles: true }));
    submit(window, "#healthForm");
    assert.equal(data.get("atlasHealthRecords").length, 3, "Salud no debe aceptar un día vacío");

    document.querySelector("#healthSleep").value = "7.5";
    submit(window, "#healthForm");
    assert.equal(data.get("atlasHealthRecords").length, 4);
    click(window, `[data-edit="${document.querySelector("#healthDate").value}"]`);
    document.querySelector("#healthSleep").value = "6";
    submit(window, "#healthForm");
    assert.equal(data.get("atlasHealthRecords").length, 4, "Editar salud no debe duplicar la fecha");
    assert.equal(data.get("atlasHealthRecords").find(item => item.date === document.querySelector("#healthDate").value)?.sleep, 6);
    click(window, `[data-delete="${document.querySelector("#healthDate").value}"]`);
    assert.equal(data.get("atlasHealthRecords").length, 3);

    data.set("atlasHealthRecords", [...data.get("atlasHealthRecords"), { date: "2026-01-01", water: 2 }]);
    window.dispatchEvent(new window.CustomEvent("atlas:data-changed", { detail: { key: "atlasHealthRecords" } }));
    assert.match(document.querySelector("#healthListCaption").textContent, /4/);
    test.dom.window.close();
}

async function testWork() {
    const test = await page("work.html", "work.js");
    const { window, document, data } = test;
    assert.equal(document.querySelector("#workRate").value, "0");
    document.querySelector("#workDescription").value = "Jornada de prueba";
    document.querySelector("#workHoursInput").value = "4";
    submit(window, "#workForm");
    assert.equal(data.get("atlasWorkRecords").length, 1);
    assert.equal(data.get("atlasWorkRecords")[0].net, 0, "Trabajo debe permitir controlar horas sin conocer la tarifa");
    click(window, "[data-edit]");
    document.querySelector("#workHoursInput").value = "5";
    document.querySelector("#workRate").value = "20000";
    submit(window, "#workForm");
    assert.equal(data.get("atlasWorkRecords").length, 1);
    assert.equal(data.get("atlasWorkRecords")[0].hours, 5);
    click(window, "[data-delete]");
    assert.equal(data.get("atlasWorkRecords").length, 0);
    test.dom.window.close();
}

async function testProjects() {
    const test = await page("projects.html", "projects.js");
    const { window, document, data } = test;
    document.querySelector("#projectName").value = "Proyecto de prueba";
    document.querySelector("#projectNextAction").value = "Hacer la primera tarea";
    submit(window, "#projectForm");
    assert.equal(data.get("atlasProjects"), undefined, "Proyecto debe exigir fecha objetivo");

    document.querySelector("#projectDeadline").value = localDate(new Date(Date.now() + 86400000));
    document.querySelector("#projectProgress").value = "90";
    submit(window, "#projectForm");
    assert.equal(data.get("atlasProjects").length, 1);
    click(window, '[data-action="advance"]');
    assert.equal(data.get("atlasProjects")[0].status, "completed");
    assert.ok(data.get("atlasProjects")[0].completedAt);
    document.querySelector("#projectStatusFilter").value = "completed";
    document.querySelector("#projectStatusFilter").dispatchEvent(new window.Event("change", { bubbles: true }));
    click(window, '[data-action="reopen"]');
    assert.equal(data.get("atlasProjects")[0].status, "active");
    document.querySelector("#projectStatusFilter").value = "active";
    document.querySelector("#projectStatusFilter").dispatchEvent(new window.Event("change", { bubbles: true }));
    click(window, '[data-action="edit"]');
    document.querySelector("#projectNextAction").value = "Validar edición";
    submit(window, "#projectForm");
    assert.equal(data.get("atlasProjects")[0].nextAction, "Validar edición");
    click(window, '[data-action="delete"]');
    assert.equal(data.get("atlasProjects").length, 0);
    test.dom.window.close();
}

async function testHabits() {
    const test = await page("personal.html", "personal.js");
    const { window, document, data } = test;
    document.querySelector("#habitName").value = "Caminar";
    submit(window, "#habitForm");
    assert.equal(data.get("atlasHabits").length, 1);
    click(window, '[data-action="edit"]');
    document.querySelector("#habitName").value = "Caminar 20 minutos";
    submit(window, "#habitForm");
    assert.equal(data.get("atlasHabits").length, 1);
    assert.equal(data.get("atlasHabits")[0].name, "Caminar 20 minutos");
    click(window, '[data-action="toggle"]');
    assert.ok(data.get("atlasHabits")[0].history.includes(localDate()));
    const prior = document.querySelector('[data-history-date]:not([data-history-date="' + localDate() + '"])');
    prior.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    assert.ok(data.get("atlasHabits")[0].history.includes(prior.dataset.historyDate));
    click(window, '[data-action="delete"]');
    assert.equal(data.get("atlasHabits").length, 0);
    test.dom.window.close();
}

async function testStudy() {
    const test = await page("study.html", "study.js");
    const { window, document, data } = test;
    submit(window, "#studyEventForm");
    assert.equal(data.get("atlasStudyEvents"), undefined);
    document.querySelector("#studyInstitution").value = "Instituto";
    document.querySelector("#studySubject").value = "Matemática";
    document.querySelector("#studyTitle").value = "Examen";
    document.querySelector("#studyDate").value = localDate(new Date(Date.now() + 86400000));
    submit(window, "#studyEventForm");
    assert.equal(data.get("atlasStudyEvents").length, 1);
    click(window, '[data-action="complete"]');
    submit(window, "#completeStudyForm");
    assert.equal(data.get("atlasStudyEvents")[0].completed, true);
    document.querySelector("#studyStatusFilter").value = "completed";
    document.querySelector("#studyStatusFilter").dispatchEvent(new window.Event("change", { bubbles: true }));
    click(window, '[data-action="reopen"]');
    assert.equal(data.get("atlasStudyEvents")[0].progress, 0, "Reabrir debe restaurar incluso un avance anterior de 0%");
    document.querySelector("#studyStatusFilter").value = "pending";
    document.querySelector("#studyStatusFilter").dispatchEvent(new window.Event("change", { bubbles: true }));
    click(window, '[data-action="advance"]');
    assert.equal(data.get("atlasStudyEvents")[0].progress, 25);
    click(window, '[data-action="edit"]');
    document.querySelector("#studyTitle").value = "Examen editado";
    submit(window, "#studyEventForm");
    assert.equal(data.get("atlasStudyEvents")[0].title, "Examen editado");
    click(window, '[data-action="delete"]');
    assert.equal(data.get("atlasStudyEvents").length, 0);
    test.dom.window.close();
}

async function testFinance() {
    const test = await page("finance.html", "finance.js");
    const { window, document, data } = test;
    document.querySelector("#obligationName").value = "Servicio";
    document.querySelector("#obligationAmount").value = "100000";
    document.querySelector("#obligationDueDate").value = localDate();
    submit(window, "#obligationForm");
    assert.equal(data.get("atlasObligations").length, 1);

    document.querySelector("#transactionDate").value = "2026-01-15";
    document.querySelector("#transactionDescription").value = "Compra";
    document.querySelector("#transactionAmount").value = "25000";
    submit(window, "#transactionForm");
    assert.equal(data.get("atlasTransactions")[0].createdAt, "2026-01-15T12:00:00");

    click(window, '[data-action="pay"]');
    document.querySelector("#paymentAmount").value = "40000";
    document.querySelector("#paymentDate").value = localDate();
    submit(window, "#paymentForm");
    await settle();
    assert.equal(data.get("atlasObligations")[0].paidAmount, 40000);
    assert.equal(data.get("atlasTransactions").length, 2);
    click(window, '[data-action="undo-payment"]');
    await settle();
    assert.equal(data.get("atlasObligations")[0].paidAmount, 0);
    assert.equal(data.get("atlasTransactions").length, 1);

    const extra = { id: 9999, description: "Captura rápida", amount: 1, type: "expense", createdAt: new Date().toISOString() };
    data.set("atlasTransactions", [...data.get("atlasTransactions"), extra]);
    window.dispatchEvent(new window.CustomEvent("atlas:data-changed", { detail: { key: "atlasTransactions" } }));
    assert.equal(document.querySelectorAll("#transactionsList .transaction-item").length, 2);
    click(window, '[data-action="delete-transaction"]');
    assert.equal(data.get("atlasTransactions").length, 1);
    click(window, '[data-action="delete-obligation"]');
    assert.equal(data.get("atlasObligations").length, 0);
    test.dom.window.close();
}

async function testRRHHCore() {
    const test = await page("rrhh.html", "rrhh-context.js");
    const { window, document, data, notices } = test;
    window.CSS = { escape: value => String(value).replaceAll('"', '\\"') };
    window.HTMLAnchorElement.prototype.click = function () {};
    window.eval(await read("rrhh-calc.js"));

Object.assign(window.AtlasHRContext.company, {
    name: "Empresa de prueba",
    legalName: "Empresa de prueba E.A.S.",
    ruc: "80000000-0",
    representative: "Representante de prueba",
    representativeCI: "1.000.000",
    address: "Dirección de prueba",
    documentCity: "Ciudad de prueba"
});

window.AtlasHRContext.company.clients.push({
    id: "cliente-prueba",
    name: "Cliente de prueba",
    workplace: "Lugar de trabajo de prueba",
    contractTemplateId: "general",
    active: true
});

window.eval(await read("rrhh.js"));

    click(window, "#openEmployeeDialog");
    assert.equal(document.querySelector("#employeeSalary").value, "0", "RRHH no debe inventar un salario");
    document.querySelector("#employeeWorkerType").value = "daily";
    document.querySelector("#employeeWorkerType").dispatchEvent(new window.Event("change", { bubbles: true }));
    assert.match(document.querySelector("#employeeSalaryHelp").textContent, /jornal nominal por día/i);
    document.querySelector("#employeeWorkerType").value = "monthly";
    document.querySelector("#employeeCI").value = "4.000.001";
    document.querySelector("#employeeName").value = "Persona de Prueba";
    document.querySelector("#employeeClient").value = "cliente-prueba";
    document.querySelector("#employeePosition").value = "Operador";
    document.querySelector("#employeeStartDate").value = localDate();
    document.querySelector("#employeeSalary").value = "5000000";
    submit(window, "#employeeForm");
    const companyId = window.AtlasHRContext?.company?.id;
assert.ok(companyId, "Debe existir una empresa activa");
const peopleKey = `atlasHRPeople__${companyId}`;
const absencesKey = `atlasHRAbsences__${companyId}`;
const complianceKey = `atlasHRCompliance__${companyId}`;
    assert.equal(data.get(peopleKey).length, 1);
    assert.equal(data.get(complianceKey).length, 1);

    click(window, "#openAbsenceDialog");
    document.querySelector("#absenceEmployee").value = data.get(peopleKey)[0].id;
    document.querySelector("#absenceType").value = "permission";
    document.querySelector("#absenceStart").value = localDate();
    document.querySelector("#absenceEnd").value = localDate(new Date(Date.now() + 86400000));
    document.querySelector("#absenceReturn").value = localDate(new Date(Date.now() + 2 * 86400000));
    submit(window, "#absenceForm");
    assert.equal(data.get(absencesKey).length, 1);
    document.querySelector("#hrStatusFilter").value = "all";
    document.querySelector("#hrStatusFilter").dispatchEvent(new window.Event("input", { bubbles: true }));
    click(window, '[data-absence-cancel]');
    assert.equal(data.get(absencesKey)[0].cancelled, true);
    click(window, '[data-absence-cancel]');
    assert.equal(data.get(absencesKey)[0].cancelled, false);

    window.eval(await read("rrhh-storage.js"));
    window.eval(await read("rrhh-super.js"));
    await settle();

    document.querySelector("#hrScheduleName").value = "Turno operativo";
    document.querySelector("#hrScheduleStart").value = "07:30";
    document.querySelector("#hrScheduleEnd").value = "17:30";
    document.querySelector("#hrScheduleBreak").value = "60";
    document.querySelector("#hrScheduleTolerance").value = "10";
    document.querySelector("#hrScheduleFrom").value = localDate();
    document.querySelector("#hrScheduleAdvancedToggle").checked = true;
    document.querySelector("#hrScheduleAdvancedToggle").dispatchEvent(new window.Event("change", { bubbles: true }));
    const saturdayRule = document.querySelector('[data-rule-day="6"]');
    saturdayRule.querySelector("[data-rule-start]").value = "08:00";
    saturdayRule.querySelector("[data-rule-end]").value = "12:00";
    saturdayRule.querySelector("[data-rule-break]").value = "0";
    submit(window, "#hrScheduleForm");

    const schedulesKey = `atlasHRSchedules__${companyId}`;
    const assignmentsKey = `atlasHRScheduleAssignments__${companyId}`;
    assert.equal(data.get(schedulesKey).length, 1);
    assert.equal(data.get(schedulesKey)[0].revisions[0].rules.length, 6);
    assert.equal(data.get(schedulesKey)[0].revisions[0].rules.find(rule => rule.day === 6).end, "12:00");
    assert.match(document.querySelector("#hrScheduleList").textContent, /08:00–12:00/);

    const person = data.get(peopleKey)[0];
    document.querySelector("#hrAssignmentEmployee").value = person.id;
    document.querySelector("#hrAssignmentSchedule").value = data.get(schedulesKey)[0].id;
    document.querySelector("#hrAssignmentFrom").value = localDate();
    submit(window, "#hrAssignmentForm");
    assert.equal(data.get(assignmentsKey).length, 1);

    document.querySelector("#hrAttendanceEmployee").value = person.id;
    document.querySelector("#hrAttendanceDate").value = localDate();
    document.querySelector("#hrAttendanceIn").value = "07:30";
    document.querySelector("#hrAttendanceOut").value = "18:30";
    document.querySelector("#hrAttendanceStatus").value = "worked";
    submit(window, "#hrAttendanceForm");
    await settle();
    const period = localDate().slice(0, 7);
    const attendanceKey = `atlasHRAttendanceFallback__${companyId}__${period}`;
    assert.equal(data.get(attendanceKey).length, 1);
    assert.match(document.querySelector("#hrAttendanceSummary").textContent, /1 registro/);

    click(window, "#hrRunCalculation");
    await settle();
    assert.match(document.querySelector("#hrCalculationSummary").textContent, /1 funcionario/);
    assert.match(document.querySelector("#hrCalculationList").textContent, /Persona de Prueba/);
    assert.equal(document.querySelector("#hrExportCalculation").disabled, false);

    window.eval(await read("rrhh-contracts.js"));
    document.querySelector("#hrContractEmployee").value = person.id;
    document.querySelector("#hrContractType").value = "contract";
    document.querySelector("#hrContractDate").value = localDate();
    document.querySelector("#hrContractEnd").value = localDate(new Date(Date.now() + 30 * 86400000));
    click(window, "#hrPreviewContract");
    assert.match(document.querySelector("#hrContractPreview").textContent, /Persona de Prueba/);
    assert.match(document.querySelector("#hrContractPreview").textContent, /Turno operativo/);
    document.querySelector("#hrContractPreview").insertAdjacentHTML("beforeend", '<script>window.__unsafe = true</script><img src="x" onerror="window.__unsafe = true">');
    submit(window, "#hrContractForm");
    const historyKey = `atlasHRContractHistory__${companyId}`;
    assert.equal(data.get(historyKey).length, 1);
    assert.ok(!/<script|onerror=/i.test(data.get(historyKey)[0].snapshot), "El historial contractual debe sanear HTML editable");

    click(window, "[data-person-edit]");
    document.querySelector("#employeeStatus").value = "inactive";
    document.querySelector("#employeeEndDate").value = "";
    submit(window, "#employeeForm");
    assert.equal(data.get(peopleKey)[0].status, "active");
    assert.match(notices.at(-1).message, /fecha de salida/i);
    document.querySelector("#employeeEndDate").value = localDate();
    submit(window, "#employeeForm");
    assert.equal(data.get(peopleKey)[0].status, "inactive-month");
    assert.equal(data.get(complianceKey).length, 2);
    assert.equal(test.errors.length, 0, test.errors.map(error => error.message).join("\n"));
    test.dom.window.close();
}

async function testStaticSafety() {
    const [index, study, work, rrhh, bootstrap, schema, privacy, packageSource] = await Promise.all([
        read("index.html"),
        read("study.html"),
        read("work.js"),
        read("rrhh.html"),
        read("app-bootstrap.js"),
        read("supabase/atlas-schema.sql"),
        read("privacy.html"),
        read("package.json")
    ]);
    const publicCopy = `${index}\n${study}\n${work}`;
    ["Matías", "UTCD", "ITSSMAR", "14635", "Pago de moto", "ASUPOR"].forEach(token => {
        assert.ok(!publicCopy.includes(token), `Quedó un valor personal predefinido: ${token}`);
    });
    assert.ok(!rrhh.includes('data-hr-tab="payroll"'), "La simulación aislada de liquidación todavía aparece");
    assert.ok(!bootstrap.includes("<p>${String(error.message"), "El error de arranque no debe inyectar HTML");
    assert.match(schema, /can_manage_workspace/);
    assert.match(privacy, /marcaciones de Recursos Humanos/i);
    assert.equal(JSON.parse(packageSource).version, "0.7.1");
}

await testHealth();
await testWork();
await testProjects();
await testHabits();
await testStudy();
await testFinance();
await testRRHHCore();
await testDashboardAndGlobalTools();
await testStaticSafety();

console.log("ATLAS SO v0.7.1: CRUD, tablero y recorrido RRHH completo verificados.");
