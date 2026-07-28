(function () {
    const A = window.Atlas;
    const XLSX = window.XLSX;
    const fileInput = document.querySelector("#hrPeopleExcel");
    const result = document.querySelector("#hrImportResult");
    const summary = document.querySelector("#hrImportSummary");
    const errorsTarget = document.querySelector("#hrImportErrors");
    const preview = document.querySelector("#hrImportPreview");
    const processButton = document.querySelector("#hrImportProcess");
    let staged = [];

    const MASTER_HEADERS = [
        "N°", "C.I.N°", "Apellidos y Nombres", "Modalidad Contractual", "Telefono",
        "Direccion", "Ciudad", "Edad", "N° Hijos", "Tipo de Relacion", "Cuenta Bancaria",
        "Banco", "Fecha de Nacimiento", "E-mail", "contacto de emergencia", "Estado Civil",
        "Cargo", "Horario", "fecha de ingeso", "Apellidos", "Nombres", "Centro de costo",
        "SEXO", "profesion", "mes de cumpleaño", "mes numero", "dias", "Estado",
        "Nacionalidad", "salario"
    ];
    function clean(value) {
        return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    function ci(value) { return String(value ?? "").replace(/\D/g, ""); }
    function valueBy(row, aliases) {
        const wanted = aliases.map(clean);
        const entry = Object.entries(row).find(([key]) => wanted.includes(clean(key)));
        return entry?.[1] ?? "";
    }
    function excelDate(value) {
        if (!value) return "";
        if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
        if (typeof value === "number" && XLSX?.SSF?.parse_date_code) {
            const date = XLSX.SSF.parse_date_code(value);
            if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
        }
        const text = String(value).trim();
        const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : text.slice(0, 10);
    }
    function normalizeRow(row, index) {
        const document = ci(valueBy(row, ["C.I.N°", "CI", "Cedula", "Número de cédula"]));
        const fullName = String(valueBy(row, ["Apellidos y Nombres", "Nombre completo", "Funcionario"])).trim()
            || `${valueBy(row, ["Apellidos"])} ${valueBy(row, ["Nombres"])}`.trim();
        const statusText = String(valueBy(row, ["Estado"])).toLowerCase();
        return {
            id: A.createId() + index,
            sourceRow: index + 1,
            ci: document,
            fullName,
            client: window.AtlasHRContext?.client?.name || "",
            position: String(valueBy(row, ["Cargo"])).trim(),
            branch: "",
            clockId: "",
            startDate: excelDate(valueBy(row, ["fecha de ingeso", "fecha de ingreso"])),
            endDate: "",
            workerType: /jornal/i.test(valueBy(row, ["Modalidad Contractual"])) ? "daily" : /parcial/i.test(valueBy(row, ["Modalidad Contractual"])) ? "parttime" : "monthly",
            salary: Number(String(valueBy(row, ["salario"])).replace(/\D/g, "")) || 3044000,
            scheduleId: "",
            workDays: [1, 2, 3, 4, 5, 6],
            active: !/inactiv|baja|retir/i.test(statusText),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceData: Object.fromEntries(MASTER_HEADERS.map(header => [header, valueBy(row, [header])]))
        };
    }
    function validate(rows) {
        const existing = A.readArray("atlasHRPeople");
        const existingByCI = new Map(existing.filter(item => item.ci).map(item => [ci(item.ci), item]));
        const counts = new Map();
        rows.forEach(item => counts.set(item.ci, (counts.get(item.ci) || 0) + 1));
        return rows.map(item => {
            const issues = [];
            if (!item.ci) issues.push("Falta número de cédula");
            if (!item.fullName) issues.push("Falta apellido y nombre");
            if (item.ci && counts.get(item.ci) > 1) issues.push("Cédula repetida dentro del Excel");
            const existingPerson = existingByCI.get(item.ci);
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
        summary.innerHTML = `
            <span><strong>${staged.length}</strong> filas leídas</span>
            <span><strong>${fresh.length}</strong> nuevos</span>
            <span><strong>${updates.length}</strong> actualizaciones</span>
            <span><strong>${invalid.length}</strong> con error</span>`;
        errorsTarget.innerHTML = invalid.length ? `<strong>Errores que deben corregirse</strong><ul>${invalid.map(item =>
            `<li>Fila ${item.sourceRow} · CI ${A.escapeHTML(item.ci || "vacía")} · ${A.escapeHTML(item.fullName || "sin nombre")}: ${A.escapeHTML(item.issues.join(", "))}</li>`
        ).join("")}</ul>` : `<div class="hr-import-ok">✓ El archivo está listo para procesarse.</div>`;
        preview.innerHTML = `<table class="hr-simple-table"><thead><tr><th>Fila</th><th>Cédula</th><th>Funcionario</th><th>Modalidad</th><th>Cargo</th><th>Ingreso</th><th>Resultado</th></tr></thead><tbody>${staged.map(item => `
            <tr class="${item.issues.length ? "hr-row-error" : ""}">
                <td>${item.sourceRow}</td><td>${A.escapeHTML(item.ci || "—")}</td><td>${A.escapeHTML(item.fullName || "—")}</td>
                <td>${A.escapeHTML(item.workerType === "daily" ? "Jornalero" : item.workerType === "parttime" ? "Tiempo parcial" : "Mensualizado")}</td>
                <td>${A.escapeHTML(item.position || "—")}</td><td>${A.escapeHTML(item.startDate || "—")}</td>
                <td><span class="hr-import-status ${item.action}">${item.action === "error" ? "Error" : item.action === "update" ? "Actualizar" : "Nuevo"}</span></td>
            </tr>`).join("")}</tbody></table>`;
        result.hidden = false;
        processButton.disabled = !staged.length || invalid.length > 0;
    }
    async function readWorkbook(file) {
        if (!XLSX) throw new Error("El lector de Excel no está disponible.");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const preferred = workbook.SheetNames.find(name => /datos.*personal/i.test(name)) || workbook.SheetNames[0];
        const sheet = workbook.Sheets[preferred];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
        const headerIndex = matrix.findIndex(row => row.some(cell => ["cin", "cin°", "cedula", "apellidosynombres"].includes(clean(cell))));
        if (headerIndex < 0) throw new Error("No encontré la fila de encabezados de Datos Personales.");
        const headers = matrix[headerIndex].map(String);
        const rows = matrix.slice(headerIndex + 1)
            .filter(row => row.some(cell => String(cell).trim()))
            .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
        staged = validate(rows.map((row, index) => normalizeRow(row, headerIndex + index + 2)));
        render();
    }
    fileInput?.addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            await readWorkbook(file);
            A.notify("Excel analizado. Revisá la vista previa.", "success");
        } catch (error) {
            A.notify(error.message || "No se pudo leer el archivo.", "error");
            event.target.value = "";
        }
    });
    document.querySelector("#hrImportCancel")?.addEventListener("click", () => {
        staged = []; result.hidden = true; fileInput.value = "";
    });
    processButton?.addEventListener("click", () => {
        if (!staged.length || staged.some(item => item.issues.length)) return;
        const current = A.readArray("atlasHRPeople");
        staged.forEach(item => {
            const cleanItem = { ...item }; delete cleanItem.issues; delete cleanItem.action; delete cleanItem.existingId; delete cleanItem.sourceRow;
            const index = current.findIndex(person => ci(person.ci) === item.ci);
            if (index >= 0) current[index] = { ...current[index], ...cleanItem, id: current[index].id, createdAt: current[index].createdAt };
            else current.unshift(cleanItem);
        });
        A.writeJSON("atlasHRPeople", current);
        A.notify(`${staged.length} funcionario(s) procesado(s) correctamente.`, "success");
        setTimeout(() => location.reload(), 700);
    });
    document.querySelector("#hrExportPeople")?.addEventListener("click", () => {
        const people = [...A.readArray("atlasHRPeople")].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        if (!people.length) return A.notify("No hay funcionarios para exportar en este cliente.", "error");
        const rows = people.map((person, index) => {
            const source = person.sourceData || {};
            return {
                ...Object.fromEntries(MASTER_HEADERS.map(header => [header, source[header] ?? ""])),
                "N°": people.length - index,
                "C.I.N°": person.ci,
                "Apellidos y Nombres": person.fullName,
                "Modalidad Contractual": person.workerType === "daily" ? "Jornalero" : person.workerType === "parttime" ? "Tiempo parcial" : "Mensualizado",
                "Cargo": person.position,
                "Horario": person.scheduleId || source.Horario || "",
                "fecha de ingeso": person.startDate,
                "Centro de costo ": window.AtlasHRContext?.client?.name || "",
                "Estado": person.active === false ? "INACTIVO" : "ACTIVO",
                "salario": person.salary
            };
        });
        const sheet = XLSX.utils.json_to_sheet(rows, { header: MASTER_HEADERS });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, "DATOS PERSONALES");
        const company = window.AtlasHRContext?.company?.name || "EMPRESA";
        const client = window.AtlasHRContext?.client?.name || "CLIENTE";
        XLSX.writeFile(workbook, `ATLAS_RRHH_${company}_${client}_FUNCIONARIOS.xlsx`.replace(/[^\w.-]+/g, "_"));
    });
})();
