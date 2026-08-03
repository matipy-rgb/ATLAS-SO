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
    [context.includes('{ id: "arcor", name: "Arcor", capacity: 60 }'), "Falta Arcor."],
    [context.includes('{ id: "bdp", name: "BDP", detail: "Bebidas del Paraguay", capacity: 5 }'), "Falta BDP."],
    [context.includes('{ id: "servieri", name: "Servieri", capacity: 1 }'), "Falta Servieri."],
    [context.includes('{ id: "geomax", name: "Geomax", capacity: 2 }'), "Falta Geomax."],
    [context.includes('{ id: "polo-este", name: "Polo Este", capacity: 1 }'), "Falta Polo Este."],
    [context.includes("`${key}__${active.companyId}__${active.clientId}`"), "Los datos no están separados por empresa y cliente."],
    [importer.includes("Cédula repetida dentro del Excel"), "Falta validar duplicados internos."],
    [importer.includes('action: issues.length ? "error" : existingPerson ? "update" : "new"'), "Falta clasificar nuevos, actualizaciones y errores."],
    [worker.includes("./vendor/xlsx.full.min.js"), "El lector Excel no está disponible sin conexión."]
];
const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
    failures.forEach(message => console.error(message));
    process.exit(1);
}
console.log("ATLAS SO v0.6: empresas, clientes e importación RR. HH. verificados.");
