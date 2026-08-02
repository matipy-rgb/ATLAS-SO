(function () {
    "use strict";

    const A = window.Atlas;
    const META_KEY = "atlasHRWorkspaces";
    const ACTIVE_KEY = "atlasHRActiveContext";
    const MIGRATION_KEY = "atlasHRMigrationV07";
    const GENERAL_ID = "all";
    const COMPANY_KEYS = new Set([
        "atlasHRPeople",
        "atlasHRAbsences",
        "atlasHRBranches",
        "atlasHRSchedules",
        "atlasHRScheduleAssignments",
        "atlasHRAttendance",
        "atlasHRAttendanceImports",
        "atlasHRCompliance",
        "atlasHRPayrollSettings",
        "atlasHRHolidays",
        "atlasHRContractTemplates",
        "atlasHRContractHistory"
    ]);
    const originalReadJSON = A.readJSON.bind(A);
    const originalReadArray = A.readArray.bind(A);
    const originalWriteJSON = A.writeJSON.bind(A);
    const esc = A.escapeHTML;
    const MAX_LOGO_BYTES = 5 * 1024 * 1024;

    function safeLogo(value) {
        const logo = String(value || "");
        return logo.length <= 1_500_000 && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(logo)
            ? logo
            : "";
    }

    const initialCompany = {
    id: "empresa-inicial",
    name: "Mi empresa",
    legalName: "",
    rosterName: "Nómina general",
    logo: "",
    ruc: "",
    patronalNumber: "",
    representative: "",
    representativeCI: "",
    documentCity: "",
    address: "",
    active: true,
    clients: []
};

    function slug(value, fallback = "registro") {
        const clean = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        return `${clean || fallback}-${String(A.createId()).slice(-6)}`;
    }

    function normalizeClient(item) {
        return {
            id: String(item?.id || slug(item?.name, "cliente")),
            name: String(item?.name || "Cliente sin nombre").trim(),
            detail: String(item?.detail || "").trim(),
            logo: safeLogo(item?.logo),
            contractTemplateId: String(item?.contractTemplateId || ""),
            workplace: String(item?.workplace || ""),
            costCenter: String(item?.costCenter || item?.code || ""),
            active: item?.active !== false,
            createdAt: item?.createdAt || new Date().toISOString(),
            updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString()
        };
    }

    function normalizeCompany(item) {
        const legacyGeneral = (item?.clients || []).find(client => String(client.id) === "general");
        const hasPatronal = item && Object.prototype.hasOwnProperty.call(item, "patronalNumber");
        const hasDocumentCity = item && Object.prototype.hasOwnProperty.call(item, "documentCity");
        return {
            id: String(item?.id || slug(item?.name, "empresa")),
            name: String(item?.name || "Empresa sin nombre").trim(),
            legalName: String(item?.legalName || item?.name || "Empresa sin nombre").trim(),
            rosterName: String(item?.rosterName || legacyGeneral?.name || "Nómina general").trim(),
            logo: safeLogo(item?.logo),
            ruc: String(item?.ruc || ""),
            patronalNumber: String(hasPatronal ? item.patronalNumber || "" : (item?.id === "a-support" ? "0005-82-01080" : "")),
            representative: String(item?.representative || ""),
            representativeCI: String(item?.representativeCI || ""),
            documentCity: String(hasDocumentCity ? item.documentCity || "" : "Asunción"),
            address: String(item?.address || ""),
            active: item?.active !== false,
            clients: (Array.isArray(item?.clients) ? item.clients : [])
                .filter(client => String(client.id) !== "general")
                .map(normalizeClient),
            createdAt: item?.createdAt || new Date().toISOString(),
            updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString()
        };
    }

    let companies = originalReadArray(META_KEY).map(normalizeCompany);
    if (!companies.length) companies = [normalizeCompany(initialCompany)];

    function validActive(candidate) {
        const company = companies.find(item => item.id === candidate?.companyId) || companies[0];
        const requestedClient = String(candidate?.clientId || GENERAL_ID);
        const clientId = requestedClient === GENERAL_ID || company.clients.some(item => item.id === requestedClient)
            ? requestedClient
            : GENERAL_ID;
        return { companyId: company.id, clientId };
    }

    let active = validActive(originalReadJSON(ACTIVE_KEY, null));

    function saveMeta() {
        originalWriteJSON(META_KEY, companies);
        originalWriteJSON(ACTIVE_KEY, active);
    }

    function companyKey(key, companyId = active.companyId) {
        return `${key}__${companyId}`;
    }

    function scopedKey(key) {
        return COMPANY_KEYS.has(key) ? companyKey(key) : key;
    }

    function itemIdentity(key, item) {
        if (key === "atlasHRPeople" && item?.ci) return `ci:${String(item.ci).replace(/\D/g, "")}`;
        if (key === "atlasHRAttendance") {
            return `${item?.employeeId || item?.clockId || ""}:${item?.date || ""}`;
        }
        return String(item?.id || JSON.stringify(item));
    }

    function migrateLegacyData() {
        if (originalReadJSON(MIGRATION_KEY, false)) return;
        companies.forEach(company => {
            COMPANY_KEYS.forEach(key => {
                const merged = originalReadArray(companyKey(key, company.id));
                const positions = new Map(merged.map((item, index) => [itemIdentity(key, item), index]));
                if (company.id === companies[0].id) {
                    originalReadArray(key).forEach(legacyItem => {
                        const item = { ...legacyItem };
                        if (!item.clientId && key !== "atlasHRSchedules" && key !== "atlasHRHolidays") {
                            const legacyName = String(item.client || item.department || "").toLowerCase();
                            item.clientId = company.clients.find(client => client.name.toLowerCase() === legacyName)?.id
                                || (active.companyId === company.id && active.clientId !== GENERAL_ID ? active.clientId : "");
                        }
                        const identity = itemIdentity(key, item);
                        if (!positions.has(identity)) {
                            positions.set(identity, merged.length);
                            merged.push(item);
                        }
                    });
                }
                company.clients.forEach(client => {
                    const legacyKey = `${key}__${company.id}__${client.id}`;
                    originalReadArray(legacyKey).forEach(legacyItem => {
                        const item = { ...legacyItem };
                        if (!item.clientId && key !== "atlasHRSchedules" && key !== "atlasHRHolidays") item.clientId = client.id;
                        const identity = itemIdentity(key, item);
                        if (positions.has(identity)) {
                            const index = positions.get(identity);
                            merged[index] = { ...merged[index], ...item, id: merged[index].id || item.id };
                        } else {
                            positions.set(identity, merged.length);
                            merged.push(item);
                        }
                    });
                });
                if (merged.length) originalWriteJSON(companyKey(key, company.id), merged);
            });
        });
        originalWriteJSON(MIGRATION_KEY, {
            version: "0.7.0",
            at: new Date().toISOString(),
            note: "Los datos anteriores se conservaron; empresa y cliente ahora son entidades separadas."
        });
    }

    migrateLegacyData();
    saveMeta();

    A.readJSON = (key, fallback) => originalReadJSON(scopedKey(key), fallback);
    A.readArray = key => {
        const value = A.readJSON(key, []);
        return Array.isArray(value) ? value : [];
    };
    A.writeJSON = (key, value) => originalWriteJSON(scopedKey(key), value);

    function currentCompany() {
        return companies.find(item => item.id === active.companyId) || companies[0];
    }

    function currentClient() {
        return active.clientId === GENERAL_ID
            ? null
            : currentCompany().clients.find(item => item.id === active.clientId) || null;
    }

    function clientById(id, companyId = active.companyId) {
        return companies.find(item => item.id === companyId)?.clients.find(item => item.id === id) || null;
    }

    function visible(records, field = "clientId") {
        const items = Array.isArray(records) ? records : [];
        if (active.clientId === GENERAL_ID) return items;
        return items.filter(item => String(item?.[field] || "") === active.clientId);
    }

    function select(companyId, clientId = GENERAL_ID, reload = true) {
        active = validActive({ companyId, clientId });
        originalWriteJSON(ACTIVE_KEY, active);
        if (reload) location.reload();
    }

    function statusLabel(person) {
        if (person?.status === "inactive-month") return "Inactivo del mes";
        if (person?.status === "inactive" || person?.active === false) return "Inactivo";
        return "Activo";
    }

    window.AtlasHRContext = {
        GENERAL_ID,
        get active() { return { ...active }; },
        get company() { return currentCompany(); },
        get client() { return currentClient(); },
        get companies() { return companies; },
        get isGeneral() { return active.clientId === GENERAL_ID; },
        scopedKey,
        companyKey,
        rawRead: originalReadJSON,
        rawWrite: originalWriteJSON,
        clientById,
        visible,
        select,
        statusLabel
    };

    function logoMarkup(item, className = "") {
        if (item?.logo) return `<img class="${className}" src="${esc(item.logo)}" alt="">`;
        return `<span class="${className} hr-logo-placeholder">${esc(String(item?.name || "?").slice(0, 2).toUpperCase())}</span>`;
    }

    function renderContextBar() {
        const company = currentCompany();
        const client = currentClient();
        const mark = document.querySelector("#hrContextLogo");
        if (mark) {
            if (company.logo) {
                mark.src = company.logo;
                mark.hidden = false;
                document.querySelector("#hrContextMark")?.setAttribute("hidden", "");
            } else {
                mark.hidden = true;
                const placeholder = document.querySelector("#hrContextMark");
                if (placeholder) {
                    placeholder.hidden = false;
                    placeholder.textContent = company.name.slice(0, 2).toUpperCase();
                }
            }
        }
        const title = document.querySelector("#hrContextTitle");
        const caption = document.querySelector("#hrContextCaption");
        if (title) title.textContent = `${company.name} · ${client?.name || company.rosterName}`;
        if (caption) caption.textContent = client
            ? "Cliente seleccionado dentro de la empresa administrada"
            : `Vista consolidada · ${company.clients.length} cliente(s), sin duplicar funcionarios`;
        const patronal = document.querySelector("#ipsPatronal");
        if (patronal) patronal.textContent = `Patronal · ${company.patronalNumber || "Sin configurar"}`;
    }

    function openContext(mode = "company") {
        const dialog = document.querySelector("#hrContextDialog");
        if (!dialog) return;
        dialog.dataset.mode = mode;
        dialog.dataset.companyId = active.companyId;
        renderContextDialog();
        dialog.showModal();
    }

    function renderContextDialog() {
        const dialog = document.querySelector("#hrContextDialog");
        const companyTarget = document.querySelector("#hrCompanyList");
        const clientTarget = document.querySelector("#hrClientList");
        if (!dialog || !companyTarget || !clientTarget) return;
        const mode = dialog.dataset.mode || "company";
        const selectedCompany = companies.find(item => item.id === dialog.dataset.companyId) || currentCompany();
        companyTarget.hidden = mode === "client";
        document.querySelector("#hrContextCompanyStep")?.toggleAttribute("hidden", mode === "client");
        document.querySelector("#hrContextClientStep")?.toggleAttribute("hidden", mode !== "client");
        companyTarget.innerHTML = companies.filter(item => item.active !== false).map(company => `
            <article class="hr-identity-card ${company.id === selectedCompany.id ? "selected" : ""}">
                <button type="button" data-choose-company="${esc(company.id)}">
                    ${logoMarkup(company, "hr-identity-logo")}
                    <span><strong>${esc(company.name)}</strong><small>${company.clients.length} cliente(s) · ${esc(company.rosterName)}</small></span>
                </button>
                <button class="hr-identity-edit" type="button" data-edit-company="${esc(company.id)}" aria-label="Editar empresa">✎</button>
            </article>`).join("");
        clientTarget.innerHTML = `
            <article class="hr-identity-card ${active.clientId === GENERAL_ID && selectedCompany.id === active.companyId ? "selected" : ""}">
                <button type="button" data-choose-client="${GENERAL_ID}" data-company-id="${esc(selectedCompany.id)}">
                    ${logoMarkup(selectedCompany, "hr-identity-logo")}
                    <span><strong>${esc(selectedCompany.rosterName)}</strong><small>Toda la nómina de ${esc(selectedCompany.name)}</small></span>
                </button>
                <button class="hr-identity-edit" type="button" data-edit-roster="${esc(selectedCompany.id)}" aria-label="Editar nombre de la nómina">✎</button>
            </article>
            ${selectedCompany.clients.filter(item => item.active !== false).map(client => `
                <article class="hr-identity-card ${client.id === active.clientId && selectedCompany.id === active.companyId ? "selected" : ""}">
                    <button type="button" data-choose-client="${esc(client.id)}" data-company-id="${esc(selectedCompany.id)}">
                        ${logoMarkup(client, "hr-identity-logo")}
                        <span><strong>${esc(client.name)}</strong><small>${esc(client.detail || client.costCenter || "Cliente")}</small></span>
                    </button>
                    <button class="hr-identity-edit" type="button" data-edit-client="${esc(client.id)}" data-company-id="${esc(selectedCompany.id)}" aria-label="Editar cliente">✎</button>
                </article>`).join("")}`;
        const subtitle = document.querySelector("#hrContextSelectedCompany");
        if (subtitle) subtitle.textContent = selectedCompany.name;
    }

    function fileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            if (!file) return resolve("");
            if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > MAX_LOGO_BYTES) {
                reject(new Error("Formato o tamaño de logo no permitido."));
                return;
            }
            const image = new Image();
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
                image.onload = () => {
                    const canvas = document.createElement("canvas");
                    const size = 256;
                    const scale = Math.min(size / image.width, size / image.height, 1);
                    canvas.width = Math.max(1, Math.round(image.width * scale));
                    canvas.height = Math.max(1, Math.round(image.height * scale));
                    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL("image/png", 0.9));
                };
                image.onerror = reject;
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function openIdentity(type, id = "", companyId = active.companyId) {
        const dialog = document.querySelector("#hrIdentityDialog");
        if (!dialog) return;
        const company = companies.find(item => item.id === companyId) || currentCompany();
        const item = type === "company" ? companies.find(entry => entry.id === id)
            : type === "client" ? company.clients.find(entry => entry.id === id)
                : company;
        dialog.dataset.type = type;
        dialog.dataset.id = id;
        dialog.dataset.companyId = company.id;
        document.querySelector("#hrIdentityTitle").textContent = id ? `Editar ${type === "company" ? "empresa" : type === "client" ? "cliente" : "nómina general"}` : `Nueva ${type === "company" ? "empresa" : "cliente"}`;
        document.querySelector("#hrIdentityName").value = type === "roster" ? company.rosterName : item?.name || "";
        document.querySelector("#hrIdentityDetail").value = type === "client" ? item?.detail || "" : "";
        document.querySelector("#hrIdentityRuc").value = type === "company" ? item?.ruc || "" : "";
        document.querySelector("#hrIdentityPatronal").value = type === "company" ? item?.patronalNumber || "" : "";
        document.querySelector("#hrIdentityLegalName").value = type === "company" ? item?.legalName || item?.name || "" : "";
        document.querySelector("#hrIdentityRepresentative").value = type === "company" ? item?.representative || "" : "";
        document.querySelector("#hrIdentityRepresentativeCI").value = type === "company" ? item?.representativeCI || "" : "";
        document.querySelector("#hrIdentityDocumentCity").value = type === "company" ? item?.documentCity || "Asunción" : "";
        document.querySelector("#hrIdentityAddress").value = type === "company" ? item?.address || "" : "";
        document.querySelector("#hrIdentityWorkplace").value = type === "client" ? item?.workplace || "" : "";
        document.querySelector("#hrIdentityCostCenter").value = type === "client" ? item?.costCenter || "" : "";
        document.querySelector("#hrIdentityContract").value = type === "client" ? item?.contractTemplateId || "" : "";
        document.querySelectorAll("[data-identity-for]").forEach(field => {
            field.hidden = !field.dataset.identityFor.split(" ").includes(type);
        });
        const preview = document.querySelector("#hrIdentityLogoPreview");
        const logo = type === "roster" ? company.logo : item?.logo;
        preview.innerHTML = logo ? `<img src="${esc(logo)}" alt="">` : `<span>${esc(String(type === "roster" ? company.name : item?.name || "?").slice(0, 2).toUpperCase())}</span>`;
        delete preview.dataset.logo;
        document.querySelector("#hrIdentityLogo").value = "";
        dialog.showModal();
    }

    document.querySelector("#hrChangeCompany")?.addEventListener("click", () => openContext("company"));
    document.querySelector("#hrChangeClient")?.addEventListener("click", () => {
        const dialog = document.querySelector("#hrContextDialog");
        dialog.dataset.companyId = active.companyId;
        openContext("client");
    });
    document.querySelector("#hrManageCompanies")?.addEventListener("click", () => openContext("company"));

    document.querySelector("#hrContextDialog")?.addEventListener("click", event => {
        const companyChoice = event.target.closest("[data-choose-company]");
        const clientChoice = event.target.closest("[data-choose-client]");
        const editCompany = event.target.closest("[data-edit-company]");
        const editClient = event.target.closest("[data-edit-client]");
        const editRoster = event.target.closest("[data-edit-roster]");
        if (companyChoice) {
            const dialog = document.querySelector("#hrContextDialog");
            dialog.dataset.companyId = companyChoice.dataset.chooseCompany;
            dialog.dataset.mode = "client";
            renderContextDialog();
        } else if (clientChoice) {
            select(clientChoice.dataset.companyId, clientChoice.dataset.chooseClient);
        } else if (editCompany) {
            openIdentity("company", editCompany.dataset.editCompany, editCompany.dataset.editCompany);
        } else if (editClient) {
            openIdentity("client", editClient.dataset.editClient, editClient.dataset.companyId);
        } else if (editRoster) {
            openIdentity("roster", "", editRoster.dataset.editRoster);
        }
    });

    document.querySelector("#hrContextBack")?.addEventListener("click", () => {
        const dialog = document.querySelector("#hrContextDialog");
        dialog.dataset.mode = "company";
        renderContextDialog();
    });
    document.querySelector("#hrAddCompany")?.addEventListener("click", () => openIdentity("company"));
    document.querySelector("#hrAddClient")?.addEventListener("click", () => {
        const dialog = document.querySelector("#hrContextDialog");
        openIdentity("client", "", dialog.dataset.companyId || active.companyId);
    });

    document.querySelector("#hrIdentityLogo")?.addEventListener("change", async event => {
        try {
            const data = await fileAsDataURL(event.target.files?.[0]);
            if (data) document.querySelector("#hrIdentityLogoPreview").innerHTML = `<img src="${esc(data)}" alt="">`;
            document.querySelector("#hrIdentityLogoPreview").dataset.logo = data;
        } catch {
            event.target.value = "";
            A.notify("El logo debe ser PNG, JPG o WebP y pesar hasta 5 MB.", "error");
        }
    });

    document.querySelector("#hrIdentityForm")?.addEventListener("submit", event => {
        event.preventDefault();
        const dialog = document.querySelector("#hrIdentityDialog");
        const type = dialog.dataset.type;
        const company = companies.find(item => item.id === dialog.dataset.companyId) || currentCompany();
        const name = document.querySelector("#hrIdentityName").value.trim();
        if (!name) return A.notify("Ingresá un nombre.", "error");
        const logo = document.querySelector("#hrIdentityLogoPreview").dataset.logo;
        if (type === "company") {
            const existing = companies.find(item => item.id === dialog.dataset.id);
            if (existing) {
                Object.assign(existing, {
                    name,
                    legalName: document.querySelector("#hrIdentityLegalName").value.trim() || name,
                    ruc: document.querySelector("#hrIdentityRuc").value.trim(),
                    patronalNumber: document.querySelector("#hrIdentityPatronal").value.trim(),
                    representative: document.querySelector("#hrIdentityRepresentative").value.trim(),
                    representativeCI: document.querySelector("#hrIdentityRepresentativeCI").value.trim(),
                    documentCity: document.querySelector("#hrIdentityDocumentCity").value.trim(),
                    address: document.querySelector("#hrIdentityAddress").value.trim(),
                    logo: logo || existing.logo,
                    updatedAt: new Date().toISOString()
                });
            } else {
                const next = normalizeCompany({
                    id: slug(name, "empresa"),
                    name,
                    legalName: document.querySelector("#hrIdentityLegalName").value.trim() || name,
                    logo,
                    rosterName: "Nómina general",
                    ruc: document.querySelector("#hrIdentityRuc").value.trim(),
                    patronalNumber: document.querySelector("#hrIdentityPatronal").value.trim(),
                    representative: document.querySelector("#hrIdentityRepresentative").value.trim(),
                    representativeCI: document.querySelector("#hrIdentityRepresentativeCI").value.trim(),
                    documentCity: document.querySelector("#hrIdentityDocumentCity").value.trim(),
                    address: document.querySelector("#hrIdentityAddress").value.trim(),
                    clients: []
                });
                companies.push(next);
                active = { companyId: next.id, clientId: GENERAL_ID };
            }
        } else if (type === "client") {
            const existing = company.clients.find(item => item.id === dialog.dataset.id);
            const data = {
                name,
                detail: document.querySelector("#hrIdentityDetail").value.trim(),
                workplace: document.querySelector("#hrIdentityWorkplace").value.trim(),
                costCenter: document.querySelector("#hrIdentityCostCenter").value.trim(),
                contractTemplateId: document.querySelector("#hrIdentityContract").value,
                logo: logo || existing?.logo || "",
                updatedAt: new Date().toISOString()
            };
            if (existing) Object.assign(existing, data);
            else company.clients.push(normalizeClient({ id: slug(name, "cliente"), ...data }));
        } else {
            company.rosterName = name;
            company.updatedAt = new Date().toISOString();
        }
        saveMeta();
        dialog.close();
        renderContextBar();
        renderContextDialog();
        A.notify("Identidad actualizada.");
    });

    document.querySelector("#hrIdentityDialog [data-close]")?.addEventListener("click", () => document.querySelector("#hrIdentityDialog").close());
    document.querySelector("#hrIdentityCancel")?.addEventListener("click", () => document.querySelector("#hrIdentityDialog").close());

    renderContextBar();
})();
