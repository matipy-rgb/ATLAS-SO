(function () {
    "use strict";

    const A = window.Atlas;
    const C = window.AtlasHRContext;
    const q = selector => document.querySelector(selector);
    const esc = A.escapeHTML;
    const HISTORY_KEY = "atlasHRContractHistory";
    const MODELS = {
        amancer: {
            label: "Contrato AMANCER",
            role: "Operario de fábrica",
            workplace: "Gral. Aquino 1731, Luque",
            term: "determined",
            extra: "Cuando las necesidades operativas o las temporadas de alta demanda requieran servicios en sábados o domingos, las horas serán remuneradas conforme a la legislación vigente."
        },
        bdp: {
            label: "Contrato BDP",
            role: "Operario logístico",
            workplace: "Complejo Industrial San Juan, km 8 Acaray, Ciudad del Este",
            term: "determined",
            extra: "Por necesidades operativas, trabajos de urgencia o alta demanda, la empresa podrá requerir servicios extraordinarios dentro de los límites legales."
        },
        arcor: {
            label: "Contrato ARCOR",
            role: "Operario de Planta Logística",
            workplace: "Parque Industrial Ruta II Mariscal Estigarribia",
            term: "determined",
            extra: "Los servicios extraordinarios en sábados, domingos o feriados se regirán y remunerarán conforme al Código del Trabajo."
        },
        polo: {
            label: "Contrato POLO",
            role: "Operario logístico",
            workplace: "Centro Logístico Autopista Silvio Pettirossi, Luque",
            term: "indefinite",
            extra: "Los servicios extraordinarios serán prestados dentro de los límites legales y remunerados conforme a la legislación vigente."
        },
        geomax: {
            label: "Contrato GEOMAX",
            role: "Ejecutivo Comercial de Telemática tercerizado en GEOMAX",
            workplace: "Asunción y Gran Asunción",
            term: "indefinite",
            extra: "Las condiciones variables o comisiones adicionales deberán constar en una adenda firmada por ambas partes."
        }
    };
    let lastDocument = null;

    function people() { return window.AtlasHRPeople?.visible() || C.visible(A.readArray("atlasHRPeople")); }
    function personById(id) { return (window.AtlasHRPeople?.all() || A.readArray("atlasHRPeople")).find(item => String(item.id) === String(id)); }
    function clientFor(person) { return C.clientById(person?.clientId); }
    function money(value) { return `G. ${Math.round(Number(value || 0)).toLocaleString("es-PY")}`; }

    function ageOn(birthDate, date) {
        const birth = A.parseDate(birthDate);
        const point = A.parseDate(date);
        if (!birth || !point) return "";
        let years = point.getFullYear() - birth.getFullYear();
        if (point.getMonth() < birth.getMonth() || (point.getMonth() === birth.getMonth() && point.getDate() < birth.getDate())) years -= 1;
        return years;
    }

    function longDate(value) {
        const date = A.parseDate(value);
        if (!date) return "";
        return new Intl.DateTimeFormat("es-PY", { day: "numeric", month: "long", year: "numeric" }).format(date);
    }

    function scheduleText(person, date) {
        const schedule = window.AtlasHRSchedules?.scheduleFor(person.id, date);
        if (!schedule) return "Horario pendiente de consignar";
        const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
        const groups = new Map();
        (schedule.rules || []).forEach(rule => {
            const key = `${rule.start}|${rule.end}|${Number(rule.breakMinutes || 0)}`;
            if (!groups.has(key)) groups.set(key, { ...rule, days: [] });
            groups.get(key).days.push(dayNames[Number(rule.day)]);
        });
        const detail = Array.from(groups.values()).map(rule =>
            `${rule.days.join(", ")}, de ${rule.start} a ${rule.end}, con ${Number(rule.breakMinutes || 0)} minutos de descanso`
        ).join("; ");
        return `${schedule.name}: ${detail}`;
    }

    function validate(person, type) {
        const errors = [];
        const warnings = [];
        const company = C.company;
        const client = clientFor(person);
        const date = q("#hrContractDate").value;
        const endDate = q("#hrContractEnd").value;
        const note = q("#hrContractNote").value.trim();
        const model = client?.contractTemplateId ? MODELS[client.contractTemplateId] : null;
        if (!person) errors.push("Seleccioná un funcionario.");
        if (!date) errors.push("Indicá la fecha del documento.");
        if (person && !person.fullName) errors.push("Falta el nombre del funcionario.");
        if (person && !person.ci) errors.push("Falta la cédula del funcionario.");
        if (person && !client) errors.push("El funcionario no tiene un cliente válido.");
        if (!company.legalName && !company.name) errors.push("Falta la razón social de la empresa.");
        if (!company.ruc) errors.push("Falta el RUC de la empresa.");
        if (!company.representative) errors.push("Falta el representante de la empresa.");
        if (type === "contract" && !company.address) errors.push("Falta el domicilio legal de la empresa.");
        if (type === "contract" && !company.documentCity) errors.push("Falta la ciudad de celebración del contrato.");
        if (type === "contract" && client && !client.contractTemplateId) errors.push(`El cliente ${client.name} no tiene un modelo contractual asignado.`);
        if (type === "contract" && client?.contractTemplateId && !MODELS[client.contractTemplateId]) errors.push("El modelo contractual asignado no está disponible.");
        if (type === "contract" && person && Number(person.salary || 0) <= 0) errors.push("Ingresá el salario nominal real del funcionario.");
        if (type === "contract" && model?.term === "determined" && !endDate) errors.push("Este modelo requiere la fecha de fin del contrato.");
        if (type === "contract" && model?.term === "determined") warnings.push("Confirmá que la naturaleza temporal o accidental del servicio justifique el plazo determinado.");
        if (type === "contract" && date && endDate && endDate < date) errors.push("El fin del contrato no puede ser anterior a la fecha del documento.");
        if ((type === "addendum1" || type === "addendum2") && !note) errors.push("Escribí la condición que se incorporará en la adenda.");
        if (person && !person.startDate) warnings.push("Falta la fecha de ingreso.");
        if (person && !person.address) warnings.push("Falta el domicilio del funcionario.");
        if (person && !person.birthDate) warnings.push("Falta la fecha de nacimiento; no se mostrará la edad.");
        if (person && !window.AtlasHRSchedules?.scheduleFor(person.id, q("#hrContractDate").value || A.localDate())) warnings.push("No hay un horario vigente asignado.");
        return { errors, warnings };
    }

    function documentFingerprint() {
        return JSON.stringify({
            employeeId: q("#hrContractEmployee").value,
            type: q("#hrContractType").value,
            date: q("#hrContractDate").value,
            endDate: q("#hrContractEnd").value,
            note: q("#hrContractNote").value.trim()
        });
    }

    function sanitizeDocumentHTML(value) {
        const template = document.createElement("template");
        template.innerHTML = String(value || "");
        const allowedTags = new Set(["ARTICLE", "H1", "H2", "P", "STRONG", "B", "EM", "U", "BR", "DIV", "FOOTER", "UL", "OL", "LI", "IMG"]);
        const allowedClasses = new Set(["contract-document", "subtitle", "signatures", "single", "document-logo"]);
        Array.from(template.content.querySelectorAll("*")).forEach(node => {
            if (!allowedTags.has(node.tagName)) {
                node.replaceWith(document.createTextNode(node.textContent || ""));
                return;
            }
            const originalClass = node.getAttribute("class") || "";
            const originalSource = node.getAttribute("src") || "";
            Array.from(node.attributes).forEach(attribute => node.removeAttribute(attribute.name));
            const classes = originalClass.split(/\s+/).filter(name => allowedClasses.has(name));
            if (classes.length) node.className = classes.join(" ");
            if (node.tagName === "IMG") {
                if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(originalSource)) {
                    node.src = originalSource;
                    node.alt = "";
                } else node.remove();
            }
        });
        return template.innerHTML;
    }

    function contractBody(person, client, model, date, endDate, note) {
        const company = C.company;
        const role = person.position || model.role;
        const workplace = client.workplace || model.workplace;
        const age = ageOn(person.birthDate, date);
        const salaryLine = person.workerType === "daily"
            ? `un jornal nominal de ${money(person.salary)}`
            : `un salario mensual nominal de ${money(person.salary)}`;
        const term = endDate || model.term === "determined"
            ? `determinado, con terminación prevista para el ${longDate(endDate) || "fecha pendiente"}`
            : "por tiempo indefinido";
        return `
            <h1>CONTRATO INDIVIDUAL DE TRABAJO</h1>
            <p class="subtitle">(datos y cláusulas conforme al Art. 46 del Código del Trabajo)</p>
            <p>En ${esc(company.documentCity)}, en fecha ${longDate(date)}, por una parte <strong>${esc(company.representative)}</strong>${company.representativeCI ? `, con C.I. N.º ${esc(company.representativeCI)}` : ""}, en representación de <strong>${esc(company.legalName || company.name)}</strong>, RUC ${esc(company.ruc)}, con domicilio en ${esc(company.address || "domicilio pendiente")}, en adelante “EL EMPLEADOR”; y por la otra <strong>${esc(person.fullName)}</strong>, con C.I. N.º ${esc(person.ci)}${age !== "" ? `, de ${age} años de edad` : ""}, ${person.sex ? `sexo ${esc(person.sex.toLowerCase())}, ` : ""}${person.civilStatus ? `estado civil ${esc(person.civilStatus.toLowerCase())}, ` : ""}${person.profession ? `profesión u oficio ${esc(person.profession)}, ` : ""}nacionalidad ${esc(person.nationality || "paraguaya")}, con domicilio en ${esc(person.address || "domicilio pendiente")}, en adelante “EL TRABAJADOR”, convienen el presente contrato.</p>
            <h2>MODALIDADES</h2>
            <p><strong>PRIMERA · Trabajo y lugar.</strong> EL TRABAJADOR prestará servicios como <strong>${esc(role)}</strong> para el cliente <strong>${esc(client.name)}</strong>, principalmente en ${esc(workplace)}. La relación con el cliente no altera la identidad del empleador.</p>
            <p><strong>SEGUNDA · Forma.</strong> La prestación se remunera por unidad de tiempo, bajo modalidad ${esc(person.workerType === "daily" ? "jornalera" : person.workerType === "parttime" ? "a tiempo parcial" : "mensualizada")}.</p>
            <p><strong>TERCERA · Remuneración.</strong> Las partes acuerdan ${esc(salaryLine)}, sujeto a los aportes, descuentos y adicionales previstos por la normativa aplicable.</p>
            <p><strong>CUARTA · Plazo.</strong> El contrato se celebra por plazo ${esc(term)}.</p>
            ${model.probation ? `<p><strong>Periodo de prueba.</strong> ${esc(model.probation)}</p>` : ""}
            <p><strong>QUINTA · Materiales y seguridad.</strong> Las herramientas, equipos de protección e implementos necesarios serán proporcionados o autorizados por EL EMPLEADOR según la tarea y las condiciones del lugar de prestación.</p>
            <p><strong>SEXTA · Jornada.</strong> ${esc(scheduleText(person, date))}. El descanso semanal y los límites de jornada se aplicarán conforme a la legislación vigente. ${esc(model.extra)}</p>
            <p><strong>SÉPTIMA · Pago.</strong> El pago ordinario será realizado según la modalidad contractual y dentro del periodo legal correspondiente.</p>
            <p><strong>OCTAVA · Inicio.</strong> La fecha de ingreso e inicio de labores es el ${esc(longDate(person.startDate) || "dato pendiente")}.</p>
            <p><strong>NOVENA · Beneficios y obligaciones.</strong> Las partes se obligan a cumplir el Código del Trabajo, las normas de seguridad, los reglamentos internos y las instrucciones legítimas relacionadas con el servicio.</p>
            ${note ? `<p><strong>CONDICIÓN ADICIONAL.</strong> ${esc(note)}</p>` : ""}
            <p>Leído y ratificado, se firman dos ejemplares del mismo tenor y efecto.</p>
            <div class="signatures"><div>_____________________________<br><strong>${esc(person.fullName)}</strong><br>Trabajador · C.I. ${esc(person.ci)}</div><div>_____________________________<br><strong>${esc(company.representative)}</strong><br>Empleador o representante legal</div></div>`;
    }

    function certificateBody(person, date, note) {
        const company = C.company;
        const client = clientFor(person);
        return `<h1>CERTIFICADO DE TRABAJO</h1>
            <p>Por medio de la presente, <strong>${esc(company.legalName || company.name)}</strong>, RUC ${esc(company.ruc)}, certifica que <strong>${esc(person.fullName)}</strong>, con C.I. N.º ${esc(person.ci)}, presta${person.status === "active" ? "" : "ó"} servicios desde el ${esc(longDate(person.startDate) || "fecha pendiente")}${person.endDate ? ` hasta el ${esc(longDate(person.endDate))}` : ""}, desempeñándose como ${esc(person.position || "cargo pendiente")} para el cliente ${esc(client?.name || "cliente pendiente")}.</p>
            ${note ? `<p>${esc(note)}</p>` : ""}
            <p>Se expide a solicitud de la parte interesada en fecha ${esc(longDate(date))}.</p>
            <div class="signatures single"><div>_____________________________<br><strong>${esc(company.representative)}</strong><br>Representante legal</div></div>`;
    }

    function addendumBody(person, date, type, note) {
        const company = C.company;
        const client = clientFor(person);
        const title = type === "addendum1" ? "ADENDA N.º 1" : "ADENDA N.º 2";
        return `<h1>${title}</h1>
            <p>Entre <strong>${esc(company.legalName || company.name)}</strong>, RUC ${esc(company.ruc)}, representada por ${esc(company.representative)}, y <strong>${esc(person.fullName)}</strong>, C.I. N.º ${esc(person.ci)}, se acuerda complementar el contrato individual de trabajo vigente.</p>
            <p><strong>Cliente relacionado:</strong> ${esc(client?.name || "Sin cliente")}.</p>
            <p><strong>Condición acordada:</strong> ${esc(note || "Debe completarse la condición de esta adenda antes de firmar.")}</p>
            <p>Las demás cláusulas del contrato original permanecen invariables. Se firma en fecha ${esc(longDate(date))}.</p>
            <div class="signatures"><div>_____________________________<br><strong>${esc(person.fullName)}</strong><br>Trabajador</div><div>_____________________________<br><strong>${esc(company.representative)}</strong><br>Empleador o representante legal</div></div>`;
    }

    function buildDocument() {
        const person = personById(q("#hrContractEmployee").value);
        const type = q("#hrContractType").value;
        const check = validate(person, type);
        q("#hrContractValidation").innerHTML = [
            check.errors.length ? `<strong>Falta completar:</strong><ul>${check.errors.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : "",
            check.warnings.length ? `<strong>Advertencias:</strong><ul>${check.warnings.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : ""
        ].join("") || '<div class="hr-import-ok">✓ Documento listo para generar.</div>';
        if (check.errors.length) {
            lastDocument = null;
            return null;
        }
        const date = q("#hrContractDate").value;
        const typeLabel = { contract: "Contrato individual de trabajo", certificate: "Certificado de trabajo", addendum1: "Adenda 1", addendum2: "Adenda 2" }[type];
        let body = "";
        if (type === "contract") {
            const client = clientFor(person);
            body = contractBody(person, client, MODELS[client.contractTemplateId], date, q("#hrContractEnd").value, q("#hrContractNote").value.trim());
        } else if (type === "certificate") body = certificateBody(person, date, q("#hrContractNote").value.trim());
        else body = addendumBody(person, date, type, q("#hrContractNote").value.trim());
        const logo = C.company.logo ? `<img class="document-logo" src="${esc(C.company.logo)}" alt="">` : "";
        const html = `<article class="contract-document">${logo}${body}<footer>Generado por ATLAS SO · ${esc(C.company.name)} · ${esc(typeLabel)}</footer></article>`;
        lastDocument = { person, type, typeLabel, date, html, fingerprint: documentFingerprint() };
        q("#hrContractPreview").innerHTML = html;
        return lastDocument;
    }

    function documentPage(content) {
        return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Documento laboral</title><style>
            @page{size:A4;margin:22mm}body{font-family:Arial,sans-serif;color:#111;line-height:1.45;font-size:11pt}.contract-document{max-width:175mm;margin:auto}
            h1{text-align:center;font-size:15pt;margin:0 0 2mm}h2{text-align:center;font-size:11pt;margin:6mm 0 3mm}.subtitle{text-align:center;margin-top:0}
            p{text-align:justify;margin:3mm 0}.document-logo{display:block;max-width:35mm;max-height:20mm;margin:0 auto 6mm}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:25mm;margin-top:25mm;text-align:center}.signatures.single{grid-template-columns:1fr;margin-left:50%}
            footer{margin-top:12mm;padding-top:3mm;border-top:1px solid #bbb;font-size:8pt;color:#666;text-align:center}
        </style></head><body>${content}</body></html>`;
    }

    function documentForOutput() {
        const sameSelection = lastDocument && lastDocument.fingerprint === documentFingerprint();
        if (!sameSelection) return buildDocument();
        const edited = sanitizeDocumentHTML(q("#hrContractPreview").innerHTML.trim());
        if (edited) lastDocument.html = edited;
        return lastDocument;
    }

    function saveHistory(doc, format) {
        const history = A.readArray(HISTORY_KEY);
        history.unshift({
            id: String(A.createId()),
            employeeId: doc.person.id,
            clientId: doc.person.clientId,
            type: doc.type,
            typeLabel: doc.typeLabel,
            documentDate: doc.date,
            format,
            snapshot: sanitizeDocumentHTML(doc.html),
            generatedAt: new Date().toISOString()
        });
        A.writeJSON(HISTORY_KEY, history.slice(0, 500));
        renderHistory();
    }

    function safeFile(value) {
        return String(value || "documento").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_");
    }

    function downloadWord(doc) {
        const blob = new Blob(["\ufeff", documentPage(doc.html)], { type: "application/msword;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${safeFile(doc.typeLabel)}_${safeFile(doc.person.fullName)}_${doc.date}.doc`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        saveHistory(doc, "Word");
    }

    function printDocument(doc) {
        const popup = window.open("", "_blank", "noopener,noreferrer");
        if (!popup) return A.notify("El navegador bloqueó la ventana de impresión.", "error");
        popup.document.write(documentPage(doc.html));
        popup.document.close();
        popup.addEventListener("load", () => { popup.focus(); popup.print(); });
        saveHistory(doc, "Impresión/PDF");
    }

    function renderEmployees() {
        const employees = people().sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
        const selected = q("#hrContractEmployee").value;
        q("#hrContractEmployee").innerHTML = `<option value="">Seleccionar funcionario</option>${employees.map(item => `<option value="${esc(item.id)}">${esc(item.fullName)} · CI ${esc(item.ci)}</option>`).join("")}`;
        if (employees.some(item => item.id === selected)) q("#hrContractEmployee").value = selected;
    }

    function renderHistory() {
        const employeeId = q("#hrContractEmployee").value;
        const records = C.visible(A.readArray(HISTORY_KEY)).filter(item => !employeeId || String(item.employeeId) === employeeId);
        q("#hrContractHistory").innerHTML = records.length ? `<table class="hr-simple-table"><thead><tr><th>Documento</th><th>Fecha</th><th>Generado</th><th>Formato</th><th></th></tr></thead><tbody>${records.map(item => `<tr><td>${esc(item.typeLabel)}</td><td>${esc(item.documentDate)}</td><td>${esc(new Date(item.generatedAt).toLocaleString("es-PY"))}</td><td>${esc(item.format)}</td><td><button data-history-preview="${esc(item.id)}" type="button">Ver copia</button></td></tr>`).join("")}</tbody></table>` : '<div class="empty-state">Todavía no hay documentos generados.</div>';
    }

    q("#hrPreviewContract").addEventListener("click", () => buildDocument());
    q("#hrContractForm").addEventListener("submit", event => {
        event.preventDefault();
        const doc = documentForOutput();
        if (doc) downloadWord(doc);
    });
    q("#hrPrintContract").addEventListener("click", () => {
        const doc = documentForOutput();
        if (doc) printDocument(doc);
    });
    q("#hrContractEmployee").addEventListener("change", () => { lastDocument = null; renderHistory(); q("#hrContractPreview").innerHTML = ""; });
    q("#hrContractHistory").addEventListener("click", event => {
        const button = event.target.closest("[data-history-preview]");
        if (!button) return;
        const item = A.readArray(HISTORY_KEY).find(entry => String(entry.id) === button.dataset.historyPreview);
        if (item) q("#hrContractPreview").innerHTML = sanitizeDocumentHTML(item.snapshot);
    });
    window.addEventListener("atlas:hr-data-changed", renderEmployees);

    q("#hrContractDate").value = A.localDate();
    renderEmployees();
    renderHistory();
    window.AtlasHRContracts = { MODELS, validate, buildDocument };
})();
