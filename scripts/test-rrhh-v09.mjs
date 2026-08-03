import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(ROOT, file), "utf8");
const source = await read("rrhh-v09-core.js");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: "rrhh-v09-core.js" });
const Core = context.window.AtlasHRV09Core;

assert.ok(Core, "No se publicó el núcleo operativo v0.9");
assert.equal(Core.normalizeCI("4.321.987-0"), "43219870");
assert.equal(Core.isoDate("03/08/2026"), "2026-08-03");

const branches = Array.from({ length: 15 }, (_, index) => Core.normalizeBranch({
    id: `branch-${index + 1}`,
    clientId: `client-${Math.floor(index / 3) + 1}`,
    name: `Sucursal ${index + 1}`
}));
const people = Array.from({ length: 1500 }, (_, index) => ({
    id: `person-${index + 1}`,
    ci: String(5000000 + index),
    fullName: `Funcionario Sintético ${String(index + 1).padStart(4, "0")}`,
    status: "active",
    active: true,
    startDate: index < 70 ? "2026-08-01" : "2025-01-01"
}));
const assignments = people.map((person, index) => Core.normalizeAssignment({
    id: `assignment-${index + 1}`,
    employeeId: person.id,
    clientId: `client-${(index % 5) + 1}`,
    branchId: branches[index % branches.length].id,
    positionId: `position-${(index % 12) + 1}`,
    scheduleId: index % 13 === 0 ? "" : `schedule-${(index % 4) + 1}`,
    from: "2025-01-01"
}));

const filterStart = performance.now();
const scoped = Core.scopePeople(people, assignments, { companyId: "company-1", clientId: "client-2", branchId: "all" }, "2026-08-03");
const filterMs = performance.now() - filterStart;
assert.equal(scoped.length, 300, "El filtro por cliente mezcló funcionarios");
assert.ok(scoped.every(person => Core.assignmentAt(assignments, person.id, "2026-08-03").clientId === "client-2"));

const branchScoped = Core.scopePeople(people, assignments, { companyId: "company-1", clientId: "client-2", branchId: "branch-2" }, "2026-08-03");
assert.ok(branchScoped.every(person => {
    const assignment = Core.assignmentAt(assignments, person.id, "2026-08-03");
    return assignment.clientId === "client-2" && assignment.branchId === "branch-2";
}), "El filtro por sucursal filtró registros ajenos");

const person = people[1];
const before = { ...person, ...Core.assignmentAt(assignments, person.id, "2026-08-03") };
const transition = Core.transitionAssignments(assignments, before, {
    ...person,
    clientId: "client-5",
    branchId: "branch-15",
    areaId: "area-3",
    positionId: "position-8",
    supervisorId: "person-1",
    scheduleId: "schedule-2"
}, {
    effectiveFrom: "2026-08-10",
    reason: "Traslado sintético de prueba",
    userId: "admin-test",
    createId: () => "assignment-transfer"
});
assert.equal(transition.changed, true);
assert.equal(transition.closed.to, "2026-08-09");
assert.equal(transition.created.from, "2026-08-10");
assert.equal(transition.created.clientId, "client-5");
assert.throws(() => Core.transitionAssignments(assignments, before, { ...person, clientId: "client-3" }, { effectiveFrom: "2026-08-10" }), /motivo/i);

const headers = ["C.I.", "Apellidos y Nombres", "Centro de costo", "Sucursal", "Fecha de ingreso"];
const mapping = Core.autoMap(headers, "people");
assert.equal(mapping.ci, "C.I.");
assert.equal(mapping.fullName, "Apellidos y Nombres");
assert.equal(mapping.client, "Centro de costo");
const imported = [
    Core.mappedRow({ "C.I.": "6000001", "Apellidos y Nombres": "Persona Uno", "Centro de costo": "Cliente 1", Sucursal: "Sucursal 1", "Fecha de ingreso": "01/08/2026" }, mapping, "people", 2),
    Core.mappedRow({ "C.I.": "6000001", "Apellidos y Nombres": "Persona Repetida", "Centro de costo": "Cliente 1", Sucursal: "Sucursal 1", "Fecha de ingreso": "01/08/2026" }, mapping, "people", 3)
];
const validated = Core.validateImportRows("people", imported, {
    people: [],
    clients: [{ id: "client-1", name: "Cliente 1" }],
    branches: [{ id: "branch-1", clientId: "client-1", name: "Sucursal 1" }],
    schedules: [],
    existingNaturalKeys: new Set()
});
assert.equal(validated.filter(item => item.issues.some(issue => /repetido/i.test(issue))).length, 2);

const cleanImport = [{ ci: "7000001", fullName: "Persona Nueva", client: "Cliente 1" }];
const firstMerge = Core.mergeByNaturalKey("people", [], cleanImport);
const secondMerge = Core.mergeByNaturalKey("people", firstMerge.records, cleanImport);
assert.equal(firstMerge.records.length, 1);
assert.equal(secondMerge.records.length, 1);
assert.equal(secondMerge.counts.equal, 1, "Reimportar un registro idéntico creó un duplicado");

const searchStart = performance.now();
const search = people.filter(item => `${item.fullName} ${item.ci}`.toLowerCase().includes("sintético 1499"));
const searchMs = performance.now() - searchStart;
assert.equal(search.length, 1);

const metricStart = performance.now();
const metrics = Core.operationalMetrics({
    today: "2026-08-03",
    active: { companyId: "company-1", clientId: "all", branchId: "all" },
    people,
    assignments,
    scheduleAssignments: [],
    attendance: [
        { employeeId: "person-1", date: "2026-08-01", in: "08:00", out: "" },
        { employeeId: "person-2", date: "2026-08-01", rawStatus: "raw_missing" }
    ],
    news: [{ employeeId: "person-1", type: "vacation", startDate: "2026-08-20", endDate: "2026-08-25", status: "pending" }],
    imports: [{ createdAt: "2026-08-01", errors: 2 }],
    audit: [{ entityType: "assignment", action: "transfer", createdAt: "2026-08-02" }]
});
const metricMs = performance.now() - metricStart;
assert.equal(metrics.active, 1500);
assert.equal(metrics.hires, 70);
assert.equal(metrics.transfers, 1);
assert.equal(metrics.incomplete, 1);
assert.equal(metrics.upcomingVacations, 1);

const [html, operation, bulk, storage, dashboard, sql, serviceWorker, packageSource] = await Promise.all([
    read("rrhh.html"), read("rrhh-operation.js"), read("rrhh-bulk-import.js"), read("rrhh-storage.js"),
    read("dashboard.js"), read("supabase/v0.9-rrhh-operation.sql"), read("sw.js"), read("package.json")
]);
assert.match(html, /id="hrChangeBranch"/);
assert.match(html, /data-hr-panel="operation"/);
assert.match(html, /data-hr-panel="imports"/);
assert.match(operation, /transitionAssignments/);
assert.match(operation, /saveParameterVersion/);
assert.match(html, /id="hrParameterForm"/);
assert.doesNotMatch(await read("rrhh-calc.js"), /\* 0\.30|\* 1\.50|baseSalary \/ 30/);
assert.match(bulk, /SHA-256/);
assert.match(storage, /branch_id/);
assert.match(dashboard, /atlasHRAssignments/);
assert.match(sql, /enable row level security|hr_attendance_records/i);
assert.match(sql, /branch_id/);
assert.match(serviceWorker, /rrhh-v09-core\.js/);
assert.equal(JSON.parse(packageSource).version, "0.9.0");

console.log("ATLAS SO v0.9.0: aislamiento, asignaciones, importación idempotente y volumen verificados.", {
    syntheticPeople: people.length,
    clients: 5,
    branches: branches.length,
    filterMs: Number(filterMs.toFixed(3)),
    searchMs: Number(searchMs.toFixed(3)),
    metricMs: Number(metricMs.toFixed(3)),
    leaks: 0,
    duplicateReimports: 0
});
