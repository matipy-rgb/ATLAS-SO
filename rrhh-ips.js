(function () {
    "use strict";

    const A = window.Atlas;
    const PATRONAL = "0005-82-01080";
    const input = document.querySelector("#ipsScreenshot");
    const dropZone = document.querySelector(".ips-drop-zone");
    const progress = document.querySelector("#ipsProgress");
    const progressBar = document.querySelector("#ipsProgressBar");
    const progressText = document.querySelector("#ipsProgressText");
    const result = document.querySelector("#ipsResult");
    const summary = document.querySelector("#ipsResultSummary");
    const body = document.querySelector("#ipsReviewRows");
    const download = document.querySelector("#ipsDownload");
    const clear = document.querySelector("#ipsClear");
    let records = [];
    let worker = null;
    if (!input || !dropZone) return;

    const normalizeText = value => String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
    const digitsOnly = value => String(value || "").replace(/\D/g, "");
    const normalizeDate = value => {
        const raw = String(value || "").trim().replace(/[|Il]/g, "1");
        const separated = raw.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
        let parts = separated ? separated.slice(1) : null;
        if (!parts) {
            const digits = digitsOnly(raw);
            if (digits.length === 8) parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)];
        }
        if (!parts) return raw;
        const [day, month, year] = parts.map(Number);
        if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) return raw;
        return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
    };
    const validDate = value => /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/20\d{2}$/.test(value);
    const rowValid = item => /^\d{5,12}$/.test(item.ci) && item.names && item.surnames
        && validDate(item.start) && validDate(item.end) && validDate(item.documentDate) && /^\d{5,12}$/.test(item.id);

    function parseTSV(tsv, width, height) {
        const columns = [
            [0.067, 0.128, "id"], [0.128, 0.188, "ci"], [0.188, 0.327, "names"],
            [0.327, 0.500, "surnames"], [0.500, 0.568, "start"], [0.568, 0.642, "end"],
            [0.642, 0.825, "reason"], [0.825, 0.922, "type"], [0.922, 1.001, "documentDate"]
        ];
        const lineGroups = new Map();
        String(tsv || "").split(/\r?\n/).slice(1).forEach(line => {
            const cells = line.split("\t");
            if (cells.length < 12 || cells[0] !== "5") return;
            const text = cells.slice(11).join(" ").trim();
            if (!text) return;
            const key = cells.slice(1, 5).join(":");
            if (!lineGroups.has(key)) lineGroups.set(key, []);
            lineGroups.get(key).push({ text, left: Number(cells[6]), top: Number(cells[7]), width: Number(cells[8]), height: Number(cells[9]) });
        });
        const rows = [];
        lineGroups.forEach(words => {
            const averageY = words.reduce((sum, word) => sum + word.top + word.height / 2, 0) / words.length;
            if (averageY < height * 0.045) return;
            const parts = {};
            words.forEach(word => {
                const x = (word.left + word.width / 2) / width;
                const column = columns.find(([from, to]) => x >= from && x < to);
                if (!column) return;
                const key = column[2];
                parts[key] = `${parts[key] || ""} ${word.text}`.trim();
            });
            if (parts.id || parts.ci || parts.names) rows.push(parts);
        });
        return rows.map(item => ({
            id: digitsOnly(item.id),
            ci: digitsOnly(item.ci),
            names: normalizeText(item.names),
            surnames: normalizeText(item.surnames),
            start: normalizeDate(item.start),
            end: normalizeDate(item.end),
            documentDate: normalizeDate(item.documentDate),
            reason: normalizeText(item.reason),
            type: normalizeText(item.type)
        }));
    }

    function eligible(item) {
        const classification = `${item.type} ${item.reason}`;
        return !/REPOSO|MATERNIDAD|SANCION|SANCIÓN|LICENCIA/.test(classification) && /PERMISO/.test(classification);
    }

    function dedupe(items) {
        const seen = new Set();
        return items.filter(item => {
            const key = [item.ci, item.start, item.end, item.documentDate, item.id].join("|");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function renderReview(allRows) {
        const included = dedupe(allRows.filter(eligible));
        const excluded = allRows.length - included.length;
        records = included;
        result.hidden = false;
        if (!included.length) {
            summary.className = "ips-result-summary warning";
            summary.innerHTML = `<strong>0 permisos listos.</strong> Se detectaron ${allRows.length} registro(s); ${excluded} no son permisos.`;
            body.innerHTML = '<tr><td colspan="8"><div class="empty-state">La captura no contiene movimientos PERMISO.</div></td></tr>';
            download.disabled = true;
            return;
        }
        summary.className = "ips-result-summary success";
        summary.innerHTML = `<strong>${included.length} permiso(s) detectado(s).</strong> ${excluded} registro(s) excluido(s). Revisá las celdas marcadas.`;
        body.innerHTML = included.map((item, index) => {
            const valid = rowValid(item);
            return `<tr data-index="${index}" class="${valid ? "" : "ips-row-invalid"}">
                ${["ci", "names", "surnames", "start", "end", "documentDate", "id"].map(key => `<td><input data-field="${key}" value="${A.escapeHTML(item[key])}"></td>`).join("")}
                <td><span class="ips-state ${valid ? "ok" : "review"}">${valid ? "Listo" : "Revisar"}</span></td></tr>`;
        }).join("");
        download.disabled = included.some(item => !rowValid(item));
    }

    function updateFromTable(event) {
        const field = event.target.dataset.field;
        if (!field) return;
        const row = event.target.closest("tr[data-index]");
        const item = records[Number(row.dataset.index)];
        let value = event.target.value.trim();
        if (field === "ci" || field === "id") value = digitsOnly(value);
        if (["start", "end", "documentDate"].includes(field)) value = normalizeDate(value);
        if (field === "names" || field === "surnames") value = normalizeText(value);
        item[field] = value;
        event.target.value = value;
        const valid = rowValid(item);
        row.classList.toggle("ips-row-invalid", !valid);
        const state = row.querySelector(".ips-state");
        state.className = `ips-state ${valid ? "ok" : "review"}`;
        state.textContent = valid ? "Listo" : "Revisar";
        download.disabled = !records.length || records.some(record => !rowValid(record));
    }

    async function dimensions(file) {
        const bitmap = await createImageBitmap(file);
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return size;
    }

    async function readScreenshot(file) {
        if (!file || !file.type.startsWith("image/")) return A.notify("Subí una captura en formato de imagen.", "error");
        progress.hidden = false;
        result.hidden = true;
        progressBar.style.width = "2%";
        progressText.textContent = "Preparando el lector…";
        try {
            if (!window.Tesseract) throw new Error("El lector de imágenes no se cargó.");
            if (!worker) {
                worker = await window.Tesseract.createWorker("spa", 1, {
                    workerPath: "vendor/tesseract-worker.min.js",
                    corePath: "vendor/tesseract-core",
                    langPath: "vendor/tessdata",
                    logger(message) {
                        const percent = Math.max(2, Math.round((message.progress || 0) * 100));
                        progressBar.style.width = `${percent}%`;
                        progressText.textContent = message.status === "recognizing text" ? `Leyendo la tabla… ${percent}%` : "Preparando reconocimiento…";
                    }
                });
            }
            const size = await dimensions(file);
            const response = await worker.recognize(file, {}, { tsv: true });
            renderReview(parseTSV(response.data.tsv, size.width, size.height));
        } catch (error) {
            console.error("IPS OCR", error);
            result.hidden = false;
            summary.className = "ips-result-summary warning";
            summary.textContent = "No se pudo leer la captura. Confirmá que sea una imagen completa del REOP.";
            body.innerHTML = "";
            download.disabled = true;
        } finally {
            progressBar.style.width = "100%";
            window.setTimeout(() => { progress.hidden = true; }, 600);
            input.value = "";
        }
    }

    function downloadCSV() {
        if (!records.length || records.some(item => !rowValid(item))) return A.notify("Revisá todos los campos antes de descargar.", "error");
        const lines = records.map(item => [PATRONAL, item.ci, item.names, item.surnames, "11", item.start, item.end, item.documentDate, item.id, "PERMISO"].join(";"));
        const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `IPS_PERMISOS_${A.localDate().split("-").reverse().join("-")}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
        A.notify(`CSV generado con ${records.length} registro(s).`);
    }

    input.addEventListener("change", event => readScreenshot(event.target.files?.[0]));
    ["dragenter", "dragover"].forEach(name => dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add("dragging"); }));
    ["dragleave", "drop"].forEach(name => dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove("dragging"); }));
    dropZone.addEventListener("drop", event => readScreenshot(event.dataTransfer.files?.[0]));
    body.addEventListener("change", updateFromTable);
    download.addEventListener("click", downloadCSV);
    clear.addEventListener("click", () => { records = []; result.hidden = true; body.innerHTML = ""; download.disabled = true; });
})();
