(function (root) {
    const DATABASE_NAME = "atlas-so-finance-v010";
    const DATABASE_VERSION = 3;
    const STORES = Object.freeze({
        meta: { keyPath: "key" },
        contexts: { keyPath: "id", indexes: [["workspace_id", "workspace_id"]] },
        accounts: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"]] },
        categories: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"]] },
        paymentMethods: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"]] },
        transactions: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"], ["occurred_at", "occurred_at"]] },
        obligations: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"]] },
        payments: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"]] },
        attachments: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"]] },
        attachmentBlobs: { keyPath: "id", indexes: [["workspace_id", "workspace_id"]] },
        recurrences: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"]] },
        budgets: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"], ["month", "month"]] },
        goals: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"]] },
        goalEntries: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["goal_id", "goal_id"]] },
        assets: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"]] },
        valuations: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["asset_id", "asset_id"]] },
        monthlyCloses: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"], ["month", "month"]] },
        savedFilters: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"]] },
        migrationRuns: { keyPath: "id", indexes: [["workspace_id", "workspace_id"]] },
        migrationErrors: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["migration_run_id", "migration_run_id"]] },
        auditLog: { keyPath: "id", indexes: [["workspace_id", "workspace_id"], ["context_id", "context_id"], ["occurred_at", "occurred_at"]] },
        outbox: { keyPath: "operationId", indexes: [["workspace_id", "workspace_id"], ["state", "state"], ["createdAt", "createdAt"]] },
        conflicts: { keyPath: "operationId", indexes: [["workspace_id", "workspace_id"]] }
    });

    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("IndexedDB no respondió."));
        });
    }

    class FinanceStorage {
        constructor({ indexedDB = root.indexedDB } = {}) {
            this.indexedDB = indexedDB;
            this.database = null;
            this.memory = new Map(Object.keys(STORES).map(name => [name, new Map()]));
            this.mode = indexedDB ? "indexeddb" : "memory";
        }

        async open() {
            if (this.database || this.mode === "memory") return this;
            const request = this.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
            request.onupgradeneeded = () => {
                const database = request.result;
                Object.entries(STORES).forEach(([name, definition]) => {
                    const store = database.objectStoreNames.contains(name)
                        ? request.transaction.objectStore(name)
                        : database.createObjectStore(name, { keyPath: definition.keyPath });
                    (definition.indexes || []).forEach(([indexName, keyPath]) => {
                        if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, { unique: false });
                    });
                });
            };
            try {
                this.database = await requestResult(request);
                this.database.onversionchange = () => {
                    this.database.close();
                    this.database = null;
                };
            } catch (error) {
                console.warn("Finanzas usará memoria temporal porque IndexedDB no está disponible:", error.message);
                this.mode = "memory";
            }
            return this;
        }

        assertStore(name) {
            if (!STORES[name]) throw new Error(`Almacén financiero desconocido: ${name}`);
        }

        keyFor(name, value) {
            return value?.[STORES[name].keyPath];
        }

        async put(name, value) {
            this.assertStore(name);
            await this.open();
            const key = this.keyFor(name, value);
            if (key === undefined || key === null || key === "") throw new Error(`Falta la clave de ${name}.`);
            const safe = structuredClone(value);
            if (this.mode === "memory") {
                this.memory.get(name).set(key, safe);
                return safe;
            }
            const transaction = this.database.transaction(name, "readwrite");
            const result = await requestResult(transaction.objectStore(name).put(safe));
            await this.transactionDone(transaction);
            return result;
        }

        async bulkPut(name, values) {
            this.assertStore(name);
            await this.open();
            const records = Array.isArray(values) ? values : [];
            if (this.mode === "memory") {
                records.forEach(value => this.memory.get(name).set(this.keyFor(name, value), structuredClone(value)));
                return records.length;
            }
            const transaction = this.database.transaction(name, "readwrite");
            const store = transaction.objectStore(name);
            records.forEach(value => store.put(structuredClone(value)));
            await this.transactionDone(transaction);
            return records.length;
        }

        async atomic(operations) {
            await this.open();
            const changes = Array.isArray(operations) ? operations : [];
            changes.forEach(change => this.assertStore(change.store));
            if (!changes.length) return 0;
            if (this.mode === "memory") {
                const before = new Map();
                try {
                    changes.forEach(change => {
                        const store = this.memory.get(change.store);
                        if (!before.has(change.store)) before.set(change.store, new Map(store));
                        if (change.action === "delete") store.delete(change.key);
                        else store.set(this.keyFor(change.store, change.value), structuredClone(change.value));
                    });
                } catch (error) {
                    before.forEach((records, name) => this.memory.set(name, records));
                    throw error;
                }
                return changes.length;
            }
            const names = [...new Set(changes.map(change => change.store))];
            const transaction = this.database.transaction(names, "readwrite");
            changes.forEach(change => {
                const store = transaction.objectStore(change.store);
                if (change.action === "delete") store.delete(change.key);
                else store.put(structuredClone(change.value));
            });
            await this.transactionDone(transaction);
            return changes.length;
        }

        async get(name, key) {
            this.assertStore(name);
            await this.open();
            if (this.mode === "memory") return structuredClone(this.memory.get(name).get(key) || null);
            const transaction = this.database.transaction(name, "readonly");
            const value = await requestResult(transaction.objectStore(name).get(key));
            return value || null;
        }

        async getAll(name) {
            this.assertStore(name);
            await this.open();
            if (this.mode === "memory") return [...this.memory.get(name).values()].map(value => structuredClone(value));
            const transaction = this.database.transaction(name, "readonly");
            return requestResult(transaction.objectStore(name).getAll());
        }

        async list(name, filters = {}) {
            const values = await this.getAll(name);
            return values.filter(value => Object.entries(filters).every(([key, expected]) => {
                if (expected === undefined || expected === null || expected === "") return true;
                if (Array.isArray(expected)) return expected.includes(value[key]);
                return value[key] === expected;
            }));
        }

        async delete(name, key) {
            this.assertStore(name);
            await this.open();
            if (this.mode === "memory") return this.memory.get(name).delete(key);
            const transaction = this.database.transaction(name, "readwrite");
            transaction.objectStore(name).delete(key);
            await this.transactionDone(transaction);
            return true;
        }

        async clearWorkspace(name, workspaceId) {
            this.assertStore(name);
            await this.open();
            if (this.mode === "memory") {
                let removed = 0;
                for (const [key, record] of this.memory.get(name)) {
                    if (record.workspace_id !== workspaceId) continue;
                    this.memory.get(name).delete(key);
                    removed += 1;
                }
                return removed;
            }
            const transaction = this.database.transaction(name, "readwrite");
            const store = transaction.objectStore(name);
            const request = store.indexNames.contains("workspace_id") && root.IDBKeyRange
                ? store.index("workspace_id").openCursor(root.IDBKeyRange.only(workspaceId))
                : store.openCursor();
            let removed = 0;
            await new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) return resolve();
                    if (cursor.value?.workspace_id === workspaceId) {
                        cursor.delete();
                        removed += 1;
                    }
                    cursor.continue();
                };
                request.onerror = () => reject(request.error || new Error("No se pudo limpiar la copia financiera local."));
            });
            await this.transactionDone(transaction);
            return removed;
        }

        async setMeta(workspaceId, name, value) {
            return this.put("meta", {
                key: `${workspaceId}:${name}`,
                workspace_id: workspaceId,
                name,
                value: structuredClone(value),
                updatedAt: new Date().toISOString()
            });
        }

        async getMeta(workspaceId, name, fallback = null) {
            const record = await this.get("meta", `${workspaceId}:${name}`);
            return record ? record.value : fallback;
        }

        async queue(operation) {
            return this.put("outbox", {
                ...structuredClone(operation),
                state: operation.state || "pending",
                attempts: Number(operation.attempts || 0),
                createdAt: operation.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        async pending(workspaceId) {
            const operations = await this.list("outbox", { workspace_id: workspaceId, state: ["pending", "retrying"] });
            return operations.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        }

        async conflict(operation, serverRecord) {
            await this.put("conflicts", {
                operationId: operation.operationId,
                workspace_id: operation.workspace_id,
                entity: operation.entity,
                localRecord: operation.record || operation.localRecords || null,
                serverRecord: serverRecord || null,
                operation: structuredClone(operation),
                detectedAt: new Date().toISOString()
            });
            await this.delete("outbox", operation.operationId);
        }

        transactionDone(transaction) {
            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar en IndexedDB."));
                transaction.onabort = () => reject(transaction.error || new Error("La escritura local fue cancelada."));
            });
        }

        close() {
            this.database?.close();
            this.database = null;
        }
    }

    root.AtlasFinanceStorage = Object.freeze({ FinanceStorage, DATABASE_NAME, DATABASE_VERSION, STORES });
})(typeof window !== "undefined" ? window : globalThis);
