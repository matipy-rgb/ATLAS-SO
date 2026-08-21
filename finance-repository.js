(function (root) {
    const Core = root.AtlasFinanceCore;
    const Domain = root.AtlasFinanceDomain;
    const Storage = root.AtlasFinanceStorage?.FinanceStorage;
    if (!Core || !Domain || !Storage) throw new Error("La base financiera no cargó en el orden esperado.");

    const ENTITIES = Object.freeze({
        contexts: { table: "finance_contexts", store: "contexts", factory: Core.contextRecord, base: true },
        accounts: { table: "finance_accounts", store: "accounts", factory: Core.accountRecord, base: true },
        categories: { table: "finance_categories", store: "categories", factory: Core.categoryRecord, base: true },
        paymentMethods: { table: "finance_payment_methods", store: "paymentMethods", factory: Domain.paymentMethodRecord, base: true },
        transactions: { table: "finance_transactions", store: "transactions", factory: Domain.transactionRecord, monthly: true },
        obligations: { table: "finance_obligations", store: "obligations", factory: Domain.obligationRecord, base: true },
        payments: { table: "finance_payments", store: "payments", factory: Domain.paymentRecord, monthly: true },
        attachments: { table: "finance_attachments", store: "attachments", factory: Domain.attachmentRecord, base: true },
        recurrences: { table: "finance_recurrences", store: "recurrences", factory: Domain.recurrenceRecord, base: true },
        budgets: { table: "finance_budgets", store: "budgets", factory: Domain.budgetRecord, base: true },
        goals: { table: "finance_goals", store: "goals", factory: Domain.goalRecord, base: true },
        goalEntries: { table: "finance_goal_entries", store: "goalEntries", factory: Domain.goalEntryRecord, base: true },
        assets: { table: "finance_assets", store: "assets", factory: Domain.assetRecord, base: true },
        valuations: { table: "finance_asset_valuations", store: "valuations", factory: Domain.valuationRecord, base: true },
        monthlyCloses: { table: "finance_monthly_closes", store: "monthlyCloses", base: true },
        savedFilters: { table: "finance_saved_filters", store: "savedFilters", factory: Domain.savedFilterRecord, base: true },
        auditLog: { table: "finance_audit_log", store: "auditLog", base: true }
    });
    const ARCHIVABLE = new Set(["contexts", "accounts", "categories", "paymentMethods", "recurrences", "budgets", "goals", "assets", "savedFilters"]);
    const LIABILITY_ACCOUNT_TYPES = new Set(["credit_card", "liability"]);

    function isMissingSchema(error) {
        return ["42P01", "PGRST205", "PGRST204", "42883"].includes(error?.code)
            || /does not exist|schema cache|could not find/i.test(String(error?.message || ""));
    }

    function isConnectivityError(error) {
        return !error?.code || /fetch|network|offline|timeout/i.test(String(error?.message || error || ""));
    }

    class FinanceRepository extends EventTarget {
        constructor({ workspaceId, userId, client = null, storage = new Storage(), workspaceRole = "owner" }) {
            super();
            this.workspaceId = workspaceId;
            this.userId = userId;
            this.client = client;
            this.storage = storage;
            this.workspaceRole = workspaceRole;
            this.remoteReady = false;
            this.syncing = false;
            this.channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(`atlas-finance:${workspaceId}`) : null;
            this.channel?.addEventListener("message", event => {
                if (event.data?.type === "changed") this.emit("external-change", event.data);
            });
        }

        assertOwner() {
            if (this.workspaceRole !== "owner") throw new Error("Finanzas es privada para el propietario.");
        }

        emit(type, detail = {}) {
            this.dispatchEvent(new CustomEvent(type, { detail }));
            root.dispatchEvent?.(new CustomEvent(`atlas:finance-${type}`, { detail }));
        }

        syncStatus(status, message, extra = {}) {
            this.emit("sync-status", { status, message, ...extra });
            root.dispatchEvent?.(new CustomEvent("atlas:sync-status", { detail: { status, message } }));
        }

        options() { return { workspaceId: this.workspaceId, userId: this.userId }; }

        async initialize() {
            this.assertOwner();
            await this.storage.open();
            let contexts = await this.list("contexts");
            if (this.client) {
                try {
                    const personalId = contexts.find(context => context.kind === "personal")?.id || Core.personalContextId(this.workspaceId);
                    const { data, error } = await this.client.rpc("finance_seed_personal_context", { target_workspace: this.workspaceId, requested_id: personalId });
                    if (error) throw error;
                    this.remoteReady = Boolean(data);
                    await this.pullBase();
                    contexts = await this.list("contexts");
                } catch (error) {
                    if (!isMissingSchema(error) && !isConnectivityError(error)) throw error;
                    this.remoteReady = false;
                    this.syncStatus("offline", isMissingSchema(error) ? "Base financiera pendiente de instalar" : "Cambios guardados en este dispositivo");
                }
            }
            if (!contexts.some(context => context.kind === "personal")) {
                const personal = Core.contextRecord({ id: Core.personalContextId(this.workspaceId), kind: "personal", name: "Personal" }, this.options());
                await this.storage.put("contexts", personal);
                await this.queueCreate("contexts", personal, false);
                contexts.push(personal);
            }
            // Categorías y medios de pago pertenecen al usuario. Un espacio nuevo
            // empieza vacío y nunca vuelve a crear sugerencias eliminadas.
            if ((await this.storage.pending(this.workspaceId)).length) this.flush().catch(error => console.warn("Sincronización financiera:", error.message));
            return this.snapshot();
        }

        async list(entity, filters = {}) {
            const config = ENTITIES[entity];
            if (!config) throw new Error(`Entidad financiera desconocida: ${entity}`);
            return this.storage.list(config.store, { workspace_id: this.workspaceId, ...filters });
        }

        async snapshot() {
            const names = Object.keys(ENTITIES);
            const values = await Promise.all(names.map(name => this.list(name)));
            const result = Object.fromEntries(names.map((name, index) => [name, values[index]]));
            [result.conflicts, result.migrationRuns] = await Promise.all([
                this.storage.list("conflicts", { workspace_id: this.workspaceId }),
                this.storage.list("migrationRuns", { workspace_id: this.workspaceId })
            ]);
            return result;
        }

        makeRecord(entity, input, existing = null) {
            const config = ENTITIES[entity];
            if (!config?.factory) throw new Error("Esta entidad se modifica mediante una operación controlada.");
            let record = config.factory({ ...existing, ...input }, this.options(), existing);
            if (existing && [Core.contextRecord, Core.accountRecord, Core.categoryRecord].includes(config.factory)) {
                record = { ...record, created_at: existing.created_at, created_by: existing.created_by, version: Number(existing.version || 1) + 1 };
            }
            return record;
        }

        async save(entity, input) {
            this.assertOwner();
            const config = ENTITIES[entity];
            if (!config?.factory) throw new Error("Esta entidad requiere una operación específica.");
            const existing = input.id ? await this.storage.get(config.store, input.id) : null;
            const record = this.makeRecord(entity, input, existing);
            await this.assertRelations(entity, record);
            await this.assertUnique(entity, record, existing?.id);
            await this.assertMonthOpen(record.context_id, Domain.monthOf(record.occurred_at || record.paid_on || record.month || ""));
            await this.storage.put(config.store, record);
            await this.storage.queue(this.outbox(entity, existing ? "update" : "create", record, existing?.version || 0));
            this.afterLocalChange(entity, record);
            this.flush().catch(error => console.warn("Sincronización financiera:", error.message));
            return record;
        }

        async assertRelations(entity, record) {
            if (entity === "contexts") return;
            if (record.context_id) {
                const context = await this.storage.get("contexts", record.context_id);
                if (!context || context.workspace_id !== this.workspaceId) throw new Error("El contexto relacionado no pertenece a este espacio.");
            }
            const sameContext = async (store, id, label) => {
                if (!id) return null;
                const related = await this.storage.get(store, id);
                if (!related || related.context_id !== record.context_id || related.workspace_id !== this.workspaceId) {
                    throw new Error(`${label} no pertenece al contexto elegido.`);
                }
                return related;
            };
            if (entity === "categories" && record.parent_id) {
                const parent = await sameContext("categories", record.parent_id, "La categoría superior");
                if (parent.parent_id) throw new Error("Las categorías admiten como máximo dos niveles.");
            }
            if (["paymentMethods", "goals"].includes(entity)) await sameContext("accounts", record.account_id, "La cuenta");
            if (entity === "obligations") {
                const account = await sameContext("accounts", record.account_id, "La cuenta");
                await sameContext("categories", record.category_id, "La categoría");
                await sameContext("recurrences", record.recurrence_id, "La recurrencia");
                if (record.obligation_type === "card" && !account) throw new Error("Una tarjeta debe vincularse con su cuenta de tarjeta o pasivo.");
                if (account && ["loan", "card"].includes(record.obligation_type) && !LIABILITY_ACCOUNT_TYPES.has(account.account_type)) {
                    throw new Error("Los préstamos y tarjetas solo pueden vincularse con una cuenta de pasivo.");
                }
            }
            if (entity === "budgets") await sameContext("categories", record.category_id, "La categoría");
            if (entity === "goalEntries") await sameContext("goals", record.goal_id, "La meta");
            if (entity === "valuations") await sameContext("assets", record.asset_id, "El activo o pasivo");
        }

        outbox(entity, action, record, baseVersion = 0) {
            return { operationId: Core.createId(), idempotencyKey: `${entity}:${record.id}:${record.version}`, workspace_id: this.workspaceId, entity, action, baseVersion, record };
        }

        rpcOutbox(name, args, localRecords = []) {
            return { operationId: Core.createId(), idempotencyKey: args.operation_key || `${name}:${Core.createId()}`, workspace_id: this.workspaceId, entity: "rpc", action: "rpc", rpcName: name, rpcArgs: args, localRecords };
        }

        async queueCreate(entity, record, flushNow = true) {
            await this.storage.queue(this.outbox(entity, "create", record, 0));
            if (flushNow) this.flush().catch(error => console.warn("Sincronización financiera:", error.message));
        }

        async assertUnique(entity, record, ownId) {
            if (!["contexts", "accounts", "categories", "paymentMethods", "budgets", "savedFilters"].includes(entity)) return;
            const records = await this.list(entity);
            const duplicate = records.find(item => item.id !== ownId && item.status !== "archived" && (entity === "budgets"
                ? item.context_id === record.context_id && item.category_id === record.category_id && item.month === record.month
                : Core.searchText(item.name) === Core.searchText(record.name) && (entity === "contexts" || item.context_id === record.context_id)
                    && (entity !== "categories" || (item.parent_id || null) === (record.parent_id || null))));
            if (duplicate) throw new Error(entity === "budgets" ? "Ya existe un presupuesto para esa categoría y mes." : `Ya existe ${record.name} en este alcance.`);
        }

        async assertMonthOpen(contextId, month) {
            if (!contextId || !/^\d{4}-\d{2}$/.test(month)) return;
            if (Domain.isMonthClosed(await this.list("monthlyCloses"), contextId, month)) {
                throw new Error(`El mes ${Core.formatMonth(month)} está cerrado. Reabrilo con un motivo antes de cambiarlo.`);
            }
        }

        async archive(entity, id, archived = true) {
            if (!ARCHIVABLE.has(entity)) throw new Error("Esta entidad no se puede archivar.");
            const current = await this.storage.get(ENTITIES[entity].store, id);
            if (!current) throw new Error("No encontramos el registro.");
            if (entity === "contexts" && current.kind === "personal" && archived) throw new Error("El contexto Personal no se puede archivar.");
            return this.save(entity, { ...current, status: archived ? "archived" : "active", archived_at: archived ? new Date().toISOString() : null });
        }

        async archiveMany(entity, ids, archived = true) {
            this.assertOwner();
            if (!ARCHIVABLE.has(entity)) throw new Error("Esta entidad no se puede archivar.");
            const uniqueIds = [...new Set((ids || []).filter(Boolean))];
            const currentRecords = (await Promise.all(uniqueIds.map(id => this.storage.get(ENTITIES[entity].store, id)))).filter(Boolean);
            if (entity === "contexts" && archived && currentRecords.some(record => record.kind === "personal")) {
                throw new Error("El contexto Personal no se puede archivar.");
            }
            const now = new Date().toISOString();
            const records = currentRecords.map(current => this.makeRecord(entity, {
                ...current,
                status: archived ? "archived" : "active",
                archived_at: archived ? now : null
            }, current));
            const operations = [];
            records.forEach((record, index) => {
                operations.push({ store: ENTITIES[entity].store, value: record });
                operations.push({
                    store: "outbox",
                    value: {
                        ...this.outbox(entity, "update", record, currentRecords[index].version || 0),
                        state: "pending",
                        attempts: 0,
                        createdAt: now,
                        updatedAt: now
                    }
                });
            });
            await this.storage.atomic(operations);
            if (records.length) {
                this.afterLocalChange(entity, records[0]);
                this.flush().catch(error => console.warn("Sincronización financiera:", error.message));
            }
            return records;
        }

        afterLocalChange(entity, record) {
            this.syncStatus("syncing", "Guardado local · sincronizando");
            this.emit("changed", { entity, record, local: true });
            this.channel?.postMessage({ type: "changed", entity, id: record?.id });
        }

        async postOperation(input) {
            this.assertOwner();
            const contextId = input.context_id;
            await this.assertMonthOpen(contextId, Domain.monthOf(input.occurred_at));
            const accounts = await this.list("accounts", { context_id: contextId });
            const source = accounts.find(item => item.id === input.account_id && item.status === "active");
            if (!source) throw new Error("La cuenta de origen no está activa en este contexto.");
            const groupId = input.operation_group_id || Core.createId();
            const previous = (await this.list("transactions")).filter(item => item.operation_group_id === groupId);
            let records;
            if (input.operation_kind === "transfer") {
                const target = accounts.find(item => item.id === input.destination_account_id && item.status === "active");
                if (!target || target.id === source.id) throw new Error("Elegí una cuenta de destino diferente y activa.");
                const base = { ...input, operation_group_id: groupId, reporting_effect: "neutral", operation_kind: "transfer", category_id: null };
                const debit = previous.find(item => item.operation_leg === "source") || previous.find(item => item.balance_delta < 0);
                const credit = previous.find(item => item.operation_leg === "destination") || previous.find(item => item.id !== debit?.id);
                const sourceDelta = LIABILITY_ACCOUNT_TYPES.has(source.account_type) ? Number(input.amount) : -Number(input.amount);
                const targetDelta = LIABILITY_ACCOUNT_TYPES.has(target.account_type) ? -Number(input.amount) : Number(input.amount);
                records = [
                    Domain.transactionRecord({ ...base, id: debit?.id || Core.createId(), account_id: source.id, operation_leg: "source", transaction_type: "expense", balance_delta: sourceDelta, description: input.description || `Transferencia a ${target.name}` }, this.options(), debit),
                    Domain.transactionRecord({ ...base, id: credit?.id || Core.createId(), account_id: target.id, operation_leg: "destination", transaction_type: "income", balance_delta: targetDelta, description: input.description || `Transferencia desde ${source.name}` }, this.options(), credit)
                ];
            } else {
                const transactionType = ["income", "refund", "collection", "owner_contribution"].includes(input.operation_kind) || input.direction === "income" ? "income" : "expense";
                const effect = ["owner_contribution", "owner_withdrawal", "adjustment"].includes(input.operation_kind) ? "neutral" : undefined;
                const liability = LIABILITY_ACCOUNT_TYPES.has(source.account_type);
                const adjustmentDelta = input.direction === "income" ? Number(input.amount) : -Number(input.amount);
                const delta = input.operation_kind === "adjustment" ? adjustmentDelta
                    : liability ? (transactionType === "expense" ? Number(input.amount) : -Number(input.amount))
                        : transactionType === "income" ? Number(input.amount) : -Number(input.amount);
                const existing = previous[0] || (input.id ? await this.storage.get("transactions", input.id) : null);
                records = [Domain.transactionRecord({ ...input, id: existing?.id || input.id || Core.createId(), operation_group_id: groupId, transaction_type: transactionType, reporting_effect: effect, balance_delta: delta }, this.options(), existing)];
            }
            const operationKey = input.idempotency_key || `operation:${groupId}:${Math.max(...records.map(item => item.version), 1)}`;
            const queue = this.rpcOutbox("finance_post_operation", { target_workspace: this.workspaceId, operation_key: operationKey, operation: { mode: previous.length ? "replace" : "create", records } }, records.map(record => ({ entity: "transactions", record })));
            await this.storage.atomic([...records.map(record => ({ store: "transactions", value: record })), { store: "outbox", value: { ...queue, state: "pending", attempts: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }]);
            this.afterLocalChange("transactions", records[0]);
            this.flush().catch(error => console.warn("Sincronización financiera:", error.message));
            return records;
        }

        async voidOperation(groupId, reason) {
            const previous = (await this.list("transactions")).filter(item => item.operation_group_id === groupId || item.id === groupId);
            if (!previous.length) throw new Error("No encontramos el movimiento.");
            await this.assertMonthOpen(previous[0].context_id, Domain.monthOf(previous[0].occurred_at));
            const records = previous.map(item => Domain.transactionRecord({ ...item, status: "void", void_reason: reason }, this.options(), item));
            const queue = this.rpcOutbox("finance_post_operation", { target_workspace: this.workspaceId, operation_key: `void:${groupId}:${records[0].version}`, operation: { mode: "void", records, reason: Core.cleanText(reason, 300) } }, records.map(record => ({ entity: "transactions", record })));
            await this.storage.atomic([...records.map(value => ({ store: "transactions", value })), { store: "outbox", value: { ...queue, state: "pending", attempts: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }]);
            this.afterLocalChange("transactions", records[0]);
            this.flush().catch(error => console.warn(error.message));
            return records;
        }

        async deletePendingOperation(groupId) {
            this.assertOwner();
            const records = (await this.list("transactions")).filter(item => item.operation_group_id === groupId || item.id === groupId);
            if (!records.length || records.some(item => item.status !== "pending" || item.related_obligation_id || item.related_payment_id)) {
                throw new Error("Solo se puede eliminar un borrador pendiente sin relaciones.");
            }
            const attachments = await this.list("attachments");
            if (attachments.some(item => records.some(record => item.transaction_id === record.id) && item.sync_state !== "removed")) {
                throw new Error("Quitá primero el comprobante vinculado al borrador.");
            }
            await this.assertMonthOpen(records[0].context_id, Domain.monthOf(records[0].occurred_at));
            const recordIds = new Set(records.map(item => item.id));
            const superseded = (await this.storage.pending(this.workspaceId)).filter(item => item.rpcName === "finance_post_operation"
                && (item.localRecords || []).some(entry => entry.entity === "transactions" && recordIds.has(entry.record.id)));
            const queue = this.rpcOutbox("finance_delete_pending_operation", {
                target_workspace: this.workspaceId, operation_key: `delete-draft:${groupId}:${Date.now()}`,
                operation_group: records[0].operation_group_id
            }, records.map(record => ({ entity: "transactions", record })));
            await this.storage.atomic([
                ...records.map(record => ({ store: "transactions", action: "delete", key: record.id })),
                ...superseded.map(item => ({ store: "outbox", action: "delete", key: item.operationId })),
                { store: "outbox", value: { ...queue, state: "pending", attempts: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }
            ]);
            this.afterLocalChange("transactions", records[0]);
            this.flush().catch(error => console.warn(error.message));
            return records.length;
        }

        async payObligation(input) {
            this.assertOwner();
            const obligation = await this.storage.get("obligations", input.obligation_id);
            if (!obligation || ["paid", "void"].includes(obligation.status)) throw new Error("El compromiso ya no admite pagos.");
            const payerAccount = await this.storage.get("accounts", input.account_id);
            if (!payerAccount || payerAccount.context_id !== obligation.context_id || payerAccount.status !== "active") {
                throw new Error("Elegí una cuenta pagadora activa del mismo contexto.");
            }
            await this.assertMonthOpen(obligation.context_id, Domain.monthOf(input.paid_on));
            const amount = Core.positiveMoney(input.amount);
            const remaining = Domain.obligationTotal(obligation) - Number(obligation.paid_amount);
            if (!amount || amount > remaining) throw new Error(`El pago no puede superar el saldo de ${Core.formatMoney(remaining)}.`);
            const paymentId = Core.createId();
            const transactionId = Core.createId();
            const payment = Domain.paymentRecord({ ...input, id: paymentId, context_id: obligation.context_id, linked_transaction_id: transactionId }, this.options());
            const income = obligation.direction === "receivable";
            const neutral = ["loan", "card"].includes(obligation.obligation_type);
            if (neutral && obligation.account_id === payerAccount.id) throw new Error("La cuenta pagadora debe ser distinta de la deuda que se reduce.");
            const payerDelta = LIABILITY_ACCOUNT_TYPES.has(payerAccount.account_type)
                ? (income ? -amount : amount) : (income ? amount : -amount);
            const transaction = Domain.transactionRecord({
                id: transactionId, context_id: obligation.context_id, account_id: input.account_id, category_id: obligation.category_id,
                payment_method_id: input.payment_method_id, operation_group_id: paymentId, operation_kind: income ? "collection" : "payment",
                operation_leg: "source",
                transaction_type: income ? "income" : "expense", reporting_effect: neutral ? "neutral" : income ? "income" : "expense",
                balance_delta: payerDelta, amount, occurred_at: input.paid_on,
                description: `${income ? "Cobro" : "Pago"}: ${obligation.name}`, related_obligation_id: obligation.id,
                related_payment_id: paymentId, note: input.note, status: "confirmed"
            }, this.options());
            const transactions = [transaction];
            if (neutral && obligation.account_id && obligation.account_id !== input.account_id) {
                transactions.push(Domain.transactionRecord({
                    id: Core.createId(), context_id: obligation.context_id, account_id: obligation.account_id,
                    operation_group_id: paymentId, operation_kind: "payment", operation_leg: "destination", transaction_type: "expense",
                    reporting_effect: "neutral", balance_delta: -amount, amount, occurred_at: input.paid_on,
                    description: `Reducción de deuda: ${obligation.name}`, related_obligation_id: obligation.id,
                    related_payment_id: paymentId, note: input.note, status: "confirmed"
                }, this.options()));
            }
            const updated = Domain.obligationRecord({ ...obligation, paid_amount: Number(obligation.paid_amount) + amount }, this.options(), obligation);
            const queue = this.rpcOutbox("finance_pay_obligation", { target_workspace: this.workspaceId, operation_key: `obligation-payment:${paymentId}`, payment_record: payment, transaction_records: transactions, obligation_version: obligation.version }, [
                { entity: "payments", record: payment }, ...transactions.map(record => ({ entity: "transactions", record })), { entity: "obligations", record: updated }
            ]);
            await this.storage.atomic([{ store: "payments", value: payment }, ...transactions.map(value => ({ store: "transactions", value })), { store: "obligations", value: updated }, { store: "outbox", value: { ...queue, state: "pending", attempts: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }]);
            this.afterLocalChange("payments", payment);
            this.flush().catch(error => console.warn(error.message));
            return { payment, transaction, transactions, obligation: updated };
        }

        async updatePayment(input) {
            this.assertOwner();
            const current = await this.storage.get("payments", input.id);
            if (!current || current.status === "void") throw new Error("El pago ya no admite cambios.");
            const obligation = await this.storage.get("obligations", current.obligation_id);
            if (!obligation || obligation.status === "void") throw new Error("El compromiso vinculado no está disponible.");
            const payerAccount = await this.storage.get("accounts", input.account_id || current.account_id);
            if (!payerAccount || payerAccount.context_id !== obligation.context_id || payerAccount.status !== "active") {
                throw new Error("Elegí una cuenta pagadora activa del mismo contexto.");
            }
            await this.assertMonthOpen(current.context_id, Domain.monthOf(current.paid_on));
            await this.assertMonthOpen(current.context_id, Domain.monthOf(input.paid_on || current.paid_on));
            const voiding = input.status === "void";
            const amount = voiding ? Number(current.amount) : Core.positiveMoney(input.amount);
            const paidBeforeThis = Number(obligation.paid_amount) - Number(current.amount);
            if (!voiding && (!amount || amount > Domain.obligationTotal(obligation) - paidBeforeThis)) {
                throw new Error(`El pago corregido no puede superar ${Core.formatMoney(Domain.obligationTotal(obligation) - paidBeforeThis)}.`);
            }
            const payment = Domain.paymentRecord({ ...current, ...input, amount, status: voiding ? "void" : "confirmed" }, this.options(), current);
            const income = obligation.direction === "receivable";
            const neutral = ["loan", "card"].includes(obligation.obligation_type);
            if (neutral && obligation.account_id === payerAccount.id) throw new Error("La cuenta pagadora debe ser distinta de la deuda que se reduce.");
            const payerDelta = LIABILITY_ACCOUNT_TYPES.has(payerAccount.account_type)
                ? (income ? -amount : amount) : (income ? amount : -amount);
            const oldTransactions = (await this.list("transactions")).filter(item => item.related_payment_id === current.id);
            const sourceOld = oldTransactions.find(item => item.operation_leg === "source") || oldTransactions.find(item => item.id === current.linked_transaction_id) || oldTransactions[0];
            if (!sourceOld) throw new Error("Falta el movimiento vinculado al pago.");
            const common = {
                operation_group_id: current.id, operation_kind: income ? "collection" : "payment",
                amount, occurred_at: input.paid_on || current.paid_on, related_obligation_id: obligation.id,
                related_payment_id: current.id, payment_method_id: input.payment_method_id || null,
                note: input.note, status: voiding ? "void" : "confirmed", void_reason: input.void_reason
            };
            const transactions = [Domain.transactionRecord({
                ...sourceOld, ...common, account_id: input.account_id || current.account_id, operation_leg: "source",
                category_id: obligation.category_id, transaction_type: income ? "income" : "expense",
                reporting_effect: neutral ? "neutral" : income ? "income" : "expense",
                balance_delta: payerDelta,
                description: `${income ? "Cobro" : "Pago"}: ${obligation.name}`
            }, this.options(), sourceOld)];
            if (neutral && obligation.account_id && obligation.account_id !== (input.account_id || current.account_id)) {
                const destinationOld = oldTransactions.find(item => item.operation_leg === "destination");
                transactions.push(Domain.transactionRecord({
                    ...destinationOld, ...common, id: destinationOld?.id || Core.createId(), account_id: obligation.account_id,
                    operation_kind: "payment", operation_leg: "destination", transaction_type: "expense",
                    reporting_effect: "neutral", balance_delta: -amount,
                    description: `Reducción de deuda: ${obligation.name}`
                }, this.options(), destinationOld));
            }
            const paidAmount = paidBeforeThis + (voiding ? 0 : amount);
            const updated = Domain.obligationRecord({ ...obligation, paid_amount: paidAmount, status: paidAmount === Domain.obligationTotal(obligation) ? "paid" : paidAmount ? "partial" : "pending" }, this.options(), obligation);
            const queue = this.rpcOutbox("finance_update_payment", {
                target_workspace: this.workspaceId, operation_key: `payment-update:${payment.id}:${payment.version}`,
                payment_record: payment, transaction_records: transactions, payment_version: current.version,
                obligation_version: obligation.version
            }, [{ entity: "payments", record: payment }, ...transactions.map(record => ({ entity: "transactions", record })), { entity: "obligations", record: updated }]);
            await this.storage.atomic([{ store: "payments", value: payment }, ...transactions.map(value => ({ store: "transactions", value })), { store: "obligations", value: updated }, { store: "outbox", value: { ...queue, state: "pending", attempts: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }]);
            this.afterLocalChange("payments", payment);
            this.flush().catch(error => console.warn(error.message));
            return { payment, transactions, obligation: updated };
        }

        async addGoalEntry(input) {
            const goal = await this.storage.get("goals", input.goal_id);
            if (!goal || goal.status === "archived") throw new Error("La meta no está activa.");
            return this.save("goalEntries", { ...input, context_id: goal.context_id });
        }

        async attachFile({ file, context_id, payment_id = null, transaction_id = null }) {
            if (!file) return null;
            const id = Core.createId();
            const record = Domain.attachmentRecord({
                id, context_id, payment_id, transaction_id, original_name: file.name, mime_type: file.type,
                byte_size: file.size, sync_state: "local_pending",
                storage_path: `${this.workspaceId}/finance/${id}/${Core.cleanText(file.name, 120).replace(/[^a-zA-Z0-9._-]/g, "_")}`
            }, this.options());
            const queue = this.outbox("attachments", "upload", record, 0);
            await this.storage.atomic([{ store: "attachments", value: record }, { store: "attachmentBlobs", value: { id, workspace_id: this.workspaceId, blob: file } }, { store: "outbox", value: { ...queue, state: "pending", attempts: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }]);
            this.afterLocalChange("attachments", record);
            this.flush().catch(error => console.warn(error.message));
            return record;
        }

        async attachmentUrl(id) {
            const attachment = await this.storage.get("attachments", id);
            if (!attachment) throw new Error("No encontramos el comprobante.");
            const local = await this.storage.get("attachmentBlobs", id);
            if (local?.blob) return URL.createObjectURL(local.blob);
            if (!this.client || !attachment.storage_path) throw new Error("El comprobante no está disponible en este dispositivo.");
            const { data, error } = await this.client.storage.from("atlas-finance-files").createSignedUrl(attachment.storage_path, 60);
            if (error) throw error;
            return data.signedUrl;
        }

        async removeAttachment(id) {
            this.assertOwner();
            const current = await this.storage.get("attachments", id);
            if (!current || current.sync_state === "removed") throw new Error("El comprobante ya no está disponible.");
            const pendingUpload = (await this.storage.pending(this.workspaceId)).find(item => item.entity === "attachments" && item.action === "upload" && item.record?.id === id);
            if (pendingUpload) {
                await this.storage.atomic([
                    { store: "attachments", action: "delete", key: id },
                    { store: "attachmentBlobs", action: "delete", key: id },
                    { store: "outbox", action: "delete", key: pendingUpload.operationId }
                ]);
                this.afterLocalChange("attachments", current);
                return true;
            }
            const record = Domain.attachmentRecord({ ...current, sync_state: "removed" }, this.options(), current);
            const queue = this.outbox("attachments", "remove-file", record, current.version);
            await this.storage.atomic([
                { store: "attachments", value: record }, { store: "attachmentBlobs", action: "delete", key: id },
                { store: "outbox", value: { ...queue, state: "pending", attempts: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }
            ]);
            this.afterLocalChange("attachments", record);
            this.flush().catch(error => console.warn(error.message));
            return true;
        }

        async generateRecurrences(month, contextId) {
            const recurrences = (await this.list("recurrences")).filter(item => item.status === "active" && item.context_id === contextId);
            const obligations = await this.list("obligations", { context_id: contextId });
            const transactions = await this.list("transactions", { context_id: contextId });
            const created = [];
            for (const recurrence of recurrences) {
                let due = recurrence.next_on;
                if (!due || Domain.monthOf(due) > month || (recurrence.ends_on && due > recurrence.ends_on)) continue;
                while (due && Domain.monthOf(due) <= month && (!recurrence.ends_on || due <= recurrence.ends_on)) {
                    if (Domain.monthOf(due) === month) {
                        if (recurrence.template_type === "obligation") {
                            if (!obligations.some(item => item.recurrence_id === recurrence.id && item.due_date === due)) {
                                const occurrence = await this.save("obligations", { ...recurrence.template, context_id: contextId, recurrence_id: recurrence.id, due_date: due, frequency: recurrence.frequency });
                                obligations.push(occurrence);
                                created.push(occurrence);
                            }
                        } else {
                            const groupId = Core.derivedId(recurrence.id, Number(due.replaceAll("-", "")));
                            if (!transactions.some(item => item.operation_group_id === groupId)) {
                                const occurrence = await this.postOperation({ ...recurrence.template, context_id: contextId, occurred_at: due, operation_group_id: groupId });
                                transactions.push(...occurrence);
                                created.push(...occurrence);
                            }
                        }
                    }
                    if (recurrence.frequency === "weekly") {
                        const next = new Date(`${due}T12:00:00Z`);
                        next.setUTCDate(next.getUTCDate() + 7 * Number(recurrence.interval_count || 1));
                        due = next.toISOString().slice(0, 10);
                    } else {
                        const step = recurrence.frequency === "yearly" ? 12 : recurrence.frequency === "quarterly" ? 3 : 1;
                        const nextMonth = Domain.addMonths(Domain.monthOf(due), step * Number(recurrence.interval_count || 1));
                        const nextDay = String(Math.min(Number(due.slice(8, 10)), new Date(Number(nextMonth.slice(0, 4)), Number(nextMonth.slice(5, 7)), 0).getDate())).padStart(2, "0");
                        due = `${nextMonth}-${nextDay}`;
                    }
                }
                if (due !== recurrence.next_on) await this.save("recurrences", { ...recurrence, next_on: due });
            }
            return created;
        }

        async closeMonth(contextId, month, data, confirmation, observations = "", reconciliations = []) {
            if (!confirmation) throw new Error("Confirmá que revisaste los diez controles del cierre.");
            if ((await this.storage.list("conflicts", { workspace_id: this.workspaceId })).length) throw new Error("Resolvé los conflictos de sincronización antes de cerrar el mes.");
            if (Domain.isMonthClosed(await this.list("monthlyCloses"), contextId, month)) throw new Error("Este mes ya está cerrado.");
            const existing = (await this.list("monthlyCloses", { context_id: contextId, month })).sort((a, b) => Number(b.version_number) - Number(a.version_number));
            const record = { ...Core.baseRecord({ id: Core.createId() }, this.options()), context_id: contextId, month, version_number: Number(existing[0]?.version_number || 0) + 1, state: "closed", snapshot: Domain.closeSnapshot(data, contextId, month, { observations, reconciliations }), closed_at: new Date().toISOString(), reopened_at: null, reopen_reason: "", previous_close_id: existing[0]?.id || null };
            const queue = this.rpcOutbox("finance_close_month", { target_workspace: this.workspaceId, close_record: record, operation_key: `close:${record.id}` }, [{ entity: "monthlyCloses", record }]);
            await this.storage.atomic([{ store: "monthlyCloses", value: record }, { store: "outbox", value: { ...queue, state: "pending", attempts: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }]);
            this.afterLocalChange("monthlyCloses", record);
            this.flush().catch(error => console.warn(error.message));
            return record;
        }

        async reopenMonth(closeId, reason) {
            const current = await this.storage.get("monthlyCloses", closeId);
            if (!current || current.state !== "closed") throw new Error("No encontramos un cierre activo.");
            const reasonText = Core.cleanText(reason, 500);
            if (!reasonText) throw new Error("Explicá por qué necesitás reabrir el mes.");
            const history = (await this.list("monthlyCloses", { context_id: current.context_id, month: current.month }))
                .sort((a, b) => Number(b.version_number) - Number(a.version_number));
            if (history[0]?.id !== current.id) throw new Error("El cierre seleccionado ya no es la versión vigente.");
            const reopened = {
                ...Core.baseRecord({ id: Core.createId() }, this.options()), context_id: current.context_id,
                month: current.month, version_number: Number(current.version_number) + 1, state: "reopened",
                snapshot: structuredClone(current.snapshot), closed_at: current.closed_at,
                reopened_at: new Date().toISOString(), reopen_reason: reasonText, previous_close_id: current.id
            };
            const queue = this.rpcOutbox("finance_reopen_month", { target_workspace: this.workspaceId, reopen_record: reopened, operation_key: `reopen:${reopened.id}` }, [{ entity: "monthlyCloses", record: reopened }]);
            await this.storage.atomic([{ store: "monthlyCloses", value: reopened }, { store: "outbox", value: { ...queue, state: "pending", attempts: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }]);
            this.afterLocalChange("monthlyCloses", reopened);
            this.flush().catch(error => console.warn(error.message));
            return reopened;
        }

        async pullBase() {
            if (!this.client) return false;
            for (const entity of Object.keys(ENTITIES).filter(name => ENTITIES[name].base)) {
                const config = ENTITIES[entity];
                const { data, error } = await this.client.from(config.table).select("*").eq("workspace_id", this.workspaceId).limit(entity === "obligations" ? 1000 : 5000);
                if (error) throw error;
                await this.storage.bulkPut(config.store, data || []);
            }
            this.remoteReady = true;
            this.syncStatus("synced", "Sincronizado");
            return true;
        }

        async pullMonth(month) {
            if (!this.client || !this.remoteReady) return false;
            const [year, number] = month.split("-").map(Number);
            const start = `${month}-01T00:00:00-04:00`;
            const next = new Date(Date.UTC(year, number, 1));
            const end = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00-04:00`;
            const paymentStart = `${month}-01`;
            const paymentEnd = end.slice(0, 10);
            const [transactionResult, paymentResult] = await Promise.all([
                this.client.from("finance_transactions").select("*").eq("workspace_id", this.workspaceId)
                    .gte("occurred_at", start).lt("occurred_at", end).order("occurred_at", { ascending: false }).limit(10000),
                this.client.from("finance_payments").select("*").eq("workspace_id", this.workspaceId)
                    .gte("paid_on", paymentStart).lt("paid_on", paymentEnd).order("paid_on", { ascending: false }).limit(10000)
            ]);
            if (transactionResult.error) throw transactionResult.error;
            if (paymentResult.error) throw paymentResult.error;
            await this.storage.bulkPut("transactions", transactionResult.data || []);
            await this.storage.bulkPut("payments", paymentResult.data || []);
            await this.storage.setMeta(this.workspaceId, `month:${month}`, { loadedAt: new Date().toISOString() });
            return true;
        }

        async pullRange(fromDate, toDate) {
            if (!Core.isISODate(fromDate) || !Core.isISODate(toDate) || fromDate > toDate) throw new Error("El rango de fechas no es válido.");
            let month = Domain.monthOf(fromDate);
            const finalMonth = Domain.monthOf(toDate);
            let count = 0;
            while (month <= finalMonth) {
                if (count >= 60) throw new Error("El rango no puede superar 60 meses.");
                await this.pullMonth(month);
                month = Domain.addMonths(month, 1);
                count += 1;
            }
            return count;
        }

        async flush() {
            if (this.syncing) return false;
            const pending = await this.storage.pending(this.workspaceId);
            if (!pending.length) { if (this.remoteReady) this.syncStatus("synced", "Sincronizado"); return this.remoteReady; }
            if (!this.client || !this.remoteReady || root.navigator?.onLine === false) { this.syncStatus("offline", "Guardado en este dispositivo", { pending: pending.length }); return false; }
            this.syncing = true;
            this.syncStatus("syncing", `Sincronizando ${pending.length} cambio${pending.length === 1 ? "" : "s"}`);
            let halted = false;
            try {
                for (const operation of pending) {
                    const result = await this.pushOperation(operation);
                    if (["retry", "conflict"].includes(result)) { halted = true; break; }
                }
            } finally { this.syncing = false; }
            const remaining = await this.storage.pending(this.workspaceId);
            const conflicts = await this.storage.list("conflicts", { workspace_id: this.workspaceId });
            if (conflicts.length) {
                this.syncStatus("conflict", "Hay un conflicto por resolver", { conflicts: conflicts.length });
                return false;
            }
            if (remaining.length) {
                this.syncStatus("offline", "Hay cambios pendientes", { pending: remaining.length });
                if (!halted && this.remoteReady) root.setTimeout(() => this.flush().catch(error => console.warn(error.message)), 0);
                return false;
            }
            await this.pullAudit().catch(error => console.warn("No se pudo actualizar la auditoría:", error.message));
            this.syncStatus("synced", "Sincronizado");
            return true;
        }

        async pullAudit() {
            if (!this.client || !this.remoteReady) return false;
            const { data, error } = await this.client.from("finance_audit_log").select("*")
                .eq("workspace_id", this.workspaceId).order("occurred_at", { ascending: false }).limit(5000);
            if (error) throw error;
            await this.storage.bulkPut("auditLog", data || []);
            return true;
        }

        async pushOperation(operation) {
            if (operation.action === "rpc") return this.pushRpc(operation);
            const config = ENTITIES[operation.entity];
            if (!config) { await this.storage.delete("outbox", operation.operationId); return "ignored"; }
            if (operation.action === "upload") return this.pushAttachment(operation);
            if (operation.action === "remove-file") return this.pushAttachmentRemoval(operation);
            let response;
            try {
                if (operation.action === "restore") {
                    const remote = await this.fetchOne(operation.entity, operation.record.id);
                    response = remote ? { data: remote, error: null } : await this.client.from(config.table).insert(operation.record).select("*").single();
                } else if (operation.action === "create") response = await this.client.from(config.table).insert(operation.record).select("*").single();
                else response = await this.client.from(config.table).update(operation.record).eq("workspace_id", this.workspaceId).eq("id", operation.record.id).eq("version", operation.baseVersion).select("*").maybeSingle();
            } catch (error) { response = { data: null, error }; }
            if (response.error) return this.handlePushError(operation, response.error);
            if (operation.action === "update" && !response.data) {
                const serverRecord = await this.fetchOne(operation.entity, operation.record.id);
                await this.storage.conflict(operation, serverRecord);
                this.emit("conflict", { operation, serverRecord });
                this.syncStatus("conflict", "Hay un conflicto por resolver");
                return "conflict";
            }
            return this.acceptRemote(operation, response.data || operation.record);
        }

        async pushRpc(operation) {
            let response;
            try { response = await this.client.rpc(operation.rpcName, operation.rpcArgs); } catch (error) { response = { error }; }
            if (response.error) return this.handlePushError(operation, response.error);
            await this.storage.delete("outbox", operation.operationId);
            this.emit("changed", { entity: "rpc", record: response.data, local: false });
            return "synced";
        }

        async pushAttachment(operation) {
            const local = await this.storage.get("attachmentBlobs", operation.record.id);
            if (!local?.blob) return this.handlePushError(operation, new Error("Falta el archivo local del comprobante."));
            let upload;
            try { upload = await this.client.storage.from("atlas-finance-files").upload(operation.record.storage_path, local.blob, { contentType: operation.record.mime_type, upsert: false }); } catch (error) { upload = { error }; }
            if (upload.error && upload.error.statusCode !== "409") return this.handlePushError(operation, upload.error);
            const record = { ...operation.record, sync_state: "remote", updated_at: new Date().toISOString() };
            const response = await this.client.from("finance_attachments").upsert(record).select("*").single();
            if (response.error) return this.handlePushError(operation, response.error);
            await this.storage.delete("attachmentBlobs", record.id);
            return this.acceptRemote(operation, response.data || record);
        }

        async pushAttachmentRemoval(operation) {
            let removal;
            try { removal = operation.record.storage_path ? await this.client.storage.from("atlas-finance-files").remove([operation.record.storage_path]) : { error: null }; }
            catch (error) { removal = { error }; }
            if (removal.error && !["404", 404].includes(removal.error.statusCode)) return this.handlePushError(operation, removal.error);
            let response;
            try {
                response = await this.client.from("finance_attachments").update(operation.record)
                    .eq("workspace_id", this.workspaceId).eq("id", operation.record.id).eq("version", operation.baseVersion).select("*").maybeSingle();
            } catch (error) { response = { data: null, error }; }
            if (response.error) return this.handlePushError(operation, response.error);
            if (!response.data) {
                const remote = await this.fetchOne("attachments", operation.record.id);
                await this.storage.conflict(operation, remote);
                return "conflict";
            }
            return this.acceptRemote(operation, response.data);
        }

        async handlePushError(operation, error) {
            if (operation.action === "create" && error.code === "23505") {
                const remote = await this.fetchOne(operation.entity, operation.record.id);
                if (remote) return this.acceptRemote(operation, remote);
            }
            if (isMissingSchema(error)) { this.remoteReady = false; this.syncStatus("offline", "Base financiera pendiente de instalar"); return "retry"; }
            if (isConnectivityError(error)) { await this.storage.queue({ ...operation, state: "retrying", attempts: Number(operation.attempts || 0) + 1 }); return "retry"; }
            if (error.code === "40001" || /finance_(version|obligation|payment)_conflict/i.test(String(error.message || ""))) {
                await this.storage.conflict(operation, { code: error.code, message: String(error.message || "Conflicto compuesto") });
                this.emit("conflict", { operation, serverRecord: null });
                this.syncStatus("conflict", "Hay una operación compuesta en conflicto");
                return "conflict";
            }
            throw error;
        }

        async fetchOne(entity, id) {
            const config = ENTITIES[entity];
            const { data, error } = await this.client.from(config.table).select("*").eq("workspace_id", this.workspaceId).eq("id", id).maybeSingle();
            if (error) throw error;
            return data || null;
        }

        async acceptRemote(operation, remote) {
            await this.storage.put(ENTITIES[operation.entity].store, remote);
            await this.storage.delete("outbox", operation.operationId);
            this.emit("changed", { entity: operation.entity, record: remote, local: false });
            return "synced";
        }

        async resolveConflict(operationId, choice) {
            const conflict = await this.storage.get("conflicts", operationId);
            if (!conflict) return false;
            if (conflict.entity === "rpc") return this.resolveRpcConflict(conflict, choice);
            const config = ENTITIES[conflict.entity];
            if (choice === "server") {
                if (conflict.serverRecord) await this.storage.put(config.store, conflict.serverRecord);
                await this.storage.delete("conflicts", operationId);
                this.emit("changed", { entity: conflict.entity, record: conflict.serverRecord, resolved: "server" });
                return true;
            }
            const record = { ...conflict.localRecord, version: Number(conflict.serverRecord?.version || 0) + 1, updated_at: new Date().toISOString(), updated_by: this.userId };
            await this.storage.put(config.store, record);
            await this.storage.queue(this.outbox(conflict.entity, "update", record, Number(conflict.serverRecord?.version || 0)));
            await this.storage.delete("conflicts", operationId);
            return this.flush();
        }

        async resolveRpcConflict(conflict, choice) {
            const operation = conflict.operation;
            if (!operation) throw new Error("El conflicto no conserva la operación original.");
            if (choice === "server") {
                const impactedMonths = new Set();
                const discardedIds = new Set();
                for (const item of operation.localRecords || []) {
                    const config = ENTITIES[item.entity];
                    if (!config) continue;
                    const month = Domain.monthOf(item.record.occurred_at || item.record.paid_on || item.record.due_date || item.record.month || "");
                    if (item.record.context_id && month) impactedMonths.add(`${item.record.context_id}:${month}`);
                    const remote = await this.fetchOne(item.entity, item.record.id);
                    if (remote) await this.storage.put(config.store, remote);
                    else {
                        discardedIds.add(item.record.id);
                        await this.storage.delete(config.store, item.record.id);
                    }
                }
                for (const pending of await this.storage.pending(this.workspaceId)) {
                    if (pending.action === "upload" && (discardedIds.has(pending.record?.transaction_id) || discardedIds.has(pending.record?.payment_id))) {
                        await this.storage.delete("outbox", pending.operationId);
                        await this.storage.delete("attachments", pending.record.id);
                        await this.storage.delete("attachmentBlobs", pending.record.id);
                        continue;
                    }
                    if (pending.rpcName !== "finance_close_month") continue;
                    const close = pending.rpcArgs?.close_record;
                    if (!close || !impactedMonths.has(`${close.context_id}:${close.month}`)) continue;
                    await this.storage.delete("outbox", pending.operationId);
                    await this.storage.delete("monthlyCloses", close.id);
                }
                await this.storage.delete("conflicts", conflict.operationId);
                this.emit("changed", { entity: "rpc", resolved: "server" });
                return true;
            }
            if (operation.rpcName === "finance_post_operation") {
                const records = [];
                for (const item of operation.localRecords.filter(entry => entry.entity === "transactions")) {
                    const remote = await this.fetchOne("transactions", item.record.id);
                    const record = remote ? {
                        ...item.record, created_at: remote.created_at, created_by: remote.created_by,
                        version: Number(remote.version || 0) + 1, updated_at: new Date().toISOString(), updated_by: this.userId
                    } : { ...item.record, version: 1 };
                    records.push(record);
                    await this.storage.put("transactions", record);
                }
                const retried = { ...operation, operationId: Core.createId(), idempotencyKey: `${operation.idempotencyKey}:retry:${Date.now()}`, rpcArgs: { ...operation.rpcArgs, operation_key: `${operation.rpcArgs.operation_key}:retry:${Date.now()}`, operation: { ...operation.rpcArgs.operation, mode: "replace", records } }, localRecords: records.map(record => ({ entity: "transactions", record })), state: "pending", attempts: 0, createdAt: new Date().toISOString() };
                await this.storage.queue(retried);
            } else if (operation.rpcName === "finance_pay_obligation") {
                const remote = await this.fetchOne("obligations", operation.rpcArgs.payment_record.obligation_id);
                if (!remote || ["paid", "void"].includes(remote.status)) throw new Error("El compromiso remoto ya no admite este pago.");
                const amount = Number(operation.rpcArgs.payment_record.amount);
                if (amount > Domain.obligationTotal(remote) - Number(remote.paid_amount)) throw new Error("El saldo remoto es menor que el pago local. Conservá el servidor y registrá el saldo correcto.");
                const localObligation = { ...remote, paid_amount: Number(remote.paid_amount) + amount, status: Number(remote.paid_amount) + amount === Domain.obligationTotal(remote) ? "paid" : "partial", version: Number(remote.version) + 1, updated_at: new Date().toISOString(), updated_by: this.userId };
                await this.storage.put("obligations", localObligation);
                await this.storage.queue({ ...operation, operationId: Core.createId(), idempotencyKey: `${operation.idempotencyKey}:retry:${Date.now()}`, rpcArgs: { ...operation.rpcArgs, obligation_version: remote.version, operation_key: `${operation.rpcArgs.operation_key}:retry:${Date.now()}` }, localRecords: [...operation.localRecords.filter(item => item.entity !== "obligations"), { entity: "obligations", record: localObligation }], state: "pending", attempts: 0, createdAt: new Date().toISOString() });
            } else if (operation.rpcName === "finance_update_payment") {
                const remotePayment = await this.fetchOne("payments", operation.rpcArgs.payment_record.id);
                const remoteObligation = remotePayment ? await this.fetchOne("obligations", remotePayment.obligation_id) : null;
                if (!remotePayment || !remoteObligation || remotePayment.status === "void" || remoteObligation.status === "void") throw new Error("El pago o compromiso remoto ya no admite esta corrección.");
                const desiredPayment = operation.rpcArgs.payment_record;
                const paidWithout = Number(remoteObligation.paid_amount) - Number(remotePayment.amount);
                const corrected = paidWithout + (desiredPayment.status === "void" ? 0 : Number(desiredPayment.amount));
                if (corrected < 0 || corrected > Domain.obligationTotal(remoteObligation)) throw new Error("La corrección local ya no cabe en el saldo remoto. Conservá el servidor y corregí nuevamente.");
                const payment = { ...desiredPayment, created_at: remotePayment.created_at, created_by: remotePayment.created_by, version: Number(remotePayment.version) + 1, updated_at: new Date().toISOString(), updated_by: this.userId };
                const transactions = [];
                for (const source of operation.rpcArgs.transaction_records) {
                    const remote = await this.fetchOne("transactions", source.id);
                    transactions.push(remote ? { ...source, created_at: remote.created_at, created_by: remote.created_by, version: Number(remote.version) + 1, updated_at: new Date().toISOString(), updated_by: this.userId } : { ...source, version: 1 });
                }
                const obligation = { ...remoteObligation, paid_amount: corrected, status: corrected === Domain.obligationTotal(remoteObligation) ? "paid" : corrected ? "partial" : "pending", version: Number(remoteObligation.version) + 1, updated_at: new Date().toISOString(), updated_by: this.userId };
                await this.storage.atomic([{ store: "payments", value: payment }, ...transactions.map(value => ({ store: "transactions", value })), { store: "obligations", value: obligation }]);
                await this.storage.queue({ ...operation, operationId: Core.createId(), idempotencyKey: `${operation.idempotencyKey}:retry:${Date.now()}`, rpcArgs: { ...operation.rpcArgs, operation_key: `${operation.rpcArgs.operation_key}:retry:${Date.now()}`, payment_record: payment, transaction_records: transactions, payment_version: remotePayment.version, obligation_version: remoteObligation.version }, localRecords: [{ entity: "payments", record: payment }, ...transactions.map(record => ({ entity: "transactions", record })), { entity: "obligations", record: obligation }], state: "pending", attempts: 0, createdAt: new Date().toISOString() });
            } else {
                throw new Error("Esta operación debe conservar la versión del servidor y volver a intentarse desde los datos actualizados.");
            }
            await this.storage.delete("conflicts", conflict.operationId);
            return this.flush();
        }

        async exportData() {
            const snapshot = await this.snapshot();
            delete snapshot.conflicts;
            return { schema: "atlas-so-finance-base", version: "0.10", workspaceId: this.workspaceId, exportedAt: new Date().toISOString(), data: snapshot };
        }

        close() { this.channel?.close(); this.storage.close(); }
    }

    root.AtlasFinanceRepository = Object.freeze({ FinanceRepository, ENTITIES, isMissingSchema, isConnectivityError });
})(typeof window !== "undefined" ? window : globalThis);
