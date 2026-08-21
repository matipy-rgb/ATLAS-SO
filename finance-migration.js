(function (root) {
    const Core = root.AtlasFinanceCore;
    if (!Core) throw new Error("El motor financiero no está disponible.");

    class FinanceMigration {
        constructor(repository) {
            this.repository = repository;
            this.preview = null;
            this.source = null;
        }

        readSource() {
            const transactions = root.Atlas?.readArray?.("atlasTransactions") || [];
            const obligations = root.Atlas?.readArray?.("atlasObligations") || [];
            this.source = {
                transactions: structuredClone(transactions),
                obligations: structuredClone(obligations)
            };
            this.preview = Core.previewLegacy(transactions, obligations);
            return { source: this.source, preview: this.preview };
        }

        async checksum() {
            if (!this.source) this.readSource();
            const canonical = Core.stableStringify(this.source);
            if (root.crypto?.subtle) {
                const bytes = new TextEncoder().encode(canonical);
                const digest = new Uint8Array(await root.crypto.subtle.digest("SHA-256", bytes));
                return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
            }
            let hash = 2166136261;
            for (let index = 0; index < canonical.length; index += 1) {
                hash ^= canonical.charCodeAt(index);
                hash = Math.imul(hash, 16777619);
            }
            return `fallback-${(hash >>> 0).toString(16).padStart(8, "0")}-${canonical.length}`;
        }

        async import({ contextId, accountId, categoryId = null }) {
            if (!contextId || !accountId) throw new Error("Elegí el contexto y la cuenta de destino.");
            if (!this.source) this.readSource();
            if (!this.preview?.canImport) throw new Error("No hay registros anteriores para migrar.");
            if (!this.repository.client || !this.repository.remoteReady) {
                throw new Error("La base financiera debe estar instalada en el servidor antes de importar.");
            }

            const checksum = await this.checksum();
            this.repository.syncStatus("syncing", "Migrando datos anteriores…");
            const { data, error } = await this.repository.client.rpc("finance_import_v09", {
                target_workspace: this.repository.workspaceId,
                target_context: contextId,
                target_account: accountId,
                target_category: categoryId || null,
                source_transactions: this.source.transactions,
                source_obligations: this.source.obligations,
                source_checksum: checksum
            });
            if (error) {
                this.repository.syncStatus("offline", "La migración no se completó");
                throw error;
            }

            const result = data || {};
            await this.repository.storage.put("migrationRuns", {
                id: result.runId || Core.createId(),
                workspace_id: this.repository.workspaceId,
                context_id: contextId,
                account_id: accountId,
                checksum,
                state: result.state || "completed",
                repeated: Boolean(result.repeated),
                counts: result.counts || {},
                totals: result.totals || {},
                errors: Number(result.errors || 0),
                sourcePreserved: result.sourcePreserved !== false,
                completedAt: new Date().toISOString()
            });

            if (result.runId) await this.loadErrors(result.runId);
            await this.repository.pullMonth(Core.currentMonth());
            this.repository.syncStatus("synced", result.repeated
                ? "Migración verificada · sin duplicados"
                : "Migración completada");
            this.repository.emit("migration", { result, preview: this.preview });
            return result;
        }

        async loadErrors(runId) {
            const { data, error } = await this.repository.client
                .from("finance_migration_errors")
                .select("*")
                .eq("workspace_id", this.repository.workspaceId)
                .eq("migration_run_id", runId)
                .order("id", { ascending: true })
                .limit(10000);
            if (error) throw error;
            await this.repository.storage.bulkPut("migrationErrors", data || []);
            return data || [];
        }

        async errorReport(runId) {
            const errors = await this.repository.storage.list("migrationErrors", {
                workspace_id: this.repository.workspaceId,
                migration_run_id: runId
            });
            const headers = ["tipo", "identificador", "campo", "código", "mensaje"];
            const escape = value => {
                let text = String(value ?? "");
                if (/^[=+\-@]/.test(text)) text = `'${text}`;
                return `"${text.replaceAll('"', '""')}"`;
            };
            return [headers, ...errors.map(error => [
                error.source_type,
                error.source_id,
                error.field_name,
                error.error_code,
                error.message
            ])].map(row => row.map(escape).join(",")).join("\r\n");
        }

        downloadErrorReport(runId) {
            return this.errorReport(runId).then(csv => {
                const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `atlas-finanzas-migracion-errores-${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
            });
        }
    }

    root.AtlasFinanceMigration = Object.freeze({ FinanceMigration });
})(typeof window !== "undefined" ? window : globalThis);
