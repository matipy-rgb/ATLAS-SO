(async function () {
    const response = await fetch("../finance.html");
    const source = await response.text();
    const parsed = new DOMParser().parseFromString(source, "text/html");
    const body = document.importNode(parsed.body, true);
    document.body.replaceWith(body);
    document.body.classList.add("auth-ready");

    const legacy = {
        atlasTransactions: [
            { id: "legacy-income", description: "Ingreso anterior", amount: 1200000, type: "income", createdAt: "2026-08-05T12:00:00" },
            { id: "legacy-expense", description: "Compra anterior", amount: 275000, type: "expense", createdAt: "2026-08-08T12:00:00" }
        ],
        atlasObligations: [
            { id: "legacy-obligation", name: "Servicio anterior", amount: 180000, dueDate: "2026-08-25", frequency: "once", payments: [] }
        ]
    };

    window.AtlasStore = {
        workspaceId: "00000000-0000-4000-a000-000000000010",
        userId: "00000000-0000-4000-a000-000000000020",
        workspaceRole: "owner",
        workspaceName: "Demostración local"
    };
    window.AtlasAuth = { client: null, user: { id: window.AtlasStore.userId } };
    window.Atlas = {
        readArray(key) { return structuredClone(legacy[key] || []); },
        notify(message, type = "success") {
            let stack = document.querySelector(".toast-stack");
            if (!stack) {
                stack = document.createElement("div");
                stack.className = "toast-stack";
                stack.setAttribute("aria-live", "polite");
                document.body.appendChild(stack);
            }
            const toast = document.createElement("div");
            toast.className = `toast ${type}`;
            toast.textContent = message;
            stack.appendChild(toast);
            setTimeout(() => toast.remove(), 2400);
        }
    };

    const load = sourcePath => new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = sourcePath;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
    for (const script of [
        "../finance-core.js",
        "../finance-domain.js",
        "../finance-storage.js",
        "../finance-repository.js",
        "../finance-migration.js",
        "../finance.js"
    ]) await load(script);
})();
