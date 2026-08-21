import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const root = path.resolve(import.meta.dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const dom = file => new JSDOM(read(file)).window.document;

function assertUniqueIds(document, name) {
    const ids = [...document.querySelectorAll("[id]")].map(element => element.id);
    assert.equal(new Set(ids).size, ids.length, name + " contiene identificadores repetidos.");
}

const finance = dom("finance.html");
const rrhh = dom("rrhh.html");
const dashboard = dom("app.html");
const financeJs = read("finance.js");
const financeRepository = read("finance-repository.js");
const rrhhJs = read("rrhh.js");
const operationJs = read("rrhh-operation.js");
const ipsJs = read("rrhh-ips.js");
const experienceCss = read("experience-v011.css");

[["Finanzas", finance], ["RR. HH.", rrhh], ["Inicio", dashboard]].forEach(([name, document]) => assertUniqueIds(document, name));

assert.ok(finance.querySelector("#summaryAvailable"), "Finanzas debe mostrar el disponible al abrir.");
assert.ok(finance.querySelector("#summaryDebtTotal"), "Finanzas debe responder cuánto se debe.");
assert.ok(finance.querySelector("#summaryDue"), "Finanzas debe mostrar los pagos del mes.");
assert.ok(finance.querySelector("#nextPaymentName"), "Finanzas debe mostrar el próximo pago.");
assert.equal(finance.querySelectorAll(".finance-fast-actions button").length, 4, "Finanzas debe tener cuatro acciones frecuentes.");
assert.ok(finance.querySelector('[data-quick-action="purchase"]'), "Finanzas debe ofrecer una compra directa.");
assert.ok(finance.querySelector("#purchaseDialog"), "Las compras deben distinguir contado de financiación.");
assert.ok(finance.querySelector("#summaryGoals"), "El ahorro debe ser visible en el panel principal.");
assert.ok(finance.querySelector("#financePreviousMonth") && finance.querySelector("#financeNextMonth"), "El periodo debe cambiarse hacia atrás y hacia adelante.");
assert.deepEqual(
    [...finance.querySelectorAll(".finance-bottom-nav [data-finance-nav]")].map(button => button.dataset.financeNav),
    ["home", "movements", "commitments", "more"],
    "La navegación móvil financiera debe priorizar inicio, movimientos, pagos y más."
);
assert.equal(finance.querySelectorAll("#operationForm .operation-basic-fields > label").length, 7, "El movimiento debe conservar solo los campos básicos y los dos campos condicionales.");
assert.ok(finance.querySelector("#operationAdvanced"), "Los datos opcionales deben quedar en un desplegable avanzado.");
assert.match(financeJs, /preferredKind = "expense"/, "Las acciones rápidas deben abrir el tipo de movimiento correcto.");
assert.match(financeJs, /summaryDebtTotal/, "El resumen debe calcular la deuda total.");
assert.match(financeJs, /filter === "month"/, "Los compromisos deben filtrar pagos del mes.");
assert.match(financeJs, /Core\.splitMoney/, "Las compras financiadas deben repartir el total sin multiplicarlo.");
assert.match(financeJs, /investment-performance/, "Las inversiones deben mostrar rendimiento real.");
assert.match(financeJs, /status === "active" \? item.status !== "void"/, "Los registros eliminados deben quedar fuera de la vista normal.");
assert.match(financeJs, /Sin categorías impuestas/, "Las categorías deben empezar con una lista creada por el usuario.");
assert.match(financeJs, /Sin medios predeterminados/, "Los medios de pago deben empezar con una lista creada por el usuario.");
assert.match(financeJs, /finance-help/, "Los conceptos financieros deben incluir ayudas breves.");
assert.match(financeJs, /Restaurar/, "Las categorías y medios eliminados deben poder recuperarse.");
assert.doesNotMatch(financeRepository, /missingDefaults/, "Finanzas no debe volver a crear categorías sugeridas.");
assert.doesNotMatch(financeRepository, /PAYMENT_METHOD_TYPES\.slice\(0, 7\)/, "Finanzas no debe volver a crear medios sugeridos.");
assert.ok(finance.querySelector(".finance-concept-card"), "La pantalla de cuentas debe explicar para qué sirven.");
assert.equal(finance.querySelectorAll("[data-clear-finance]").length, 2, "Categorías y medios deben poder vaciarse de una vez.");

assert.equal(rrhh.querySelectorAll(".hr-module-nav > [data-hr-tab]").length, 5, "RR. HH. no debe volver a mostrar diez pestañas iguales.");
assert.deepEqual(
    [...rrhh.querySelectorAll(".hr-module-nav > [data-hr-tab]")].map(button => button.dataset.hrTab),
    ["overview", "people", "schedules", "news", "advanced"],
    "RR. HH. debe separar el uso diario de la administración avanzada."
);
assert.equal(rrhh.querySelectorAll(".hr-advanced-grid [data-hr-target]").length, 6, "Más debe conservar las seis herramientas avanzadas.");
assert.ok(rrhh.querySelector("#employeeAdvanced"), "El legajo completo debe ser progresivo.");
assert.match(rrhhJs, /hr-people-card-grid/, "La nómina debe renderizar fichas y no una tabla tipo Excel.");
assert.match(operationJs, /data-toggle-branch/, "Las sucursales deben poder archivarse y reactivarse.");
assert.match(operationJs, /data-toggle-area/, "Las áreas deben poder archivarse y reactivarse.");
assert.match(operationJs, /data-toggle-position/, "Los cargos deben poder archivarse y reactivarse.");

assert.ok(dashboard.querySelector(".dashboard-tools"), "Las herramientas secundarias de Inicio deben estar plegadas.");
assert.equal(dashboard.querySelectorAll(".quick-action-strip button").length, 5, "Inicio debe conservar cinco altas directas.");
assert.equal(dashboard.querySelector('script[src="finance-storage.js"]'), null, "Inicio no debe cargar el almacenamiento financiero antes de necesitarlo.");
assert.equal(rrhh.querySelector('script[src="vendor/tesseract.min.js"]'), null, "RR. HH. no debe cargar OCR antes de abrir IPS.");
assert.match(ipsJs, /loadTesseract/, "IPS debe cargar OCR bajo demanda.");

assert.match(experienceCss, /@media \(max-width: 760px\)/, "La experiencia debe tener un diseño móvil explícito.");
assert.match(experienceCss, /finance-balance-card/, "La nueva tarjeta financiera debe estar estilizada.");
assert.match(experienceCss, /hr-bottom-nav/, "RR. HH. debe contar con navegación inferior móvil.");
assert.match(experienceCss, /prefers-reduced-motion/, "La experiencia debe respetar movimiento reducido.");

console.log("ATLAS SO v0.11: jerarquía simple, formularios progresivos, navegación móvil, archivo recuperable y carga diferida verificados.");
