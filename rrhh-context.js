(function () {
    const A = window.Atlas;
    const META_KEY = "atlasHRWorkspaces";
    const ACTIVE_KEY = "atlasHRActiveContext";
    const HR_DATA_KEYS = new Set([
        "atlasHRPeople", "atlasHRAbsences", "atlasHRClients", "atlasHRBranches",
        "atlasHRSchedules", "atlasHRAttendance", "atlasHRCompliance",
        "atlasHRPayrollSettings", "atlasHRHolidays"
    ]);
    const DEFAULT_COMPANY = {
        id: "asupport",
        name: "A Support",
        clients: [
            { id: "arcor", name: "Arcor", capacity: 60 },
            { id: "bdp", name: "BDP", detail: "Bebidas del Paraguay", capacity: 5 },
            { id: "servieri", name: "Servieri", capacity: 1 },
            { id: "geomax", name: "Geomax", capacity: 2 },
            { id: "polo-este", name: "Polo Este", capacity: 1 }
        ]
    };

    const rawRead = A.readJSON.bind(A);
    const rawArray = A.readArray.bind(A);
    const rawWrite = A.writeJSON.bind(A);
    let companies = rawArray(META_KEY);
    if (!companies.length) {
        companies = [DEFAULT_COMPANY];
        rawWrite(META_KEY, companies);
    } else {
        const asupport = companies.find(item => item.id === "asupport");
        if (asupport) {
            DEFAULT_COMPANY.clients.forEach(client => {
                if (!asupport.clients?.some(item => item.id === client.id)) {
                    asupport.clients = [...(asupport.clients || []), client];
                }
            });
            rawWrite(META_KEY, companies);
        }
    }

    let active = rawRead(ACTIVE_KEY, { companyId: "asupport", clientId: "arcor" });
    function currentCompany() { return companies.find(item => item.id === active.companyId) || companies[0]; }
    function currentClient() { return currentCompany()?.clients?.find(item => item.id === active.clientId) || currentCompany()?.clients?.[0]; }
    if (!currentClient()) {
        active = { companyId: currentCompany().id, clientId: currentCompany().clients?.[0]?.id || "general" };
        rawWrite(ACTIVE_KEY, active);
    }
    function scopedKey(key) {
        if (!HR_DATA_KEYS.has(key)) return key;
        return `${key}__${active.companyId}__${active.clientId}`;
    }

    if (active.companyId === "asupport" && active.clientId === "arcor") {
        HR_DATA_KEYS.forEach(key => {
            const destination = scopedKey(key);
            const legacy = rawRead(key, null);
            if (rawRead(destination, null) === null && legacy !== null) rawWrite(destination, legacy);
        });
    }

    A.readJSON = (key, fallback) => rawRead(scopedKey(key), fallback);
    A.readArray = key => {
        const value = rawRead(scopedKey(key), []);
        return Array.isArray(value) ? value : [];
    };
    A.writeJSON = (key, value) => rawWrite(scopedKey(key), value);
    window.AtlasHRContext = {
        get active() { return { ...active }; },
        get company() { return currentCompany(); },
        get client() { return currentClient(); },
        get companies() { return companies.map(item => ({ ...item, clients: [...(item.clients || [])] })); },
        scopedKey,
        select(companyId, clientId) {
            active = { companyId, clientId };
            rawWrite(ACTIVE_KEY, active);
            location.reload();
        }
    };

    function slug(value) {
        return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `empresa-${Date.now()}`;
    }
    function esc(value) { return A.escapeHTML(value); }
    function renderDialog() {
        const target = document.querySelector("#hrCompanyList");
        if (!target) return;
        target.innerHTML = companies.map(company => `
            <article class="hr-company-card">
                <div><small>EMPRESA ADMINISTRADA</small><strong>${esc(company.name)}</strong><span>${company.clients?.length || 0} cliente(s)</span></div>
                <div class="hr-client-grid">${(company.clients || []).map(client => `
                    <button type="button" data-company="${esc(company.id)}" data-client="${esc(client.id)}" class="${company.id === active.companyId && client.id === active.clientId ? "active" : ""}">
                        <strong>${esc(client.name)}</strong>
                        <span>${client.detail ? `${esc(client.detail)} · ` : ""}hasta ${Number(client.capacity || 0) || "—"} funcionarios</span>
                    </button>`).join("") || `<button type="button" data-add-client="${esc(company.id)}"><strong>＋ Agregar cliente</strong><span>Crear un espacio vacío</span></button>`}</div>
                <button class="hr-inline-add" type="button" data-add-client="${esc(company.id)}">＋ Agregar cliente a ${esc(company.name)}</button>
            </article>`).join("");
    }
    function updateHeading() {
        const company = currentCompany(), client = currentClient();
        document.querySelector("#hrContextTitle").textContent = `${company.name} · ${client?.name || "General"}`;
        document.querySelector("#hrContextCaption").textContent = client?.capacity
            ? `Capacidad de referencia: hasta ${client.capacity} funcionarios`
            : "Espacio independiente listo para cargar";
    }
    function openDialog() {
        renderDialog();
        document.querySelector("#hrContextDialog")?.showModal();
    }

    document.querySelector("#hrChangeClient")?.addEventListener("click", openDialog);
    document.querySelector("#hrManageCompanies")?.addEventListener("click", openDialog);
    document.querySelector("#hrCompanyList")?.addEventListener("click", event => {
        const choice = event.target.closest("[data-company][data-client]");
        if (choice) return window.AtlasHRContext.select(choice.dataset.company, choice.dataset.client);
        const add = event.target.closest("[data-add-client]");
        if (!add) return;
        const name = prompt("Nombre del nuevo cliente:");
        if (!name?.trim()) return;
        const company = companies.find(item => item.id === add.dataset.addClient);
        const client = { id: `${slug(name)}-${Date.now().toString(36)}`, name: name.trim(), capacity: 0 };
        company.clients = [...(company.clients || []), client];
        rawWrite(META_KEY, companies);
        renderDialog();
    });
    document.querySelector("#hrAddCompany")?.addEventListener("click", () => {
        const input = document.querySelector("#hrNewCompanyName");
        const name = input.value.trim();
        if (!name) return A.notify("Escribí el nombre de la empresa.", "error");
        const id = `${slug(name)}-${Date.now().toString(36)}`;
        companies.push({ id, name, clients: [{ id: "general", name: "General", capacity: 0 }] });
        rawWrite(META_KEY, companies);
        input.value = "";
        renderDialog();
        A.notify("Empresa administrada creada. Su información empieza en blanco.", "success");
    });

    updateHeading();
    window.addEventListener("atlas:app-ready", async () => {
        for (const source of ["rrhh-super.js", "rrhh-import.js"]) {
            await new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = source;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
    }, { once: true });
})();
