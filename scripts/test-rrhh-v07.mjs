import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [html, context, calcSource, storageSource, superSource, contracts, ipsSource, schema, baseSchema, securityMigration, worker] = await Promise.all([
    readFile(new URL("../rrhh.html", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-context.js", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-calc.js", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-storage.js", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-super.js", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-contracts.js", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-ips.js", import.meta.url), "utf8"),
    readFile(new URL("../supabase/v0.7-rrhh-scale.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/atlas-schema.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/v0.7.1-security-hardening.sql", import.meta.url), "utf8"),
    readFile(new URL("../sw.js", import.meta.url), "utf8")
]);

const staticChecks = [
    [html.includes('id="hrChangeCompany"') && html.includes('id="hrChangeClient"'), "Faltan selectores independientes de empresa y cliente."],
    [!html.includes('data-hr-tab="structure"'), "Clientes y sucursales todavía aparece como módulo."],
    [html.includes('data-hr-tab="calculations"'), "Falta Cálculo de horas."],
    [!html.includes('data-hr-tab="payroll"'), "La simulación aislada de liquidación todavía está visible."],
    [html.includes('data-hr-tab="contracts"'), "Falta Contratos."],
    [html.includes('id="hrScheduleAdvancedToggle"') && superSource.includes("advancedRuleValues"), "Falta el horario simple con opción por día."],
    [html.includes('id="hrPeopleStatus"') && html.includes("Inactivos del mes"), "Faltan estados de nómina."],
    [context.includes('GENERAL_ID = "all"') && context.includes("rosterName"), "La nómina general no está modelada como vista."],
    [!context.includes("capacity:"), "Todavía existe un cupo artificial por cliente."],
    [context.includes("contractTemplateId"), "El modelo contractual no está ligado al cliente."],
    [html.includes('id="hrIdentityPatronal"') && context.includes("patronalNumber") && ipsSource.includes("C?.company?.patronalNumber") && !ipsSource.includes("const PATRONAL ="), "El CSV IPS todavía usa un número patronal fijo."],
    [superSource.includes("Vinculá estos ID del reloj una sola vez"), "Falta la vinculación estable del ID del reloj."],
    [superSource.includes("Store.mergeRecords"), "Las reimportaciones no comparan cambios."],
    [
    contracts.includes("general:")
        && contracts.includes("Contrato general")
        && (contracts.match(/label:/g) || []).length === 1,
    "El modelo contractual neutral no quedó configurado correctamente."
],
    [contracts.includes("Art. 46") && !contracts.includes("Art. 48") && !contracts.includes("sesenta (60) días"), "El contrato conserva una referencia legal o un periodo de prueba automático incorrecto."],
    [context.includes("documentCity") && html.includes('id="hrIdentityDocumentCity"'), "La ciudad de celebración del contrato sigue fija."],
    [schema.includes("hr_attendance_records") && schema.includes("is_hr_admin()"), "Marcaciones a escala no están protegidas por RR. HH."],
    [baseSchema.includes("alter table public.hr_attendance_records enable row level security") && baseSchema.includes('create policy "hr_attendance_select_admin"'), "El esquema nuevo crea marcaciones sin sus políticas RLS."],
    [baseSchema.includes("assign_first_hr_admin") && securityMigration.includes("assign_first_hr_admin"), "Una instalación sin usuarios podría quedar sin administrador de RR. HH."],
    [baseSchema.includes("can_manage_workspace") && securityMigration.includes('drop policy if exists "members_manage_admin"'), "La administración de miembros todavía permite escalar privilegios desde editor."],
    [securityMigration.includes("role in ('admin', 'editor', 'viewer')") && securityMigration.includes("role <> 'owner'"), "La membresía propietaria no quedó protegida."],
    [securityMigration.includes("grant update (full_name, avatar_url, updated_at)") && securityMigration.includes("grant update (name, slug, updated_at)"), "Los permisos SQL todavía permiten cambiar columnas sensibles."],
    [storageSource.includes("periodEnd(period)") && storageSource.includes("CLOUD_CHUNK_SIZE"), "La nube no maneja correctamente los meses o lotes grandes."],
    [storageSource.includes("atlasHRAttendanceDeletes__") && storageSource.includes("flushPendingDeletions"), "Una eliminación sin conexión podría reaparecer desde la nube."],
    [contracts.includes("documentFingerprint") && contracts.includes("sanitizeDocumentHTML"), "Los documentos no invalidan vistas obsoletas o no limpian HTML pegado."],
    [contracts.includes("Ingresá el salario nominal real del funcionario"), "Los contratos todavía podrían usar un salario inventado."],
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

const workedWithoutSchedule = Calc.calculateDay({
    record: { date: "2026-07-06", in: "08:00", out: "12:00" },
    schedule: null
});
assert.equal(workedWithoutSchedule.status, "worked");
assert.equal(workedWithoutSchedule.actualMinutes, 240);
assert.equal(workedWithoutSchedule.ordinaryDayMinutes, 240);
assert.match(workedWithoutSchedule.warnings.join(" "), /horario vigente/i);

const holidayWithoutMarks = Calc.calculateDay({
    record: { date: "2026-07-06", rawStatus: "FALTA" },
    schedule: daySchedule,
    holiday: true
});
assert.equal(holidayWithoutMarks.status, "holiday");
assert.equal(holidayWithoutMarks.absentDays, 0);
assert.equal(holidayWithoutMarks.missingMinutes, 0);

const tolerantSchedule = {
    rules: [{ day: 1, start: "08:00", end: "17:00", breakMinutes: 60, tolerance: 10 }]
};
const withinTolerance = Calc.calculateDay({
    record: { date: "2026-07-06", in: "08:00", out: "17:05" },
    schedule: tolerantSchedule
});
assert.equal(withinTolerance.extraDayMinutes, 0);
const outsideTolerance = Calc.calculateDay({
    record: { date: "2026-07-06", in: "08:00", out: "17:15" },
    schedule: tolerantSchedule
});
assert.equal(outsideTolerance.extraDayMinutes, 5);
assert.equal(Calc.dateISO("2026-02-31"), "");

const localStore = new Map();
const storageContext = {
    window: {
        AtlasHRCalc: Calc,
        AtlasAuth: null,
        AtlasStore: {
            workspaceId: "test",
            userId: "user",
            read: (key, fallback) => localStore.has(key) ? localStore.get(key) : fallback,
            write: (key, value) => localStore.set(key, structuredClone(value))
        }
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
assert.equal(Store.periodEnd("2026-02"), "2026-02-28");
assert.equal(Store.periodEnd("2028-02"), "2028-02-29");
assert.equal(Store.periodEnd("2026-04"), "2026-04-30");
assert.equal(Store.periodEnd("2026-07"), "2026-07-31");
localStore.set("atlasHRAttendanceFallback__company__2026-07", [
    { id: "keep", employeeId: "employee-1", date: "2026-07-01", in: "08:00", out: "17:00" },
    { id: "remove", employeeId: "employee-2", date: "2026-07-01", in: "08:00", out: "17:00" }
]);
const afterOfflineDelete = await Store.remove("company", "2026-07", "remove");
assert.deepEqual(Array.from(afterOfflineDelete, item => item.id), ["keep"]);
assert.equal(localStore.get("atlasHRAttendanceDeletes__company")[0].id, "remove");
assert.ok(Number.isFinite(Date.parse(localStore.get("atlasHRAttendanceDeletes__company")[0].deletedAt)));
assert.deepEqual(Array.from(await Store.getMonth("company", "2026-07"), item => item.id), ["keep"]);
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

console.log("ATLAS SO v0.7.1: contexto, cálculo, reimportación, seguridad y volumen verificados.");
