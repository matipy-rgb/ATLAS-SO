import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

assert.equal(XLSX.version, "0.20.3", "Debe usarse la versión corregida y oficial de SheetJS");

const attendanceRows = [
    ["Nombre", "ID", "Fecha", "Entrada", "Salida"],
    ["Persona Uno", "15", "01/07/2026", "07:30", "18:00"],
    ["Persona Dos", "16", "01/07/2026", "", "FALTA"]
];
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(attendanceRows), "Marcaciones");
const binary = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
const reopened = XLSX.read(binary, { type: "buffer", cellDates: true });
const matrix = XLSX.utils.sheet_to_json(reopened.Sheets.Marcaciones, { header: 1, defval: "", raw: true });

assert.equal(matrix.length, 3);
assert.deepEqual(matrix[0], attendanceRows[0]);
assert.equal(matrix[2][4], "FALTA");

const csv = XLSX.read("Nombre,ID,Fecha,Entrada,Salida\nPersona,2,2026-07-01,08:00,17:00", { type: "string" });
const csvRows = XLSX.utils.sheet_to_json(csv.Sheets[csv.SheetNames[0]], { header: 1, defval: "" });
assert.equal(String(csvRows[1][1]), "2");
assert.ok(Math.abs(Number(csvRows[1][4]) - 17 / 24) < 1e-9, "La hora CSV debe conservarse como hora de Excel");

const date = XLSX.SSF.parse_date_code(46204);
assert.ok(date?.y && date?.m && date?.d, "Debe interpretar fechas serializadas de Excel");

const [bundle, packageSource, importSource, superSource] = await Promise.all([
    readFile(new URL("../vendor/xlsx.full.min.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-import.js", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-super.js", import.meta.url), "utf8")
]);
assert.match(bundle, /0\.20\.3/);
assert.equal(JSON.parse(packageSource).dependencies.xlsx, "file:vendor/xlsx-0.20.3.tgz");
assert.match(importSource, /MAX_SPREADSHEET_BYTES/);
assert.match(superSource, /MAX_SPREADSHEET_ROWS/);

console.log("ATLAS SO v0.7.1: importación y exportación XLSX/CSV verificadas con SheetJS 0.20.3.");
