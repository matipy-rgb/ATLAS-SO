import { readFile } from "node:fs/promises";

const [html, context, importer, worker] = await Promise.all([
    readFile(new URL("../rrhh.html", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-context.js", import.meta.url), "utf8"),
    readFile(new URL("../rrhh-import.js", import.meta.url), "utf8"),
    readFile(new URL("../sw.js", import.meta.url), "utf8")
]);
const checks = [
    [html.includes('data-script="rrhh-context.js"'), "RR. HH. no inicia con el selector contextual."],
    [html.includes('id="hrPeopleExcel"'), "Falta el importador Excel de funcionarios."],
    [html.includes('id="hrImportProcess"'), "Falta la confirmación previa al procesamiento."],
    [html.includes('id="hrExportPeople"'), "Falta la exportación de nómina."],
    [context.includes('name: "Mi empresa"') && context.includes("clients: []"), "Falta una empresa inicial neutral y vacía."],
    [!context.includes("capacity:"), "Todavía existe un cupo precargado por cliente."],
    [context.includes("`${key}__${companyId}`"), "Los datos no están separados por empresa."],
    [importer.includes("Cédula repetida dentro del Excel"), "Falta validar duplicados internos."],
    [importer.includes('action: issues.length ? "error" : existingPerson ? "update" : "new"'), "Falta clasificar nuevos, actualizaciones y errores."],
    [worker.includes("./vendor/xlsx.full.min.js"), "El lector Excel no está disponible sin conexión."]
];
const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
    failures.forEach(message => console.error(message));
    process.exit(1);
}
console.log("ATLAS SO v0.8.0: empresa neutral, separación e importación RR. HH. verificadas.");
