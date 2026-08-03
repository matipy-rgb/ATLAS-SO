(function () {
    "use strict";

    const A = window.Atlas;
    const C = window.AtlasHRContext;
    const XLSX = window.XLSX;
    const q = selector => document.querySelector(selector);
    const esc = A.escapeHTML;
    const MAX_SPREADSHEET_BYTES = 50 * 1024 * 1024;
    const MAX_SPREADSHEET_ROWS = 250000;
    const MAX_SPREADSHEET_COLUMNS = 200;
    const MASTER_HEADERS = [
        "N°", "C.I.N°", "Apellidos y Nombres", "Modalidad Contractual", "Telefono",
        "Direccion", "Ciudad", "Edad", "N° Hijos", "Tipo de Relacion", "Cuenta Bancaria",
        "Banco", "Fecha de Nacimiento", "E-mail", "contacto de emergencia", "Estado Civil",
        "Cargo", "Horario", "fecha de ingeso", "Apellidos", "Nombres", "Centro de costo",
        "SEXO", "profesion", "mes de cumpleaño", "mes numero", "dias", "Estado",
        "Nacionalidad", "salario", "ID del reloj", "Fecha de salida", "Observación de estado"
    ];
    let staged = [];

    function assertSpreadsheet(file) {
        if (!XLSX) throw new Error("El lector de Excel no está disponible. Recargá la página.");
        if (!/\.(?:xlsx|xlsm|xls)$/i.test(file?.name || "")) throw new Error("Seleccioná un archivo Excel válido.");
        if (file.size > MAX_SPREADSHEET_BYTES) throw new Error("El Excel supera el límite técnico de 50 MB.");
    }

    function assertSheetSize(sheet) {
        if (!sheet) throw new Error("El Excel no contiene una hoja legible.");
        if (!sheet["!ref"]) return;
        const range = XLSX.utils.decode_range(sheet["!ref"]);
        const rows = range.e.r - range.s.r + 1;
        const columns = range.e.c - range.s.c + 1;
        if (rows > MAX_SPREADSHEET_ROWS || columns > MAX_SPREADSHEET_COLUMNS) {
            throw new Error(`La hoja tiene ${rows.toLocaleString("es-PY")} filas y ${columns} columnas; dividila en archivos más pequeños.`);
        }
    }

    function clean(value) {
        return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    function ci(value) { return String(value ?? "").replace(/\D/g, ""); }
    function valueBy(row, aliases) {
        const wanted = aliases.map(clean);
        return Object.entries(row).find(([key]) => wanted.includes(clean(key)))?.[1] ?? "";
    }
    function excelDate(value) {
        if (!value) return "";
        if (value instanceof Date && !Number.isNaN(value.valueOf())) return A.localDate(value);
        if (typeof value === "number" && XLSX?.SSF?.parse_date_code) {
            const date = XLSX.SSF.parse_date_code(value);
            if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
        }
        return window.AtlasHRCalc.dateISO(value);
    }
    function clientFor(value) {
        const text = clean(value);
        if (!text && !C.isGeneral) return C.client;
        return C.company.clients.find(item => clean(item.id) === text || clean(item.name) === text || clean(item.costCenter) === text) || null;
    }
    function statusFor(value, endDate) {
        const text = clean(value);
        if (text.includes("inactivodelmes")) return "inactive-month";
        if (text.includes("inactiv") || text.includes("baja") || text.includes("retir")) {
            return endDate.slice(0, 7) === A.localDate().slice(0, 7) ? "inactive-month" : "inactive";
        }
        return "active";
    }
    function normalizeRow(row, sourceRow) {
        const document = ci(valueBy(row, ["C.I.N°", "CI", "Cedula", "Número de cédula"]));
        const fullName = String(valueBy(row, ["Apellidos y Nombres", "Nombre completo", "Funcionario"])).trim()
            || `${valueBy(row, ["Apellidos"])} ${valueBy(row, ["Nombres"])}`.trim();
        const endDate = excelDate(valueBy(row, ["Fecha de salida", "Fecha de baja", "Retiro"]));
        const clientText = valueBy(row, ["Centro de costo", "Cliente", "Centro de costo "]);
        const client = clientFor(clientText);
        const mode = String(valueBy(row, ["Modalidad Contractual", "Modalidad"]));
        return {
            id: String(A.createId()) + sourceRow,
            sourceRow,
            ci: document,
            fullName,
            clientId: client?.id || "",
            clientSource: String(clientText || ""),
            position: String(valueBy(row, ["Cargo"])).trim(),
            costCenter: String(clientText || client?.costCenter || "").trim(),
            clockId: String(valueBy(row, ["ID del reloj", "ID Reloj", "ID marcación"])).trim(),
            startDate: excelDate(valueBy(row, ["fecha de ingeso", "fecha de ingreso", "Ingreso"])),
            endDate,
            status: statusFor(valueBy(row, ["Estado"]), endDate),
            statusNote: String(valueBy(row, ["Observación de estado", "Observacion"])).trim(),
            active: statusFor(valueBy(row, ["Estado"]), endDate) === "active",
            workerType: /jornal/i.test(mode) ? "daily" : /parcial/i.test(mode) ? "parttime" : "monthly",
            salary: Number(String(valueBy(row, ["salario", "Sueldo"])).replace(/\D/g, "")) || 0,
            birthDate: excelDate(valueBy(row, ["Fecha de Nacimiento", "Nacimiento"])),
            sex: String(valueBy(row, ["SEXO", "Sexo"])).trim(),
            civilStatus: String(valueBy(row, ["Estado Civil"])).trim(),
            nationality: String(valueBy(row, ["Nacionalidad"])).trim() || "Paraguaya",
            profession: String(valueBy(row, ["profesion", "Profesión"])).trim(),
            city: String(valueBy(row, ["Ciudad"])).trim(),
            address: String(valueBy(row, ["Direccion", "Dirección"])).trim(),
            phone: String(valueBy(row, ["Telefono", "Teléfono"])).trim(),
            email: String(valueBy(row, ["E-mail", "Email"])).trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceData: Object.fromEntries(MASTER_HEADERS.map(header => [header, valueBy(row, [header])]))
        };
    }

    function validate(rows) {
        const existing = A.readArray("atlasHRPeople");
        const existingByCI = new Map(existing.filter(item => item.ci).map(item => [ci(item.ci), item]));
        const existingClock = new Map(existing.filter(item => item.clockId).map(item => [String(item.clockId), item]));
        const counts = new Map();
        const clockCounts = new Map();
        rows.forEach(item => {
            counts.set(item.ci, (counts.get(item.ci) || 0) + 1);
            if (item.clockId) clockCounts.set(item.clockId, (clockCounts.get(item.clockId) || 0) + 1);
        });
        return rows.map(item => {
            const issues = [];
            if (!item.ci) issues.push("Falta número de cédula");
            if (!item.fullName) issues.push("Falta apellido y nombre");
            if (!item.clientId) issues.push(`Cliente o centro de costo no reconocido: ${item.clientSource || "vacío"}`);
            if (item.status !== "active" && !item.endDate) issues.push("El estado inactivo requiere fecha de salida");
            if (item.startDate && item.endDate && item.endDate < item.startDate) issues.push("La fecha de salida es anterior al ingreso");
            if (item.ci && counts.get(item.ci) > 1) issues.push("Cédula repetida dentro del Excel");
            if (item.clockId && clockCounts.get(item.clockId) > 1) issues.push("ID del reloj repetido dentro del Excel");
            const existingPerson = existingByCI.get(item.ci);
            const clockOwner = existingClock.get(item.clockId);
            if (clockOwner && clockOwner.id !== existingPerson?.id) issues.push("ID del reloj ya asignado a otra persona");
            return {
                ...item,
                issues,
                action: issues.length ? "error" : existingPerson ? "update" : "new",
                existingId: existingPerson?.id || null
            };
        });
    }

    function render() {
        const invalid = staged.filter(item => item.issues.length);
        const fresh = staged.filter(item => item.action === "new");
        const updates = staged.filter(item => item.action === "update");
        q("#hrImportSummary").innerHTML = `<span><strong>${staged.length.toLocaleString("es-PY")}</strong> filas</span><span><strong>${fresh.length}</strong> nuevos</span><span><strong>${updates.length}</strong> actualizaciones</span><span><strong>${invalid.length}</strong> con error</span>`;
        q("#hrImportErrors").innerHTML = invalid.length ? `<strong>Corregí estos datos antes de procesar:</strong><ul>${invalid.slice(0, 100).map(item =>
            `<li>Fila ${item.sourceRow} · CI ${esc(item.ci || "vacía")} · ${esc(item.fullName || "sin nombre")}: ${esc(item.issues.join(", "))}</li>`
        ).join("")}</ul>${invalid.length > 100 ? `<p>Se muestran 100 de ${invalid.length} errores.</p>` : ""}` : '<div class="hr-import-ok">✓ El archivo está listo para procesarse.</div>';
        q("#hrImportPreview").innerHTML = `<table class="hr-simple-table"><thead><tr><th>Fila</th><th>Cédula</th><th>Funcionario</th><th>Cliente</th><th>Estado</th><th>Resultado</th></tr></thead><tbody>${staged.slice(0, 200).map(item => `<tr class="${item.issues.length ? "hr-row-error" : ""}"><td>${item.sourceRow}</td><td>${esc(item.ci || "—")}</td><td>${esc(item.fullName || "—")}</td><td>${esc(C.clientById(item.clientId)?.name || item.clientSource || "—")}</td><td>${esc(item.status)}</td><td><span class="hr-import-status ${item.action}">${item.action === "error" ? "Error" : item.action === "update" ? "Actualizar" : "Nuevo"}</span></td></tr>`).join("")}</tbody></table>`;
        q("#hrImportResult").hidden = false;
        q("#hrImportProcess").disabled = !staged.length || invalid.length > 0;
    }

    async function readWorkbook(file) {
        assertSpreadsheet(file);
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const preferred = workbook.SheetNames.find(name => /datos.*personal/i.test(name)) || workbook.SheetNames[0];
        const sheet = workbook.Sheets[preferred];
        assertSheetSize(sheet);
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
        const headerIndex = matrix.findIndex(row => row.some(cell => ["cin", "cin°", "cedula", "apellidosynombres"].includes(clean(cell))));
        if (headerIndex < 0) throw new Error("No encontré la fila de encabezados de Datos Personales.");
        const headers = matrix[headerIndex].map(String);
        const rows = matrix.slice(headerIndex + 1)
            .filter(row => row.some(cell => String(cell).trim()))
            .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
        staged = validate(rows.map((row, index) => normalizeRow(row, headerIndex + index + 2)));
        render();
    }

    q("#hrPeopleExcel").addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            await readWorkbook(file);
            A.notify("Excel analizado. Nada se guardó todavía.");
        } catch (error) {
            A.notify(error.message || "No se pudo leer el archivo.", "error");
        } finally {
            event.target.value = "";
        }
    });
    q("#hrImportCancel").addEventListener("click", () => { staged = []; q("#hrImportResult").hidden = true; });
    q("#hrImportProcess").addEventListener("click", () => {
        if (!staged.length || staged.some(item => item.issues.length)) return;
        let current = A.readArray("atlasHRPeople");
        staged.forEach(item => {
            const cleanItem = { ...item };
            ["issues", "action", "existingId", "sourceRow", "clientSource"].forEach(key => delete cleanItem[key]);
            const index = current.findIndex(person => ci(person.ci) === item.ci);
            if (index >= 0) current[index] = { ...current[index], ...cleanItem, id: current[index].id, createdAt: current[index].createdAt };
            else current.unshift(cleanItem);
        });
        A.writeJSON("atlasHRPeople", current);
        window.dispatchEvent(new CustomEvent("atlas:hr-data-changed", { detail: { type: "people-import" } }));
        A.notify(`${staged.length.toLocaleString("es-PY")} funcionario(s) procesado(s).`);
        staged = [];
        q("#hrImportResult").hidden = true;
    });

    q("#hrExportPeople").addEventListener("click", () => {
        const roster = C.visible(A.readArray("atlasHRPeople")).sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "es"));
        if (!roster.length) return A.notify("No hay funcionarios para exportar.", "error");
        const rows = roster.map((person, index) => ({
            ...Object.fromEntries(MASTER_HEADERS.map(header => [header, person.sourceData?.[header] ?? ""])),
            "N°": index + 1,
            "C.I.N°": person.ci,
            "Apellidos y Nombres": person.fullName,
            "Modalidad Contractual": person.workerType === "daily" ? "Jornalero" : person.workerType === "parttime" ? "Tiempo parcial" : "Mensualizado",
            "Telefono": person.phone,
            "Direccion": person.address,
            "Ciudad": person.city,
            "Fecha de Nacimiento": person.birthDate,
            "E-mail": person.email,
            "Estado Civil": person.civilStatus,
            "Cargo": person.position,
            "fecha de ingeso": person.startDate,
            "Centro de costo": C.clientById(person.clientId)?.name || person.costCenter,
            "SEXO": person.sex,
            "profesion": person.profession,
            "Estado": person.status === "active" ? "ACTIVO" : person.status === "inactive-month" ? "INACTIVO MES" : "INACTIVO",
            "Nacionalidad": person.nationality,
            "salario": person.salary,
            "ID del reloj": person.clockId,
            "Fecha de salida": person.endDate,
            "Observación de estado": person.statusNote
        }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: MASTER_HEADERS }), "DATOS PERSONALES");
        XLSX.writeFile(workbook, `ATLAS_RRHH_${C.company.name}_${C.client?.name || C.company.rosterName}_FUNCIONARIOS.xlsx`.replace(/[^\w.-]+/g, "_"));
    });
})();
