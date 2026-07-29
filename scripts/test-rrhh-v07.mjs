import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [html, context, calcSource, storageSource, superSource, contracts, schema, worker] = await Promise.all([
    readFile(new URL("../rrhh.html", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-context.js", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-calc.js", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-storage.js", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-super.js", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-contracts.js", import.meta.url), "utf8"),
    readFile(new URL("../supabase/v0.7-rrhh-scale.sql", import.meta.url), "utf8"),
    readFile(new URL("../sw.js", import.meta.url), "utf8")
]);

const staticChecks = [
    [html.includes('id="hrChangeCompany"') && html.includes('id="hrChangeClient"'), "Faltan selectores independientes de empresa y cliente."],
    [!html.includes('data-hr-tab="structure"'), "Clientes y sucursales todavía aparece como módulo."],
    [html.includes('data-hr-tab="calculations"'), "Falta Cálculo de horas."],
    [html.includes('data-hr-tab="contracts"'), "Falta Contratos."],
    [html.includes('id="hrPeopleStatus"') && html.includes("Inactivos del mes"), "Faltan estados de nómina."],
    [context.includes('GENERAL_ID = "all"') && context.includes("rosterName"), "La nómina general no está modelada como vista."],
    [!context.includes("capacity:"), "Todavía existe un cupo artificial por cliente."],
    [context.includes("contractTemplateId"), "El modelo contractual no está ligado al cliente."],
    [superSource.includes("Vinculá estos ID del reloj una sola vez"), "Falta la vinculación estable del ID del reloj."],
    [superSource.includes("Store.mergeRecords"), "Las reimportaciones no comparan cambios."],
    [contracts.includes("Contrato BDP") && contracts.includes("Contrato GEOMAX"), "Faltan modelos contractuales del Excel base."],
    [schema.includes("hr_attendance_records") && schema.includes("is_hr_admin()"), "Marcaciones a escala no están protegidas por RR. HH."],
    [worker.includes("./rrhh-calc.js") && worker.includes("./rrhh-storage.js") && worker.includes("./rrhh-contracts.js"), "El modo sin conexión no incluye los módulos nuevos."]
];
for (const [ok, message] of staticChecks) assert.ok(ok, message);

const calcContext = { globalThis: {}, module: { exports: {} } };
calcContext.globalThis = calcContext;
vm.createContext(calcContext);
vm.runInContext(calcSource, calcContext, { filename: "rrhh-calc.js" });
const Calc = calcContext.module.exports;

const daySchedule = {
    rules: [1, 2, 3, 4, 5].map(day => ({ day, start: "07:30", end: "18:00", breakMinutes: 60, tolerance: 0 }))
};
const exact = Calc.calculateDay({ record: { date: "2026-07-06", in: "07:30", out: "18:00" }, schedule: daySchedule });
assert.equal(exact.scheduledMinutes, 570);
assert.equal(exact.actualMinutes, 570);
assert.equal(exact.extraDayMinutes, 0);

const extra = Calc.calculateDay({ record: { date: "2026-07-06", in: "07:30", out: "19:00" }, schedule: daySchedule });
assert.equal(extra.extraDayMinutes, 60);
assert.equal(extra.missingMinutes, 0);

const nightSchedule = { rules: [{ day: 1, start: "20:00", end: "04:00", breakMinutes: 30 }] };
const night = Calc.calculateDay({ record: { date: "2026-07-06", in: "20:00", out: "04:00" }, schedule: nightSchedule });
assert.equal(night.actualMinutes, 450);
assert.equal(night.nightPremiumMinutes, 450);

const sunday = Calc.calculateDay({
    record: { date: "2026-07-05", in: "08:00", out: "12:00" },
    schedule: { rules: [{ day: 0, start: "08:00", end: "12:00", breakMinutes: 0 }] }
});
assert.equal(sunday.sundayHolidayMinutes, 240);

const missing = Calc.calculateDay({ record: { date: "2026-07-06", rawStatus: "FALTA" }, schedule: daySchedule });
assert.equal(missing.status, "raw_missing");
assert.equal(missing.absentDays, 1);
assert.equal(missing.missingMinutes, 570);

const storageContext = {
    window: {
        AtlasHRCalc: Calc,
        AtlasAuth: null,
        AtlasStore: { workspaceId: "test", userId: "user" }
    },
    console,
    indexedDB: undefined,
    Promise,
    Map,
    Array,
    String,
    Date,
    JSON
};
vm.createContext(storageContext);
vm.runInContext(storageSource, storageContext, { filename: "rrhh-storage.js" });
const Store = storageContext.window.AtlasHRStorage;
const base = Array.from({ length: 10000 }, (_, index) => ({
    id: `a-${index}`,
    employeeId: `e-${index}`,
    clientId: `c-${index % 20}`,
    date: "2026-07-01",
    in: "07:30",
    out: "18:00"
}));
const changed = base.map((item, index) => index % 10 === 0 ? { ...item, out: "19:00" } : item);
const merged = Store.mergeRecords(base, changed);
assert.equal(merged.records.length, 10000);
assert.equal(merged.counts.updated, 1000);
assert.equal(merged.counts.equal, 9000);

let totalMinutes = 0;
for (let employee = 0; employee < 2000; employee += 1) {
    for (let day = 1; day <= 31; day += 1) {
        const date = `2026-07-${String(day).padStart(2, "0")}`;
        const weekday = Calc.dayOfWeek(date);
        const schedule = { rules: [{ day: weekday, start: "07:30", end: "18:00", breakMinutes: 60 }] };
        totalMinutes += Calc.calculateDay({ record: { date, in: "07:30", out: "18:00" }, schedule }).actualMinutes;
    }
}
assert.equal(totalMinutes, 2000 * 31 * 570);

console.log("ATLAS SO v0.7: contexto, cálculo, reimportación y volumen verificados.");
