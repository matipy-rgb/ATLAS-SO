(function () {
    "use strict";

    const dialog = document.querySelector("#resetWorkspaceDialog");
    const form = document.querySelector("#resetWorkspaceForm");
    const phrase = document.querySelector("#resetWorkspacePhrase");
    const acknowledge = document.querySelector("#resetWorkspaceAcknowledge");
    const confirmButton = document.querySelector("#confirmWorkspaceReset");
    const progress = document.querySelector("#resetWorkspaceProgress");
    const status = document.querySelector("#aboutResetStatus");
    const setupHelp = document.querySelector("#resetSetupHelp");

    document.querySelector("#aboutVersion").textContent = `Versión actual · ${window.ATLAS_CONFIG?.version || "0.11.0"}`;
    document.querySelector("#aboutWorkspace").textContent = window.AtlasStore?.workspaceName || "Mi espacio";
    document.querySelector("#aboutUser").textContent = window.AtlasAuth?.user?.email || "Cuenta activa";

    const previousStatus = sessionStorage.getItem("atlas:last-reset-status");
    if (previousStatus) {
        sessionStorage.removeItem("atlas:last-reset-status");
        status.hidden = false;
        status.textContent = previousStatus;
    }

    function updateConfirmation() {
        confirmButton.disabled = phrase.value.trim().toUpperCase() !== "BORRAR ATLAS" || !acknowledge.checked;
    }

    document.querySelector("#openResetDialog")?.addEventListener("click", () => {
        form.reset();
        progress.textContent = "";
        if (setupHelp) setupHelp.hidden = true;
        updateConfirmation();
        dialog.showModal();
    });
    document.querySelectorAll("[data-close-reset]").forEach(button => button.addEventListener("click", () => dialog.close()));
    phrase.addEventListener("input", updateConfirmation);
    acknowledge.addEventListener("change", updateConfirmation);
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (confirmButton.disabled) return;
        confirmButton.disabled = true;
        phrase.disabled = true;
        acknowledge.disabled = true;
        progress.textContent = "Borrando los datos del espacio actual…";
        try {
            const result = await window.AtlasStore.resetWorkspaceData();
            const message = `ATLAS quedó limpio. Se borraron ${result.deletedRows || 0} registros y ya podés cargar información nueva.`;
            sessionStorage.setItem("atlas:last-reset-status", message);
            window.location.replace("about.html?clean=1");
        } catch (error) {
            progress.textContent = String(error.message || "No se pudo completar el borrado.");
            if (setupHelp) setupHelp.hidden = !/no está instalada/i.test(progress.textContent);
            phrase.disabled = false;
            acknowledge.disabled = false;
            updateConfirmation();
        }
    });
})();
