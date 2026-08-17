-- ATLAS SO v0.10 · Etapa 1 — Base financiera y migración v0.9.
-- Migración aditiva. Validar en un Supabase aislado antes de ejecutar en producción.

begin;

create extension if not exists pgcrypto;

-- v0.10 puede instalarse sobre una base ATLAS anterior que todavía no haya
-- recibido el helper de privacidad incorporado en v0.8. La definición es
-- idéntica a la migración original y por eso también es segura al reejecutar.
create or replace function public.is_hr_data_key(target_key text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
    select lower(coalesce(target_key, '')) like 'atlashr%';
$$;

create or replace function public.finance_is_workspace_owner(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.workspaces workspace
        where workspace.id = target_workspace
          and workspace.owner_id = auth.uid()
    );
$$;

revoke all on function public.finance_is_workspace_owner(uuid) from public, anon;
grant execute on function public.finance_is_workspace_owner(uuid) to authenticated;

create or replace function public.is_finance_data_key(target_key text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
    select lower(coalesce(target_key, '')) in (
        'atlastransactions',
        'atlasobligations',
        'atlasreceiptdeletes'
    ) or lower(coalesce(target_key, '')) like 'atlasfinance%';
$$;

create or replace function public.can_access_app_data(target_workspace uuid, target_key text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
    select public.is_workspace_member(target_workspace)
       and (not public.is_hr_data_key(target_key) or public.is_hr_admin())
       and (not public.is_finance_data_key(target_key)
            or public.finance_is_workspace_owner(target_workspace));
$$;

revoke all on function public.is_finance_data_key(text) from public, anon;
revoke all on function public.can_access_app_data(uuid, text) from public, anon;
grant execute on function public.is_finance_data_key(text) to authenticated;
grant execute on function public.can_access_app_data(uuid, text) to authenticated;

create table if not exists public.finance_contexts (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    kind text not null check (kind in ('personal', 'business')),
    name text not null check (char_length(trim(name)) between 1 and 80),
    description text not null default '' check (char_length(description) <= 500),
    status text not null default 'active' check (status in ('active', 'archived')),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    version integer not null default 1 check (version > 0),
    unique (workspace_id, id)
);

create unique index if not exists finance_contexts_one_personal_per_workspace
    on public.finance_contexts (workspace_id)
    where kind = 'personal';

create unique index if not exists finance_contexts_active_name
    on public.finance_contexts (workspace_id, lower(name))
    where status = 'active';

create table if not exists public.finance_accounts (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    name text not null check (char_length(trim(name)) between 1 and 80),
    account_type text not null check (account_type in (
        'cash', 'bank', 'wallet', 'debit_card', 'credit_card',
        'business_cash', 'savings', 'investment', 'liability', 'other'
    )),
    currency text not null default 'PYG' check (currency = 'PYG'),
    opening_balance bigint not null default 0,
    opened_on date not null default current_date,
    notes text not null default '' check (char_length(notes) <= 500),
    status text not null default 'active' check (status in ('active', 'archived')),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id)
        references public.finance_contexts(workspace_id, id) on delete restrict,
    unique (workspace_id, context_id, id)
);

create unique index if not exists finance_accounts_active_name
    on public.finance_accounts (workspace_id, context_id, lower(name))
    where status = 'active';

create index if not exists finance_accounts_context_status
    on public.finance_accounts (workspace_id, context_id, status, opened_on);

create table if not exists public.finance_categories (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    parent_id uuid,
    name text not null check (char_length(trim(name)) between 1 and 80),
    flow_type text not null default 'both' check (flow_type in ('income', 'expense', 'both')),
    color text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
    icon text not null default '●' check (char_length(icon) between 1 and 12),
    sort_order integer not null default 0,
    status text not null default 'active' check (status in ('active', 'archived')),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id)
        references public.finance_contexts(workspace_id, id) on delete cascade,
    unique (workspace_id, context_id, id),
    foreign key (workspace_id, context_id, parent_id)
        references public.finance_categories(workspace_id, context_id, id) on delete restrict,
    check (parent_id is null or parent_id <> id)
);

create unique index if not exists finance_categories_active_name
    on public.finance_categories (
        workspace_id,
        context_id,
        coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
        lower(name)
    )
    where status = 'active';

create index if not exists finance_categories_context_order
    on public.finance_categories (workspace_id, context_id, status, sort_order, name);

create table if not exists public.finance_payment_methods (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    account_id uuid,
    name text not null check (char_length(trim(name)) between 1 and 80),
    method_type text not null check (method_type in (
        'cash', 'transfer', 'debit_card', 'credit_card', 'qr',
        'wallet', 'deposit', 'cheque', 'other'
    )),
    notes text not null default '' check (char_length(notes) <= 500),
    status text not null default 'active' check (status in ('active', 'archived')),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id)
        references public.finance_contexts(workspace_id, id) on delete cascade,
    foreign key (workspace_id, context_id, account_id)
        references public.finance_accounts(workspace_id, context_id, id) on delete restrict,
    unique (workspace_id, context_id, id)
);

create unique index if not exists finance_payment_methods_active_name
    on public.finance_payment_methods (workspace_id, context_id, lower(name))
    where status = 'active';

create table if not exists public.finance_recurrences (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    template_type text not null check (template_type in ('transaction', 'obligation')),
    name text not null check (char_length(trim(name)) between 1 and 120),
    frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
    interval_count integer not null default 1 check (interval_count between 1 and 52),
    starts_on date not null,
    ends_on date,
    next_on date not null,
    template jsonb not null default '{}'::jsonb check (jsonb_typeof(template) = 'object'),
    status text not null default 'active' check (status in ('active', 'archived')),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id)
        references public.finance_contexts(workspace_id, id) on delete cascade,
    unique (workspace_id, context_id, id),
    check (ends_on is null or ends_on >= starts_on),
    check (next_on >= starts_on)
);

create or replace function public.finance_validate_category_parent()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
    parent_parent_id uuid;
    parent_status text;
begin
    if new.parent_id is null then return new; end if;
    select parent_id, status into parent_parent_id, parent_status
    from public.finance_categories
    where workspace_id = new.workspace_id
      and context_id = new.context_id
      and id = new.parent_id;
    if not found or parent_status <> 'active' then
        raise exception 'finance_category_parent_invalid' using errcode = '23503';
    end if;
    if parent_parent_id is not null then
        raise exception 'finance_category_depth_exceeded' using errcode = '23514';
    end if;
    return new;
end;
$$;

revoke all on function public.finance_validate_category_parent() from public, anon, authenticated;
drop trigger if exists finance_validate_category_parent on public.finance_categories;
create trigger finance_validate_category_parent
before insert or update on public.finance_categories
for each row execute function public.finance_validate_category_parent();

create table if not exists public.finance_migration_runs (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    context_id uuid not null,
    account_id uuid not null,
    source_version text not null default 'v0.9',
    source_checksum text not null check (char_length(source_checksum) between 16 and 128),
    state text not null default 'detected' check (state in (
        'detected', 'previewed', 'running', 'completed',
        'completed_with_errors', 'failed', 'cancelled'
    )),
    source_counts jsonb not null default '{}'::jsonb,
    source_totals jsonb not null default '{}'::jsonb,
    target_counts jsonb not null default '{}'::jsonb,
    target_totals jsonb not null default '{}'::jsonb,
    error_count integer not null default 0 check (error_count >= 0),
    report jsonb not null default '{}'::jsonb,
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    foreign key (workspace_id, context_id)
        references public.finance_contexts(workspace_id, id) on delete restrict,
    foreign key (workspace_id, context_id, account_id)
        references public.finance_accounts(workspace_id, context_id, id) on delete restrict,
    unique (workspace_id, source_version, source_checksum)
);

create table if not exists public.finance_transactions (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    account_id uuid not null,
    category_id uuid,
    payment_method_id uuid,
    operation_group_id uuid not null default gen_random_uuid(),
    operation_kind text not null default 'expense' constraint finance_transactions_operation_kind_v010 check (operation_kind in (
        'income', 'expense', 'transfer', 'adjustment', 'owner_contribution',
        'owner_withdrawal', 'refund', 'collection', 'payment'
    )),
    operation_leg text not null default 'single' check (operation_leg in ('single', 'source', 'destination')),
    transaction_type text not null check (transaction_type in ('income', 'expense')),
    reporting_effect text not null default 'expense' constraint finance_transactions_reporting_v010 check (reporting_effect in ('income', 'expense', 'neutral')),
    balance_delta bigint not null,
    status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'void')),
    occurred_at timestamptz not null,
    amount bigint not null check (amount > 0),
    description text not null check (char_length(trim(description)) between 1 and 160),
    counterparty text not null default '' check (char_length(counterparty) <= 120),
    tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array'),
    note text not null default '' check (char_length(note) <= 1000),
    related_obligation_id uuid,
    related_payment_id uuid,
    void_reason text not null default '' check (char_length(void_reason) <= 300),
    voided_at timestamptz,
    legacy_source text,
    legacy_id text,
    legacy_payment_id text,
    idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
    migration_run_id uuid references public.finance_migration_runs(id) on delete set null,
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id, account_id)
        references public.finance_accounts(workspace_id, context_id, id) on delete restrict,
    foreign key (workspace_id, context_id, category_id)
        references public.finance_categories(workspace_id, context_id, id) on delete restrict,
    constraint finance_transactions_payment_method_v010 foreign key (workspace_id, context_id, payment_method_id)
        references public.finance_payment_methods(workspace_id, context_id, id) on delete restrict,
    unique (workspace_id, idempotency_key),
    unique (workspace_id, context_id, id),
    constraint finance_transactions_void_v010 check ((status = 'void' and char_length(trim(void_reason)) > 0 and voided_at is not null) or status <> 'void'),
    check (balance_delta <> 0)
);

create index if not exists finance_transactions_month
    on public.finance_transactions (workspace_id, context_id, occurred_at desc, id desc);

create unique index if not exists finance_transactions_legacy_payment
    on public.finance_transactions (workspace_id, legacy_payment_id)
    where legacy_payment_id is not null;

create table if not exists public.finance_obligations (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    account_id uuid,
    category_id uuid,
    recurrence_id uuid,
    obligation_type text not null default 'payable' check (obligation_type in (
        'payable', 'receivable', 'loan', 'installment', 'card', 'recurring'
    )),
    direction text not null default 'payable' check (direction in ('payable', 'receivable')),
    name text not null check (char_length(trim(name)) between 1 and 120),
    counterparty text not null default '' check (char_length(counterparty) <= 120),
    principal_amount bigint not null check (principal_amount > 0),
    interest_amount bigint not null default 0 check (interest_amount >= 0),
    surcharge_amount bigint not null default 0 check (surcharge_amount >= 0),
    paid_amount bigint not null default 0 check (paid_amount >= 0),
    due_date date not null,
    frequency text not null default 'once' check (frequency in ('once', 'weekly', 'monthly', 'quarterly', 'yearly', 'installment')),
    installment_number integer check (installment_number is null or installment_number > 0),
    installment_total integer check (installment_total is null or installment_total > 1),
    status text not null default 'pending' check (status in ('pending', 'partial', 'paid', 'void')),
    reminder_days integer not null default 3 check (reminder_days between 0 and 365),
    note text not null default '' check (char_length(note) <= 1000),
    void_reason text not null default '' check (char_length(void_reason) <= 300),
    voided_at timestamptz,
    legacy_source text,
    legacy_id text,
    idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
    migration_run_id uuid references public.finance_migration_runs(id) on delete set null,
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id, account_id)
        references public.finance_accounts(workspace_id, context_id, id) on delete restrict,
    constraint finance_obligations_category_v010 foreign key (workspace_id, context_id, category_id)
        references public.finance_categories(workspace_id, context_id, id) on delete restrict,
    constraint finance_obligations_recurrence_v010 foreign key (workspace_id, context_id, recurrence_id)
        references public.finance_recurrences(workspace_id, context_id, id) on delete restrict,
    unique (workspace_id, idempotency_key),
    unique (workspace_id, context_id, id),
    check (
        (obligation_type <> 'installment' and installment_number is null and installment_total is null)
        or
        (obligation_type = 'installment' and installment_number between 1 and installment_total)
    ),
    constraint finance_obligations_void_v010 check ((status = 'void' and char_length(trim(void_reason)) > 0 and voided_at is not null) or status <> 'void'),
    constraint finance_obligations_paid_total_v010 check (paid_amount <= principal_amount + interest_amount + surcharge_amount),
    check ((obligation_type = 'receivable' and direction = 'receivable') or (obligation_type <> 'receivable' and direction = 'payable'))
);

create index if not exists finance_obligations_due
    on public.finance_obligations (workspace_id, context_id, status, due_date, id);

create or replace function public.finance_validate_obligation_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare linked_type text;
begin
    if new.obligation_type = 'card' and new.account_id is null then
        raise exception 'finance_card_account_required' using errcode = '23514';
    end if;
    if new.account_id is not null and new.obligation_type in ('loan', 'card') then
        select account_type into linked_type from public.finance_accounts
        where workspace_id = new.workspace_id and context_id = new.context_id and id = new.account_id;
        if linked_type is null or linked_type not in ('credit_card', 'liability') then
            raise exception 'finance_liability_account_required' using errcode = '23514';
        end if;
    end if;
    return new;
end;
$$;

revoke all on function public.finance_validate_obligation_account() from public, anon, authenticated;
drop trigger if exists finance_validate_obligation_account on public.finance_obligations;
create trigger finance_validate_obligation_account
before insert or update on public.finance_obligations
for each row execute function public.finance_validate_obligation_account();

create table if not exists public.finance_payments (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    obligation_id uuid not null,
    account_id uuid not null,
    linked_transaction_id uuid,
    payment_method_id uuid,
    amount bigint not null check (amount > 0),
    paid_on date not null,
    reference text not null default '' check (char_length(reference) <= 160),
    note text not null default '' check (char_length(note) <= 1000),
    status text not null default 'confirmed' constraint finance_payments_status_v010 check (status in ('confirmed', 'void')),
    void_reason text not null default '' check (char_length(void_reason) <= 300),
    voided_at timestamptz,
    legacy_id text,
    idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
    migration_run_id uuid references public.finance_migration_runs(id) on delete set null,
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id, obligation_id)
        references public.finance_obligations(workspace_id, context_id, id) on delete restrict,
    foreign key (workspace_id, context_id, account_id)
        references public.finance_accounts(workspace_id, context_id, id) on delete restrict,
    foreign key (workspace_id, context_id, linked_transaction_id)
        references public.finance_transactions(workspace_id, context_id, id) on delete restrict,
    constraint finance_payments_method_v010 foreign key (workspace_id, context_id, payment_method_id)
        references public.finance_payment_methods(workspace_id, context_id, id) on delete restrict,
    unique (workspace_id, idempotency_key),
    unique (workspace_id, context_id, id),
    constraint finance_payments_void_v010 check ((status = 'void' and char_length(trim(void_reason)) > 0 and voided_at is not null) or status = 'confirmed')
);

create index if not exists finance_payments_obligation
    on public.finance_payments (workspace_id, context_id, obligation_id, paid_on, id);

create table if not exists public.finance_attachments (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    payment_id uuid,
    transaction_id uuid,
    bucket_id text not null default 'atlas-finance-files' check (bucket_id = 'atlas-finance-files'),
    storage_path text,
    original_name text not null check (char_length(trim(original_name)) between 1 and 180),
    mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    byte_size bigint not null check (byte_size between 0 and 10485760),
    sync_state text not null default 'local_pending' check (sync_state in ('local_pending', 'remote', 'removed')),
    legacy_id text,
    idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
    migration_run_id uuid references public.finance_migration_runs(id) on delete set null,
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id, payment_id)
        references public.finance_payments(workspace_id, context_id, id) on delete restrict,
    constraint finance_attachments_transaction_v010 foreign key (workspace_id, context_id, transaction_id)
        references public.finance_transactions(workspace_id, context_id, id) on delete restrict,
    unique (workspace_id, idempotency_key),
    check (storage_path is null or storage_path like workspace_id::text || '/finance/%'),
    constraint finance_attachments_owner_v010 check ((payment_id is not null)::integer + (transaction_id is not null)::integer = 1)
);

create table if not exists public.finance_budgets (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    category_id uuid not null,
    month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    planned_amount bigint not null check (planned_amount > 0),
    alert_percent integer not null default 80 check (alert_percent between 1 and 100),
    notes text not null default '' check (char_length(notes) <= 500),
    status text not null default 'active' check (status in ('active', 'archived')),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id, category_id)
        references public.finance_categories(workspace_id, context_id, id) on delete restrict,
    unique (workspace_id, context_id, category_id, month),
    unique (workspace_id, context_id, id)
);

create index if not exists finance_budgets_month
    on public.finance_budgets (workspace_id, context_id, month, status);

create table if not exists public.finance_goals (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    account_id uuid,
    name text not null check (char_length(trim(name)) between 1 and 120),
    target_amount bigint not null check (target_amount > 0),
    target_date date,
    notes text not null default '' check (char_length(notes) <= 500),
    status text not null default 'active' check (status in ('active', 'completed', 'archived')),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id)
        references public.finance_contexts(workspace_id, id) on delete cascade,
    foreign key (workspace_id, context_id, account_id)
        references public.finance_accounts(workspace_id, context_id, id) on delete restrict,
    unique (workspace_id, context_id, id)
);

create table if not exists public.finance_goal_entries (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    goal_id uuid not null,
    entry_type text not null check (entry_type in ('contribution', 'withdrawal')),
    amount bigint not null check (amount > 0),
    occurred_on date not null,
    note text not null default '' check (char_length(note) <= 500),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id, goal_id)
        references public.finance_goals(workspace_id, context_id, id) on delete restrict,
    unique (workspace_id, context_id, id)
);

create index if not exists finance_goal_entries_goal
    on public.finance_goal_entries (workspace_id, context_id, goal_id, occurred_on, id);

create table if not exists public.finance_assets (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    asset_class text not null check (asset_class in ('asset', 'liability')),
    asset_type text not null check (asset_type in (
        'cash', 'vehicle', 'property', 'equipment', 'inventory',
        'investment', 'loan', 'card', 'other'
    )),
    name text not null check (char_length(trim(name)) between 1 and 120),
    opening_value bigint not null check (opening_value > 0),
    valued_on date not null,
    notes text not null default '' check (char_length(notes) <= 500),
    status text not null default 'active' check (status in ('active', 'archived')),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id)
        references public.finance_contexts(workspace_id, id) on delete cascade,
    unique (workspace_id, context_id, id)
);

create table if not exists public.finance_asset_valuations (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    asset_id uuid not null,
    value bigint not null check (value >= 0),
    valued_on date not null,
    source text not null default 'Manual' check (char_length(trim(source)) between 1 and 120),
    note text not null default '' check (char_length(note) <= 500),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id, asset_id)
        references public.finance_assets(workspace_id, context_id, id) on delete restrict,
    unique (workspace_id, context_id, asset_id, valued_on),
    unique (workspace_id, context_id, id)
);

create table if not exists public.finance_monthly_closes (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    version_number integer not null check (version_number > 0),
    state text not null default 'closed' check (state in ('closed', 'reopened')),
    snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
    previous_close_id uuid references public.finance_monthly_closes(id) on delete restrict,
    closed_at timestamptz not null default now(),
    reopened_at timestamptz,
    reopen_reason text not null default '' check (char_length(reopen_reason) <= 500),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id)
        references public.finance_contexts(workspace_id, id) on delete restrict,
    unique (workspace_id, context_id, month, version_number),
    unique (workspace_id, context_id, id),
    check ((state = 'reopened' and reopened_at is not null and char_length(trim(reopen_reason)) > 0) or state = 'closed')
);

drop index if exists public.finance_monthly_closes_one_active;
create index if not exists finance_monthly_closes_history
    on public.finance_monthly_closes (workspace_id, context_id, month, version_number desc);

create table if not exists public.finance_saved_filters (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    context_id uuid not null,
    name text not null check (char_length(trim(name)) between 1 and 80),
    filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
    status text not null default 'active' check (status in ('active', 'archived')),
    created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz,
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, context_id)
        references public.finance_contexts(workspace_id, id) on delete cascade,
    unique (workspace_id, context_id, id)
);

create unique index if not exists finance_saved_filters_active_name
    on public.finance_saved_filters (workspace_id, context_id, lower(name))
    where status = 'active';

-- Compatibilidad si la Etapa 1 se ejecutó previamente en un entorno aislado.
alter table public.finance_transactions add column if not exists payment_method_id uuid;
alter table public.finance_transactions add column if not exists operation_group_id uuid;
alter table public.finance_transactions add column if not exists operation_kind text;
alter table public.finance_transactions add column if not exists operation_leg text;
alter table public.finance_transactions add column if not exists reporting_effect text;
alter table public.finance_transactions add column if not exists balance_delta bigint;
alter table public.finance_transactions add column if not exists counterparty text;
alter table public.finance_transactions add column if not exists tags jsonb;
alter table public.finance_transactions add column if not exists related_obligation_id uuid;
alter table public.finance_transactions add column if not exists related_payment_id uuid;
alter table public.finance_transactions add column if not exists void_reason text;
alter table public.finance_transactions add column if not exists voided_at timestamptz;
update public.finance_transactions set
    operation_group_id = coalesce(operation_group_id, id),
    operation_kind = coalesce(operation_kind, transaction_type),
    operation_leg = coalesce(operation_leg, case
        when operation_kind = 'transfer' and balance_delta < 0 then 'source'
        when operation_kind = 'transfer' then 'destination'
        else 'single'
    end),
    reporting_effect = coalesce(reporting_effect, transaction_type),
    balance_delta = coalesce(balance_delta, case when transaction_type = 'income' then amount else -amount end),
    counterparty = coalesce(counterparty, ''), tags = coalesce(tags, '[]'::jsonb),
    void_reason = coalesce(void_reason, '')
where operation_group_id is null or operation_kind is null or operation_leg is null or reporting_effect is null
   or balance_delta is null or counterparty is null or tags is null or void_reason is null;
alter table public.finance_transactions alter column operation_group_id set not null;
alter table public.finance_transactions alter column operation_kind set not null;
alter table public.finance_transactions alter column operation_leg set not null;
alter table public.finance_transactions alter column reporting_effect set not null;
alter table public.finance_transactions alter column balance_delta set not null;
alter table public.finance_transactions alter column counterparty set default '';
alter table public.finance_transactions alter column tags set default '[]'::jsonb;
alter table public.finance_transactions alter column void_reason set default '';

alter table public.finance_obligations add column if not exists category_id uuid;
alter table public.finance_obligations add column if not exists recurrence_id uuid;
alter table public.finance_obligations add column if not exists obligation_type text;
alter table public.finance_obligations add column if not exists direction text;
alter table public.finance_obligations add column if not exists counterparty text;
alter table public.finance_obligations add column if not exists interest_amount bigint;
alter table public.finance_obligations add column if not exists surcharge_amount bigint;
alter table public.finance_obligations add column if not exists reminder_days integer;
alter table public.finance_obligations add column if not exists note text;
alter table public.finance_obligations add column if not exists void_reason text;
alter table public.finance_obligations add column if not exists voided_at timestamptz;
alter table public.finance_obligations alter column account_id drop not null;
update public.finance_obligations set
    obligation_type = coalesce(obligation_type, case when frequency = 'installment' then 'installment' else 'payable' end),
    direction = coalesce(direction, 'payable'), counterparty = coalesce(counterparty, ''),
    interest_amount = coalesce(interest_amount, 0), surcharge_amount = coalesce(surcharge_amount, 0),
    reminder_days = coalesce(reminder_days, 3), note = coalesce(note, ''), void_reason = coalesce(void_reason, '')
where obligation_type is null or direction is null or counterparty is null or interest_amount is null or surcharge_amount is null
   or reminder_days is null or note is null or void_reason is null;
update public.finance_obligations set
    void_reason = case when char_length(trim(void_reason)) > 0 then void_reason else 'Anulación migrada' end,
    voided_at = coalesce(voided_at, updated_at)
where status = 'void';
alter table public.finance_obligations alter column obligation_type set not null;
alter table public.finance_obligations alter column direction set not null;
alter table public.finance_obligations alter column interest_amount set default 0;
alter table public.finance_obligations alter column interest_amount set not null;
alter table public.finance_obligations alter column surcharge_amount set default 0;
alter table public.finance_obligations alter column surcharge_amount set not null;
alter table public.finance_obligations alter column counterparty set default '';
alter table public.finance_obligations alter column reminder_days set default 3;
alter table public.finance_obligations alter column note set default '';
alter table public.finance_obligations alter column void_reason set default '';

alter table public.finance_payments add column if not exists payment_method_id uuid;
alter table public.finance_payments add column if not exists status text;
alter table public.finance_payments add column if not exists void_reason text;
alter table public.finance_payments add column if not exists voided_at timestamptz;
update public.finance_payments set status = 'confirmed' where status is null;
update public.finance_payments set void_reason = '' where void_reason is null;
alter table public.finance_payments alter column status set not null;
alter table public.finance_payments alter column status set default 'confirmed';
alter table public.finance_payments alter column void_reason set default '';
alter table public.finance_payments alter column void_reason set not null;

alter table public.finance_attachments add column if not exists transaction_id uuid;
alter table public.finance_attachments alter column payment_id drop not null;
alter table public.finance_budgets add column if not exists archived_at timestamptz;
alter table public.finance_goals add column if not exists archived_at timestamptz;
alter table public.finance_assets add column if not exists archived_at timestamptz;
alter table public.finance_saved_filters add column if not exists archived_at timestamptz;

do $$
declare old_constraint text;
begin
    for old_constraint in
        select conname from pg_constraint
        where conrelid = 'public.finance_obligations'::regclass and contype = 'c'
          and (pg_get_constraintdef(oid) ilike '%frequency%'
               or pg_get_constraintdef(oid) ilike '%installment_number%')
    loop
        execute format('alter table public.finance_obligations drop constraint %I', old_constraint);
    end loop;
    alter table public.finance_obligations
        add constraint finance_obligations_frequency_v010
            check (frequency in ('once', 'weekly', 'monthly', 'quarterly', 'yearly', 'installment')),
        add constraint finance_obligations_installment_v010
            check (
                (obligation_type <> 'installment' and installment_number is null and installment_total is null)
                or (obligation_type = 'installment' and installment_number between 1 and installment_total)
            );
end;
$$;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'finance_transactions_payment_method_v010') then
        alter table public.finance_transactions add constraint finance_transactions_payment_method_v010
            foreign key (workspace_id, context_id, payment_method_id)
            references public.finance_payment_methods(workspace_id, context_id, id) on delete restrict;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_transactions_obligation_v010') then
        alter table public.finance_transactions add constraint finance_transactions_obligation_v010
            foreign key (workspace_id, context_id, related_obligation_id)
            references public.finance_obligations(workspace_id, context_id, id) on delete restrict;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_obligations_category_v010') then
        alter table public.finance_obligations add constraint finance_obligations_category_v010
            foreign key (workspace_id, context_id, category_id)
            references public.finance_categories(workspace_id, context_id, id) on delete restrict;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_obligations_recurrence_v010') then
        alter table public.finance_obligations add constraint finance_obligations_recurrence_v010
            foreign key (workspace_id, context_id, recurrence_id)
            references public.finance_recurrences(workspace_id, context_id, id) on delete restrict;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_payments_method_v010') then
        alter table public.finance_payments add constraint finance_payments_method_v010
            foreign key (workspace_id, context_id, payment_method_id)
            references public.finance_payment_methods(workspace_id, context_id, id) on delete restrict;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_attachments_transaction_v010') then
        alter table public.finance_attachments add constraint finance_attachments_transaction_v010
            foreign key (workspace_id, context_id, transaction_id)
            references public.finance_transactions(workspace_id, context_id, id) on delete restrict;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_transactions_operation_kind_v010') then
        alter table public.finance_transactions add constraint finance_transactions_operation_kind_v010
            check (operation_kind in ('income', 'expense', 'transfer', 'adjustment', 'owner_contribution', 'owner_withdrawal', 'refund', 'collection', 'payment'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_transactions_reporting_v010') then
        alter table public.finance_transactions add constraint finance_transactions_reporting_v010
            check (reporting_effect in ('income', 'expense', 'neutral') and balance_delta <> 0 and jsonb_typeof(tags) = 'array');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_transactions_leg_v010') then
        alter table public.finance_transactions add constraint finance_transactions_leg_v010
            check (operation_leg in ('single', 'source', 'destination'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_payments_status_v010') then
        alter table public.finance_payments add constraint finance_payments_status_v010
            check (status in ('confirmed', 'void'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_transactions_void_v010' and conrelid = 'public.finance_transactions'::regclass) then
        alter table public.finance_transactions add constraint finance_transactions_void_v010
            check ((status = 'void' and char_length(trim(void_reason)) > 0 and voided_at is not null) or status <> 'void');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_obligations_void_v010' and conrelid = 'public.finance_obligations'::regclass) then
        alter table public.finance_obligations add constraint finance_obligations_void_v010
            check ((status = 'void' and char_length(trim(void_reason)) > 0 and voided_at is not null) or status <> 'void');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_obligations_paid_total_v010' and conrelid = 'public.finance_obligations'::regclass) then
        alter table public.finance_obligations add constraint finance_obligations_paid_total_v010
            check (interest_amount >= 0 and surcharge_amount >= 0 and paid_amount <= principal_amount + interest_amount + surcharge_amount);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_payments_void_v010' and conrelid = 'public.finance_payments'::regclass) then
        alter table public.finance_payments add constraint finance_payments_void_v010
            check ((status = 'void' and char_length(trim(void_reason)) > 0 and voided_at is not null) or status = 'confirmed');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'finance_attachments_owner_v010') then
        alter table public.finance_attachments add constraint finance_attachments_owner_v010
            check ((payment_id is not null)::integer + (transaction_id is not null)::integer = 1);
    end if;
end;
$$;

create table if not exists public.finance_migration_errors (
    id bigint generated always as identity primary key,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    migration_run_id uuid not null references public.finance_migration_runs(id) on delete cascade,
    source_type text not null check (source_type in ('transaction', 'obligation', 'payment', 'attachment')),
    source_id text,
    field_name text,
    error_code text not null,
    message text not null,
    source_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists finance_migration_errors_run
    on public.finance_migration_errors (workspace_id, migration_run_id, id);

create table if not exists public.finance_audit_log (
    id bigint generated always as identity primary key,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    context_id uuid,
    entity_type text not null,
    entity_id uuid not null,
    action text not null check (action in ('create', 'update', 'archive', 'restore', 'import', 'delete')),
    before_value jsonb,
    after_value jsonb,
    reason text not null default '',
    operation_key text,
    actor_id uuid references auth.users(id) on delete set null,
    session_id text,
    occurred_at timestamptz not null default now()
);

alter table public.finance_audit_log add column if not exists session_id text;

create index if not exists finance_audit_entity
    on public.finance_audit_log (workspace_id, context_id, entity_type, entity_id, occurred_at desc);

do $$
declare action_constraint text;
begin
    for action_constraint in
        select conname from pg_constraint
        where conrelid = 'public.finance_audit_log'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%action%'
    loop
        execute format('alter table public.finance_audit_log drop constraint %I', action_constraint);
    end loop;
    alter table public.finance_audit_log add constraint finance_audit_action_v010
        check (action in ('create', 'update', 'archive', 'restore', 'import', 'delete'));
end;
$$;

create or replace function public.finance_touch_record()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.version := old.version + 1;
    return new;
end;
$$;

revoke all on function public.finance_touch_record() from public, anon, authenticated;

do $$
declare
    target_table text;
begin
    foreach target_table in array array[
        'finance_contexts', 'finance_accounts', 'finance_categories', 'finance_payment_methods',
        'finance_transactions', 'finance_obligations', 'finance_payments',
        'finance_attachments', 'finance_recurrences', 'finance_budgets',
        'finance_goals', 'finance_goal_entries', 'finance_assets',
        'finance_asset_valuations', 'finance_monthly_closes', 'finance_saved_filters'
    ] loop
        execute format('drop trigger if exists finance_touch_record on public.%I', target_table);
        execute format(
            'create trigger finance_touch_record before update on public.%I '
            'for each row execute function public.finance_touch_record()',
            target_table
        );
    end loop;
end;
$$;

create or replace function public.finance_touch_archive()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    if new.status = 'archived' and old.status <> 'archived' then
        new.archived_at := coalesce(new.archived_at, now());
    elsif new.status <> 'archived' and old.status = 'archived' then
        new.archived_at := null;
    end if;
    return new;
end;
$$;

revoke all on function public.finance_touch_archive() from public, anon, authenticated;

do $$
declare
    target_table text;
begin
    foreach target_table in array array[
        'finance_contexts', 'finance_accounts', 'finance_categories',
        'finance_payment_methods', 'finance_recurrences', 'finance_budgets',
        'finance_goals', 'finance_assets', 'finance_saved_filters'
    ] loop
        execute format('drop trigger if exists finance_touch_archive on public.%I', target_table);
        execute format(
            'create trigger finance_touch_archive before update on public.%I '
            'for each row execute function public.finance_touch_archive()',
            target_table
        );
    end loop;
end;
$$;

create or replace function public.finance_audit_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    target_action text;
    target_workspace uuid;
    target_context uuid;
    target_id uuid;
begin
    if tg_op = 'INSERT' then
        target_workspace := new.workspace_id;
        target_context := coalesce(
            nullif(to_jsonb(new)->>'context_id', '')::uuid,
            new.id
        );
        target_id := new.id;
        target_action := case
            when nullif(to_jsonb(new)->>'migration_run_id', '') is null then 'create'
            else 'import'
        end;
        insert into public.finance_audit_log (
            workspace_id, context_id, entity_type, entity_id, action,
            before_value, after_value, reason, operation_key, actor_id, session_id
        ) values (
            target_workspace, target_context, tg_table_name, target_id, target_action,
            null, to_jsonb(new), coalesce(nullif(to_jsonb(new)->>'reopen_reason', ''), ''),
            coalesce(to_jsonb(new)->>'idempotency_key', to_jsonb(new)->>'operation_group_id'),
            auth.uid(), auth.jwt()->>'session_id'
        );
        return new;
    end if;

    target_workspace := new.workspace_id;
    target_context := coalesce(
        nullif(to_jsonb(new)->>'context_id', '')::uuid,
        new.id
    );
    target_id := new.id;
    target_action := case
        when to_jsonb(old)->>'status' <> 'archived' and to_jsonb(new)->>'status' = 'archived' then 'archive'
        when to_jsonb(old)->>'status' = 'archived' and to_jsonb(new)->>'status' <> 'archived' then 'restore'
        else 'update'
    end;
    insert into public.finance_audit_log (
        workspace_id, context_id, entity_type, entity_id, action,
        before_value, after_value, reason, operation_key, actor_id, session_id
    ) values (
        target_workspace, target_context, tg_table_name, target_id, target_action,
        to_jsonb(old), to_jsonb(new),
        coalesce(nullif(to_jsonb(new)->>'void_reason', ''), nullif(to_jsonb(new)->>'reopen_reason', ''), ''),
        coalesce(to_jsonb(new)->>'idempotency_key', to_jsonb(new)->>'operation_group_id'),
        auth.uid(), auth.jwt()->>'session_id'
    );
    return new;
end;
$$;

revoke all on function public.finance_audit_record() from public, anon, authenticated;

do $$
declare
    target_table text;
begin
    foreach target_table in array array[
        'finance_contexts', 'finance_accounts', 'finance_categories', 'finance_payment_methods',
        'finance_transactions', 'finance_obligations', 'finance_payments', 'finance_attachments',
        'finance_recurrences', 'finance_budgets', 'finance_goals', 'finance_goal_entries',
        'finance_assets', 'finance_asset_valuations', 'finance_monthly_closes', 'finance_saved_filters'
    ] loop
        execute format('drop trigger if exists finance_audit_record on public.%I', target_table);
        execute format(
            'create trigger finance_audit_record after insert or update on public.%I '
            'for each row execute function public.finance_audit_record()',
            target_table
        );
    end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'atlas-finance-files',
    'atlas-finance-files',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.finance_storage_workspace_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
    folder text := (storage.foldername(object_name))[1];
begin
    if folder is null or folder !~ '^[0-9a-fA-F-]{36}$' then return null; end if;
    return folder::uuid;
exception when others then
    return null;
end;
$$;

revoke all on function public.finance_storage_workspace_id(text) from public, anon;
grant execute on function public.finance_storage_workspace_id(text) to authenticated;

drop policy if exists "atlas_finance_files_select_owner" on storage.objects;
create policy "atlas_finance_files_select_owner" on storage.objects
for select to authenticated using (
    bucket_id = 'atlas-finance-files'
    and public.finance_is_workspace_owner(public.finance_storage_workspace_id(name))
);

drop policy if exists "atlas_finance_files_insert_owner" on storage.objects;
create policy "atlas_finance_files_insert_owner" on storage.objects
for insert to authenticated with check (
    bucket_id = 'atlas-finance-files'
    and public.finance_is_workspace_owner(public.finance_storage_workspace_id(name))
    and (storage.foldername(name))[2] = 'finance'
);

drop policy if exists "atlas_finance_files_update_owner" on storage.objects;
create policy "atlas_finance_files_update_owner" on storage.objects
for update to authenticated using (
    bucket_id = 'atlas-finance-files'
    and public.finance_is_workspace_owner(public.finance_storage_workspace_id(name))
) with check (
    bucket_id = 'atlas-finance-files'
    and public.finance_is_workspace_owner(public.finance_storage_workspace_id(name))
    and (storage.foldername(name))[2] = 'finance'
);

drop policy if exists "atlas_finance_files_delete_owner" on storage.objects;
create policy "atlas_finance_files_delete_owner" on storage.objects
for delete to authenticated using (
    bucket_id = 'atlas-finance-files'
    and public.finance_is_workspace_owner(public.finance_storage_workspace_id(name))
);

do $$
declare
    target_table text;
begin
    foreach target_table in array array[
        'finance_contexts', 'finance_accounts', 'finance_categories', 'finance_payment_methods',
        'finance_migration_runs', 'finance_transactions', 'finance_obligations',
        'finance_payments', 'finance_attachments', 'finance_recurrences', 'finance_budgets',
        'finance_goals', 'finance_goal_entries', 'finance_assets', 'finance_asset_valuations',
        'finance_monthly_closes', 'finance_saved_filters', 'finance_migration_errors'
    ] loop
        execute format('alter table public.%I enable row level security', target_table);
        execute format('drop policy if exists finance_owner_all on public.%I', target_table);
        execute format(
            'create policy finance_owner_all on public.%I for all to authenticated '
            'using (public.finance_is_workspace_owner(workspace_id)) '
            'with check (public.finance_is_workspace_owner(workspace_id))',
            target_table
        );
    end loop;
end;
$$;

alter table public.finance_audit_log enable row level security;
drop policy if exists finance_owner_select_audit on public.finance_audit_log;
create policy finance_owner_select_audit on public.finance_audit_log
for select to authenticated using (public.finance_is_workspace_owner(workspace_id));

grant select, insert, update on public.finance_contexts to authenticated;
grant select, insert, update on public.finance_accounts to authenticated;
grant select, insert, update on public.finance_categories to authenticated;
grant select, insert, update on public.finance_payment_methods to authenticated;
grant select, insert, update on public.finance_migration_runs to authenticated;
grant select, insert, update on public.finance_transactions to authenticated;
grant select, insert, update on public.finance_obligations to authenticated;
grant select, insert, update on public.finance_payments to authenticated;
grant select, insert, update on public.finance_attachments to authenticated;
grant select, insert, update on public.finance_recurrences to authenticated;
grant select, insert, update on public.finance_budgets to authenticated;
grant select, insert, update on public.finance_goals to authenticated;
grant select, insert, update on public.finance_goal_entries to authenticated;
grant select, insert, update on public.finance_assets to authenticated;
grant select, insert, update on public.finance_asset_valuations to authenticated;
grant select, insert, update on public.finance_monthly_closes to authenticated;
grant select, insert, update on public.finance_saved_filters to authenticated;
grant select, insert, update on public.finance_migration_errors to authenticated;
revoke delete on public.finance_contexts, public.finance_accounts, public.finance_categories,
    public.finance_migration_runs, public.finance_transactions, public.finance_obligations,
    public.finance_payment_methods, public.finance_payments, public.finance_attachments,
    public.finance_recurrences, public.finance_budgets, public.finance_goals,
    public.finance_goal_entries, public.finance_assets, public.finance_asset_valuations,
    public.finance_monthly_closes, public.finance_saved_filters, public.finance_migration_errors
    from authenticated;
revoke update, delete on public.finance_monthly_closes from authenticated;
grant usage, select on sequence public.finance_migration_errors_id_seq to authenticated;
grant select on public.finance_audit_log to authenticated;
revoke insert, update, delete on public.finance_audit_log from authenticated;

revoke all on public.finance_contexts from anon;
revoke all on public.finance_accounts from anon;
revoke all on public.finance_categories from anon;
revoke all on public.finance_payment_methods from anon;
revoke all on public.finance_migration_runs from anon;
revoke all on public.finance_transactions from anon;
revoke all on public.finance_obligations from anon;
revoke all on public.finance_payments from anon;
revoke all on public.finance_attachments from anon;
revoke all on public.finance_recurrences from anon;
revoke all on public.finance_budgets from anon;
revoke all on public.finance_goals from anon;
revoke all on public.finance_goal_entries from anon;
revoke all on public.finance_assets from anon;
revoke all on public.finance_asset_valuations from anon;
revoke all on public.finance_monthly_closes from anon;
revoke all on public.finance_saved_filters from anon;
revoke all on public.finance_migration_errors from anon;
revoke all on public.finance_audit_log from anon;

drop function if exists public.finance_seed_personal_context(uuid);

create or replace function public.finance_seed_personal_context(
    target_workspace uuid,
    requested_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    context_result uuid;
begin
    if not public.finance_is_workspace_owner(target_workspace) then
        raise exception 'finance_owner_required' using errcode = '42501';
    end if;

    select id into context_result
    from public.finance_contexts
    where workspace_id = target_workspace and kind = 'personal'
    limit 1;

    if context_result is null then
        insert into public.finance_contexts (
            id, workspace_id, kind, name, created_by, updated_by
        ) values (
            coalesce(requested_id, gen_random_uuid()), target_workspace,
            'personal', 'Personal', auth.uid(), auth.uid()
        ) returning id into context_result;
    end if;

    return context_result;
end;
$$;

revoke all on function public.finance_seed_personal_context(uuid, uuid) from public, anon;
grant execute on function public.finance_seed_personal_context(uuid, uuid) to authenticated;

create or replace function public.finance_v09_positive_amount(source_value text)
returns bigint
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
    parsed numeric;
begin
    if coalesce(source_value, '') !~ '^[0-9]+(?:\.0+)?$' then return null; end if;
    parsed := floor(source_value::numeric);
    if parsed <= 0 or parsed > 90000000000000 then return null; end if;
    return parsed::bigint;
exception when others then
    return null;
end;
$$;

revoke all on function public.finance_v09_positive_amount(text) from public, anon, authenticated;

create or replace function public.finance_import_v09(
    target_workspace uuid,
    target_context uuid,
    target_account uuid,
    target_category uuid,
    source_transactions jsonb,
    source_obligations jsonb,
    source_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    run_id uuid;
    run_state text;
    source_item jsonb;
    source_payment jsonb;
    source_id text;
    payment_id_text text;
    amount_value bigint;
    obligation_amount bigint;
    installment_number_value bigint;
    installment_total_value bigint;
    paid_total bigint;
    date_value date;
    occurred_value timestamptz;
    transaction_kind text;
    frequency_value text;
    obligation_id_value uuid;
    linked_transaction uuid;
    payment_row_id uuid;
    errors_value integer := 0;
    transactions_inserted integer := 0;
    obligations_inserted integer := 0;
    payments_inserted integer := 0;
    attachments_inserted integer := 0;
    source_payments integer := 0;
    source_attachments integer := 0;
    source_income bigint := 0;
    source_expense bigint := 0;
    source_obligations_total bigint := 0;
    source_paid_total bigint := 0;
    target_income bigint := 0;
    target_expense bigint := 0;
    target_obligations_total bigint := 0;
    target_paid_total bigint := 0;
    result_counts jsonb;
    result_totals jsonb;
    result_error_count integer := 0;
begin
    if not public.finance_is_workspace_owner(target_workspace) then
        raise exception 'finance_owner_required' using errcode = '42501';
    end if;

    source_transactions := coalesce(source_transactions, '[]'::jsonb);
    source_obligations := coalesce(source_obligations, '[]'::jsonb);

    if jsonb_typeof(source_transactions) <> 'array'
       or jsonb_typeof(source_obligations) <> 'array' then
        raise exception 'finance_migration_arrays_required' using errcode = '22023';
    end if;

    if jsonb_array_length(coalesce(source_transactions, '[]'::jsonb)) > 20000
       or jsonb_array_length(coalesce(source_obligations, '[]'::jsonb)) > 5000 then
        raise exception 'finance_migration_volume_exceeded' using errcode = '54000';
    end if;

    if source_checksum is null or char_length(source_checksum) not between 16 and 128 then
        raise exception 'finance_migration_checksum_required' using errcode = '22023';
    end if;

    perform 1
    from public.finance_accounts account
    where account.workspace_id = target_workspace
      and account.context_id = target_context
      and account.id = target_account
      and account.status = 'active';
    if not found then
        raise exception 'finance_migration_target_account_invalid' using errcode = '23503';
    end if;

    if target_category is not null then
        perform 1
        from public.finance_categories category
        where category.workspace_id = target_workspace
          and category.context_id = target_context
          and category.id = target_category
          and category.status = 'active';
        if not found then
            raise exception 'finance_migration_target_category_invalid' using errcode = '23503';
        end if;
    end if;

    insert into public.finance_migration_runs (
        workspace_id, context_id, account_id, source_version, source_checksum,
        state, source_counts, created_by
    ) values (
        target_workspace, target_context, target_account, 'v0.9', source_checksum,
        'running', jsonb_build_object(
            'transactions', jsonb_array_length(source_transactions),
            'obligations', jsonb_array_length(source_obligations)
        ), auth.uid()
    )
    on conflict (workspace_id, source_version, source_checksum)
    do update set updated_at = now()
    returning id, state into run_id, run_state;

    if run_state in ('completed', 'completed_with_errors') then
        select target_counts, target_totals, error_count
        into result_counts, result_totals, result_error_count
        from public.finance_migration_runs where id = run_id;
        return jsonb_build_object(
            'runId', run_id,
            'repeated', true,
            'state', run_state,
            'counts', result_counts,
            'totals', result_totals,
            'errors', result_error_count,
            'sourcePreserved', true
        );
    end if;

    delete from public.finance_migration_errors where migration_run_id = run_id;
    update public.finance_migration_runs set state = 'running', updated_at = now() where id = run_id;

    for source_item in select value from jsonb_array_elements(source_transactions)
    loop
        source_id := left(coalesce(nullif(source_item->>'id', ''), encode(digest(source_item::text, 'sha256'), 'hex')), 128);
        payment_id_text := left(nullif(source_item->>'paymentId', ''), 128);

        amount_value := public.finance_v09_positive_amount(source_item->>'amount');
        if amount_value is null then
            insert into public.finance_migration_errors (
                workspace_id, migration_run_id, source_type, source_id, field_name,
                error_code, message, source_payload
            ) values (
                target_workspace, run_id, 'transaction', source_id, 'amount',
                'invalid_amount', 'El monto debe ser un entero positivo en PYG.', source_item
            );
            errors_value := errors_value + 1;
            continue;
        end if;
        transaction_kind := source_item->>'type';
        if transaction_kind not in ('income', 'expense') then
            insert into public.finance_migration_errors (
                workspace_id, migration_run_id, source_type, source_id, field_name,
                error_code, message, source_payload
            ) values (
                target_workspace, run_id, 'transaction', source_id, 'type',
                'invalid_type', 'El movimiento no es ingreso ni gasto.', source_item
            );
            errors_value := errors_value + 1;
            continue;
        end if;
        if transaction_kind = 'income' then
            source_income := source_income + amount_value;
        else
            source_expense := source_expense + amount_value;
        end if;

        begin
            date_value := left(source_item->>'createdAt', 10)::date;
            occurred_value := (date_value + time '12:00') at time zone 'America/Asuncion';
        exception when others then
            insert into public.finance_migration_errors (
                workspace_id, migration_run_id, source_type, source_id, field_name,
                error_code, message, source_payload
            ) values (
                target_workspace, run_id, 'transaction', source_id, 'createdAt',
                'invalid_date', 'La fecha del movimiento no es válida.', source_item
            );
            errors_value := errors_value + 1;
            continue;
        end;

        insert into public.finance_transactions (
            workspace_id, context_id, account_id, category_id, operation_kind,
            transaction_type, reporting_effect, balance_delta,
            status, occurred_at, amount, description, note, legacy_source,
            legacy_id, legacy_payment_id, idempotency_key, migration_run_id,
            created_by, updated_by
        ) values (
            target_workspace, target_context, target_account, target_category,
            transaction_kind, transaction_kind, transaction_kind,
            case when transaction_kind = 'income' then amount_value else -amount_value end,
            'confirmed', occurred_value, amount_value,
            left(coalesce(nullif(trim(source_item->>'description'), ''), 'Movimiento migrado'), 160),
            '', 'atlasTransactions', source_id, payment_id_text,
            case when payment_id_text is null
                then 'v09:transaction:' || source_id
                else 'v09:payment-transaction:' || payment_id_text
            end,
            run_id, auth.uid(), auth.uid()
        ) on conflict (workspace_id, idempotency_key) do nothing;
        if found then transactions_inserted := transactions_inserted + 1; end if;
    end loop;

    for source_item in select value from jsonb_array_elements(source_obligations)
    loop
        source_id := left(coalesce(nullif(source_item->>'id', ''), encode(digest(source_item::text, 'sha256'), 'hex')), 128);

        obligation_amount := public.finance_v09_positive_amount(source_item->>'amount');
        if obligation_amount is null then
            insert into public.finance_migration_errors (
                workspace_id, migration_run_id, source_type, source_id, field_name,
                error_code, message, source_payload
            ) values (
                target_workspace, run_id, 'obligation', source_id, 'amount',
                'invalid_amount', 'El monto de la obligación no es válido.', source_item
            );
            errors_value := errors_value + 1;
            continue;
        end if;
        source_obligations_total := source_obligations_total + obligation_amount;

        begin
            date_value := (source_item->>'dueDate')::date;
        exception when others then
            insert into public.finance_migration_errors (
                workspace_id, migration_run_id, source_type, source_id, field_name,
                error_code, message, source_payload
            ) values (
                target_workspace, run_id, 'obligation', source_id, 'dueDate',
                'invalid_date', 'El vencimiento no es válido.', source_item
            );
            errors_value := errors_value + 1;
            continue;
        end;

        frequency_value := coalesce(nullif(source_item->>'frequency', ''), 'once');
        if frequency_value not in ('once', 'monthly', 'installment') then
            frequency_value := 'once';
        end if;
        installment_number_value := null;
        installment_total_value := null;
        if frequency_value = 'installment' then
            installment_number_value := public.finance_v09_positive_amount(source_item->>'installmentNumber');
            installment_total_value := public.finance_v09_positive_amount(source_item->>'installmentTotal');
            if installment_number_value is null
               or installment_total_value is null
               or installment_total_value < 2
               or installment_number_value > installment_total_value
               or installment_total_value > 1000000 then
                insert into public.finance_migration_errors (
                    workspace_id, migration_run_id, source_type, source_id, field_name,
                    error_code, message, source_payload
                ) values (
                    target_workspace, run_id, 'obligation', source_id, 'installmentNumber',
                    'invalid_installment', 'La numeración de la cuota no es válida.', source_item
                );
                errors_value := errors_value + 1;
                continue;
            end if;
        end if;

        insert into public.finance_obligations (
            workspace_id, context_id, account_id, obligation_type, direction, name, principal_amount,
            paid_amount, due_date, frequency, installment_number, installment_total,
            status, legacy_source, legacy_id, idempotency_key, migration_run_id,
            created_by, updated_by
        ) values (
            target_workspace, target_context, target_account,
            case when frequency_value = 'installment' then 'installment' else 'payable' end,
            'payable',
            left(coalesce(nullif(trim(source_item->>'name'), ''), 'Obligación migrada'), 120),
            obligation_amount, 0, date_value, frequency_value,
            case when frequency_value = 'installment' then installment_number_value::integer else null end,
            case when frequency_value = 'installment' then installment_total_value::integer else null end,
            'pending', 'atlasObligations', source_id,
            'v09:obligation:' || source_id, run_id, auth.uid(), auth.uid()
        ) on conflict (workspace_id, idempotency_key)
        do update set idempotency_key = excluded.idempotency_key
        returning id into obligation_id_value;
        if found then obligations_inserted := obligations_inserted + 1; end if;

        paid_total := 0;
        if jsonb_typeof(coalesce(source_item->'payments', '[]'::jsonb)) = 'array' then
            for source_payment in select value from jsonb_array_elements(coalesce(source_item->'payments', '[]'::jsonb))
            loop
                source_payments := source_payments + 1;
                payment_id_text := left(coalesce(
                    nullif(source_payment->>'id', ''),
                    encode(digest(source_payment::text || source_id, 'sha256'), 'hex')
                ), 128);

                amount_value := public.finance_v09_positive_amount(source_payment->>'amount');
                if amount_value is null then
                    insert into public.finance_migration_errors (
                        workspace_id, migration_run_id, source_type, source_id, field_name,
                        error_code, message, source_payload
                    ) values (
                        target_workspace, run_id, 'payment', payment_id_text, 'amount',
                        'invalid_amount', 'El monto del pago no es válido.', source_payment
                    );
                    errors_value := errors_value + 1;
                    continue;
                end if;
                if paid_total + amount_value > obligation_amount then
                    insert into public.finance_migration_errors (
                        workspace_id, migration_run_id, source_type, source_id, field_name,
                        error_code, message, source_payload
                    ) values (
                        target_workspace, run_id, 'payment', payment_id_text, 'amount',
                        'payment_exceeds_obligation', 'El pago supera el saldo de la obligación.', source_payment
                    );
                    errors_value := errors_value + 1;
                    continue;
                end if;

                begin
                    date_value := (source_payment->>'date')::date;
                exception when others then
                    insert into public.finance_migration_errors (
                        workspace_id, migration_run_id, source_type, source_id, field_name,
                        error_code, message, source_payload
                    ) values (
                        target_workspace, run_id, 'payment', payment_id_text, 'date',
                        'invalid_date', 'La fecha del pago no es válida.', source_payment
                    );
                    errors_value := errors_value + 1;
                    continue;
                end;

                select id into linked_transaction
                from public.finance_transactions
                where workspace_id = target_workspace and legacy_payment_id = payment_id_text
                limit 1;

                if linked_transaction is null then
                    insert into public.finance_transactions (
                        workspace_id, context_id, account_id, category_id, operation_kind,
                        transaction_type, reporting_effect, balance_delta,
                        status, occurred_at, amount, description, note, legacy_source,
                        legacy_id, legacy_payment_id, idempotency_key, migration_run_id,
                        created_by, updated_by
                    ) values (
                        target_workspace, target_context, target_account, target_category,
                        'payment', 'expense', 'expense', -amount_value, 'confirmed',
                        (date_value + time '12:00') at time zone 'America/Asuncion',
                        amount_value,
                        left('Pago: ' || coalesce(nullif(trim(source_item->>'name'), ''), 'Obligación migrada'), 160),
                        '', 'atlasObligations.payments', payment_id_text, payment_id_text,
                        'v09:payment-transaction:' || payment_id_text, run_id, auth.uid(), auth.uid()
                    ) on conflict (workspace_id, idempotency_key)
                    do update set idempotency_key = excluded.idempotency_key
                    returning id into linked_transaction;
                    if found then transactions_inserted := transactions_inserted + 1; end if;
                end if;

                insert into public.finance_payments (
                    workspace_id, context_id, obligation_id, account_id,
                    linked_transaction_id, amount, paid_on, reference, note,
                    legacy_id, idempotency_key, migration_run_id, created_by, updated_by
                ) values (
                    target_workspace, target_context, obligation_id_value, target_account,
                    linked_transaction, amount_value, date_value,
                    left(coalesce(source_payment->>'reference', ''), 160),
                    left(coalesce(source_payment->>'note', ''), 1000),
                    payment_id_text, 'v09:payment:' || payment_id_text,
                    run_id, auth.uid(), auth.uid()
                ) on conflict (workspace_id, idempotency_key)
                do update set idempotency_key = excluded.idempotency_key
                returning id into payment_row_id;
                if found then payments_inserted := payments_inserted + 1; end if;
                paid_total := paid_total + amount_value;
                source_paid_total := source_paid_total + amount_value;

                if jsonb_typeof(source_payment->'receipt') = 'object' then
                    source_attachments := source_attachments + 1;
                    insert into public.finance_attachments (
                        workspace_id, context_id, payment_id, storage_path,
                        original_name, mime_type, byte_size, sync_state, legacy_id,
                        idempotency_key, migration_run_id, created_by, updated_by
                    ) values (
                        target_workspace, target_context, payment_row_id, null,
                        left(coalesce(nullif(source_payment->'receipt'->>'name', ''), 'comprobante'), 180),
                        case when source_payment->'receipt'->>'type' in (
                            'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
                        ) then source_payment->'receipt'->>'type' else 'application/pdf' end,
                        coalesce(least(
                            public.finance_v09_positive_amount(source_payment->'receipt'->>'size'),
                            10485760
                        ), 0),
                        'local_pending', payment_id_text,
                        'v09:attachment:' || payment_id_text,
                        run_id, auth.uid(), auth.uid()
                    ) on conflict (workspace_id, idempotency_key) do nothing;
                    if found then attachments_inserted := attachments_inserted + 1; end if;
                end if;
            end loop;
        end if;

        update public.finance_obligations
        set paid_amount = paid_total,
            status = case
                when paid_total = 0 then 'pending'
                when paid_total >= obligation_amount then 'paid'
                else 'partial'
            end
        where id = obligation_id_value;
    end loop;

    select jsonb_build_object(
        'transactions', count(*) filter (where entity_type = 'transaction'),
        'obligations', count(*) filter (where entity_type = 'obligation'),
        'payments', count(*) filter (where entity_type = 'payment'),
        'attachments', count(*) filter (where entity_type = 'attachment')
    ) into result_counts
    from (
        select 'transaction'::text entity_type from public.finance_transactions where migration_run_id = run_id
        union all select 'obligation' from public.finance_obligations where migration_run_id = run_id
        union all select 'payment' from public.finance_payments where migration_run_id = run_id
        union all select 'attachment' from public.finance_attachments where migration_run_id = run_id
    ) imported;

    select
        coalesce(sum(amount) filter (where transaction_type = 'income'), 0),
        coalesce(sum(amount) filter (where transaction_type = 'expense'), 0)
    into target_income, target_expense
    from public.finance_transactions
    where migration_run_id = run_id;

    select coalesce(sum(principal_amount), 0), coalesce(sum(paid_amount), 0)
    into target_obligations_total, target_paid_total
    from public.finance_obligations
    where migration_run_id = run_id;

    result_totals := jsonb_build_object(
        'income', target_income,
        'expense', target_expense,
        'obligations', target_obligations_total,
        'paid', target_paid_total
    );

    update public.finance_migration_runs
    set state = case when errors_value = 0 then 'completed' else 'completed_with_errors' end,
        source_counts = jsonb_build_object(
            'transactions', jsonb_array_length(source_transactions),
            'obligations', jsonb_array_length(source_obligations),
            'payments', source_payments,
            'attachments', source_attachments
        ),
        source_totals = jsonb_build_object(
            'income', source_income,
            'expense', source_expense,
            'obligations', source_obligations_total,
            'paid', source_paid_total
        ),
        target_counts = result_counts,
        target_totals = result_totals,
        error_count = errors_value,
        report = jsonb_build_object(
            'insertedThisRun', jsonb_build_object(
                'transactions', transactions_inserted,
                'obligations', obligations_inserted,
                'payments', payments_inserted,
                'attachments', attachments_inserted
            ),
            'sourcePreserved', true,
            'differences', jsonb_build_object(
                'income', source_income - target_income,
                'expense', source_expense - target_expense,
                'obligations', source_obligations_total - target_obligations_total,
                'paid', source_paid_total - target_paid_total
            )
        ),
        completed_at = now(),
        updated_at = now()
    where id = run_id;

    return jsonb_build_object(
        'runId', run_id,
        'repeated', false,
        'state', case when errors_value = 0 then 'completed' else 'completed_with_errors' end,
        'counts', result_counts,
        'totals', result_totals,
        'errors', errors_value,
        'sourcePreserved', true
    );
exception when others then
    if run_id is not null then
        update public.finance_migration_runs
        set state = 'failed',
            report = jsonb_build_object('error', sqlerrm),
            updated_at = now()
        where id = run_id;
    end if;
    raise;
end;
$$;

revoke all on function public.finance_import_v09(uuid, uuid, uuid, uuid, jsonb, jsonb, text)
    from public, anon;
grant execute on function public.finance_import_v09(uuid, uuid, uuid, uuid, jsonb, jsonb, text)
    to authenticated;

create or replace function public.finance_assert_record_month_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    candidate jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    previous jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
    target_workspace uuid := (candidate->>'workspace_id')::uuid;
    target_context uuid := (candidate->>'context_id')::uuid;
    target_month text;
    previous_month text;
begin
    if current_setting('atlas.finance_month_override', true) = 'on' then
        return case when tg_op = 'DELETE' then old else new end;
    end if;
    target_month := coalesce(
        nullif(left(candidate->>'occurred_at', 7), ''),
        nullif(left(candidate->>'paid_on', 7), ''),
        nullif(left(candidate->>'due_date', 7), ''),
        nullif(left(candidate->>'occurred_on', 7), ''),
        nullif(left(candidate->>'valued_on', 7), ''),
        nullif(candidate->>'month', '')
    );
    if previous is not null then
        previous_month := coalesce(
            nullif(left(previous->>'occurred_at', 7), ''), nullif(left(previous->>'paid_on', 7), ''),
            nullif(left(previous->>'due_date', 7), ''), nullif(left(previous->>'occurred_on', 7), ''),
            nullif(left(previous->>'valued_on', 7), ''), nullif(previous->>'month', '')
        );
    end if;
    if exists (
        select 1 from (
            select distinct on (month) month, state
            from public.finance_monthly_closes
            where workspace_id = target_workspace and context_id = target_context
              and month in (target_month, previous_month)
            order by month, version_number desc
        ) latest where latest.state = 'closed'
    ) then
        raise exception 'finance_month_closed' using errcode = '55000';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.finance_assert_record_month_open() from public, anon, authenticated;

do $$
declare target_table text;
begin
    foreach target_table in array array[
        'finance_transactions', 'finance_obligations', 'finance_payments',
        'finance_budgets', 'finance_goal_entries', 'finance_asset_valuations'
    ] loop
        execute format('drop trigger if exists finance_assert_month_open on public.%I', target_table);
        execute format(
            'create trigger finance_assert_month_open before insert or update or delete on public.%I '
            'for each row execute function public.finance_assert_record_month_open()', target_table
        );
    end loop;
end;
$$;

create or replace function public.finance_protect_close_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    raise exception 'finance_close_snapshot_immutable' using errcode = '55000';
end;
$$;

revoke all on function public.finance_protect_close_snapshot() from public, anon, authenticated;
drop trigger if exists finance_protect_close_snapshot on public.finance_monthly_closes;
create trigger finance_protect_close_snapshot
before update on public.finance_monthly_closes
for each row execute function public.finance_protect_close_snapshot();

create or replace function public.finance_post_operation(
    target_workspace uuid,
    operation_key text,
    operation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    source_record jsonb;
    incoming public.finance_transactions%rowtype;
    current_record public.finance_transactions%rowtype;
    record_count integer := jsonb_array_length(coalesce(operation->'records', '[]'::jsonb));
    transfer_count integer;
    delta_total bigint;
    source_count integer;
    destination_count integer;
    single_count integer;
    group_count integer;
    amount_count integer;
begin
    if not public.finance_is_workspace_owner(target_workspace) then
        raise exception 'finance_owner_required' using errcode = '42501';
    end if;
    if char_length(coalesce(operation_key, '')) < 8 or record_count not in (1, 2) then
        raise exception 'finance_operation_invalid' using errcode = '22023';
    end if;
    select count(*) filter (where source_item.value->>'operation_kind' = 'transfer'),
           coalesce(sum(case when account.account_type in ('credit_card', 'liability')
               then -(source_item.value->>'balance_delta')::bigint
               else (source_item.value->>'balance_delta')::bigint end), 0),
           count(*) filter (where source_item.value->>'operation_leg' = 'source'),
           count(*) filter (where source_item.value->>'operation_leg' = 'destination'),
           count(*) filter (where source_item.value->>'operation_leg' = 'single'),
           count(distinct source_item.value->>'operation_group_id'),
           count(distinct source_item.value->>'amount')
    into transfer_count, delta_total, source_count, destination_count, single_count, group_count, amount_count
    from jsonb_array_elements(operation->'records') source_item
    join public.finance_accounts account
      on account.workspace_id = target_workspace
     and account.id = (source_item.value->>'account_id')::uuid;
    if record_count = 2 and (transfer_count <> 2 or delta_total <> 0
        or source_count <> 1 or destination_count <> 1 or group_count <> 1 or amount_count <> 1) then
        raise exception 'finance_transfer_unbalanced' using errcode = '23514';
    end if;
    if record_count = 1 and (transfer_count <> 0 or single_count <> 1) then
        raise exception 'finance_transfer_requires_two_legs' using errcode = '23514';
    end if;

    for source_record in select value from jsonb_array_elements(operation->'records')
    loop
        incoming := jsonb_populate_record(null::public.finance_transactions, source_record);
        if incoming.workspace_id <> target_workspace or incoming.created_by <> auth.uid()
           or incoming.updated_by <> auth.uid() then
            raise exception 'finance_operation_actor_mismatch' using errcode = '42501';
        end if;
        select * into current_record from public.finance_transactions
        where workspace_id = target_workspace and id = incoming.id for update;
        if found then
            if current_record.version = incoming.version then
                continue;
            end if;
            if incoming.version <> current_record.version + 1 then
                raise exception 'finance_version_conflict' using errcode = '40001';
            end if;
            update public.finance_transactions set
                context_id = incoming.context_id, account_id = incoming.account_id,
                category_id = incoming.category_id, payment_method_id = incoming.payment_method_id,
                operation_group_id = incoming.operation_group_id, operation_kind = incoming.operation_kind,
                operation_leg = incoming.operation_leg,
                transaction_type = incoming.transaction_type, reporting_effect = incoming.reporting_effect,
                balance_delta = incoming.balance_delta, status = incoming.status,
                occurred_at = incoming.occurred_at, amount = incoming.amount,
                description = incoming.description, counterparty = incoming.counterparty,
                tags = incoming.tags, note = incoming.note,
                related_obligation_id = incoming.related_obligation_id,
                related_payment_id = incoming.related_payment_id,
                void_reason = incoming.void_reason, voided_at = incoming.voided_at,
                updated_by = auth.uid()
            where workspace_id = target_workspace and id = incoming.id;
        else
            insert into public.finance_transactions select incoming.*;
        end if;
    end loop;
    return jsonb_build_object('operationKey', operation_key, 'records', record_count, 'state', 'confirmed');
end;
$$;

revoke all on function public.finance_post_operation(uuid, text, jsonb) from public, anon;
grant execute on function public.finance_post_operation(uuid, text, jsonb) to authenticated;

create or replace function public.finance_delete_pending_operation(
    target_workspace uuid,
    operation_key text,
    operation_group uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    draft_count integer;
    target_context uuid;
begin
    if not public.finance_is_workspace_owner(target_workspace) then
        raise exception 'finance_owner_required' using errcode = '42501';
    end if;
    select count(*) into draft_count
    from public.finance_transactions
    where workspace_id = target_workspace and operation_group_id = operation_group;
    if draft_count = 0 then
        return jsonb_build_object('operationKey', operation_key, 'repeated', true, 'deleted', 0);
    end if;
    if exists (
        select 1 from public.finance_transactions
        where workspace_id = target_workspace and operation_group_id = operation_group
          and (status <> 'pending' or related_obligation_id is not null or related_payment_id is not null)
    ) then
        raise exception 'finance_pending_delete_invalid' using errcode = '23514';
    end if;
    select context_id into target_context from public.finance_transactions
    where workspace_id = target_workspace and operation_group_id = operation_group limit 1;
    insert into public.finance_audit_log (
        workspace_id, context_id, entity_type, entity_id, action,
        before_value, after_value, reason, operation_key, actor_id, session_id
    )
    select tx.workspace_id, tx.context_id, 'finance_transactions', tx.id, 'delete',
           to_jsonb(tx), null, 'Borrador pendiente eliminado', operation_key, auth.uid(), auth.jwt()->>'session_id'
    from public.finance_transactions tx
    where tx.workspace_id = target_workspace and tx.operation_group_id = operation_group;
    delete from public.finance_transactions
    where workspace_id = target_workspace and operation_group_id = operation_group;
    return jsonb_build_object('operationKey', operation_key, 'repeated', false, 'deleted', draft_count, 'contextId', target_context);
end;
$$;

revoke all on function public.finance_delete_pending_operation(uuid, text, uuid) from public, anon;
grant execute on function public.finance_delete_pending_operation(uuid, text, uuid) to authenticated;

create or replace function public.finance_pay_obligation(
    target_workspace uuid,
    operation_key text,
    payment_record jsonb,
    transaction_records jsonb,
    obligation_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    incoming_payment public.finance_payments%rowtype;
    incoming_transaction public.finance_transactions%rowtype;
    source_transaction jsonb;
    target_obligation public.finance_obligations%rowtype;
    transaction_account_type text;
    source_legs integer := 0;
    destination_legs integer := 0;
    normalized_delta bigint := 0;
    source_transaction_id uuid;
    neutral_payment boolean;
begin
    if not public.finance_is_workspace_owner(target_workspace) then
        raise exception 'finance_owner_required' using errcode = '42501';
    end if;
    incoming_payment := jsonb_populate_record(null::public.finance_payments, payment_record);
    if jsonb_typeof(transaction_records) <> 'array' or jsonb_array_length(transaction_records) not in (1, 2) then
        raise exception 'finance_payment_transactions_invalid' using errcode = '22023';
    end if;
    if incoming_payment.workspace_id <> target_workspace or incoming_payment.created_by <> auth.uid() then
        raise exception 'finance_payment_actor_mismatch' using errcode = '42501';
    end if;
    if exists (select 1 from public.finance_payments where workspace_id = target_workspace and id = incoming_payment.id) then
        return jsonb_build_object('operationKey', operation_key, 'repeated', true);
    end if;
    select * into target_obligation from public.finance_obligations
    where workspace_id = target_workspace and id = incoming_payment.obligation_id for update;
    if not found or target_obligation.version <> obligation_version or target_obligation.status in ('paid', 'void') then
        raise exception 'finance_obligation_conflict' using errcode = '40001';
    end if;
    neutral_payment := target_obligation.obligation_type in ('loan', 'card');
    if incoming_payment.context_id <> target_obligation.context_id or incoming_payment.status <> 'confirmed'
       or (neutral_payment and target_obligation.account_id is not null
           and (incoming_payment.account_id = target_obligation.account_id or jsonb_array_length(transaction_records) <> 2))
       or ((not neutral_payment or target_obligation.account_id is null) and jsonb_array_length(transaction_records) <> 1) then
        raise exception 'finance_payment_transaction_mismatch' using errcode = '23514';
    end if;
    if incoming_payment.amount > target_obligation.principal_amount + target_obligation.interest_amount
        + target_obligation.surcharge_amount - target_obligation.paid_amount then
        raise exception 'finance_payment_exceeds_balance' using errcode = '23514';
    end if;
    for source_transaction in select value from jsonb_array_elements(transaction_records)
    loop
        incoming_transaction := jsonb_populate_record(null::public.finance_transactions, source_transaction);
        if incoming_transaction.workspace_id <> target_workspace or incoming_transaction.created_by <> auth.uid()
           or incoming_transaction.related_obligation_id <> target_obligation.id
           or incoming_transaction.related_payment_id <> incoming_payment.id
           or incoming_transaction.context_id <> target_obligation.context_id
           or incoming_transaction.operation_group_id <> incoming_payment.id
           or incoming_transaction.amount <> incoming_payment.amount
           or incoming_transaction.status <> 'confirmed'
           or incoming_transaction.transaction_type <> (case when target_obligation.direction = 'receivable' then 'income' else 'expense' end)
           or incoming_transaction.reporting_effect <> (case when neutral_payment then 'neutral' when target_obligation.direction = 'receivable' then 'income' else 'expense' end) then
            raise exception 'finance_payment_transaction_mismatch' using errcode = '42501';
        end if;
        select account_type into transaction_account_type from public.finance_accounts
        where workspace_id = target_workspace and context_id = target_obligation.context_id
          and id = incoming_transaction.account_id;
        if not found then raise exception 'finance_payment_account_mismatch' using errcode = '23503'; end if;
        normalized_delta := normalized_delta + case when transaction_account_type in ('credit_card', 'liability')
            then -incoming_transaction.balance_delta else incoming_transaction.balance_delta end;
        if incoming_transaction.operation_leg = 'source' and incoming_transaction.account_id = incoming_payment.account_id then
            source_legs := source_legs + 1;
            source_transaction_id := incoming_transaction.id;
        elsif incoming_transaction.operation_leg = 'destination' and neutral_payment
              and incoming_transaction.account_id = target_obligation.account_id then
            destination_legs := destination_legs + 1;
        else
            raise exception 'finance_payment_leg_mismatch' using errcode = '23514';
        end if;
        insert into public.finance_transactions select incoming_transaction.*;
    end loop;
    if source_legs <> 1 or source_transaction_id is distinct from incoming_payment.linked_transaction_id
       or destination_legs <> (case when jsonb_array_length(transaction_records) = 2 then 1 else 0 end)
       or (jsonb_array_length(transaction_records) = 2 and normalized_delta <> 0) then
        raise exception 'finance_payment_unbalanced' using errcode = '23514';
    end if;
    insert into public.finance_payments select incoming_payment.*;
    perform set_config('atlas.finance_month_override', 'on', true);
    update public.finance_obligations set
        paid_amount = paid_amount + incoming_payment.amount,
        status = case
            when paid_amount + incoming_payment.amount = principal_amount + interest_amount + surcharge_amount then 'paid'
            else 'partial'
        end,
        updated_by = auth.uid()
    where workspace_id = target_workspace and id = target_obligation.id;
    return jsonb_build_object('operationKey', operation_key, 'repeated', false, 'paymentId', incoming_payment.id);
end;
$$;

revoke all on function public.finance_pay_obligation(uuid, text, jsonb, jsonb, integer) from public, anon;
grant execute on function public.finance_pay_obligation(uuid, text, jsonb, jsonb, integer) to authenticated;

create or replace function public.finance_update_payment(
    target_workspace uuid,
    operation_key text,
    payment_record jsonb,
    transaction_records jsonb,
    payment_version integer,
    obligation_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    incoming_payment public.finance_payments%rowtype;
    current_payment public.finance_payments%rowtype;
    target_obligation public.finance_obligations%rowtype;
    incoming_transaction public.finance_transactions%rowtype;
    current_transaction public.finance_transactions%rowtype;
    source_transaction jsonb;
    paid_without_current bigint;
    corrected_paid bigint;
    transaction_account_type text;
    source_legs integer := 0;
    destination_legs integer := 0;
    normalized_delta bigint := 0;
    source_transaction_id uuid;
    neutral_payment boolean;
begin
    if not public.finance_is_workspace_owner(target_workspace) then
        raise exception 'finance_owner_required' using errcode = '42501';
    end if;
    if jsonb_typeof(transaction_records) <> 'array' or jsonb_array_length(transaction_records) not in (1, 2) then
        raise exception 'finance_payment_transactions_invalid' using errcode = '22023';
    end if;
    incoming_payment := jsonb_populate_record(null::public.finance_payments, payment_record);
    if incoming_payment.workspace_id <> target_workspace or incoming_payment.updated_by <> auth.uid() then
        raise exception 'finance_payment_actor_mismatch' using errcode = '42501';
    end if;
    select * into current_payment from public.finance_payments
    where workspace_id = target_workspace and id = incoming_payment.id for update;
    if not found or current_payment.version <> payment_version or current_payment.status = 'void' then
        raise exception 'finance_payment_conflict' using errcode = '40001';
    end if;
    select * into target_obligation from public.finance_obligations
    where workspace_id = target_workspace and id = current_payment.obligation_id for update;
    if not found or target_obligation.version <> obligation_version or target_obligation.status = 'void' then
        raise exception 'finance_obligation_conflict' using errcode = '40001';
    end if;
    neutral_payment := target_obligation.obligation_type in ('loan', 'card');
    if incoming_payment.obligation_id <> current_payment.obligation_id
       or incoming_payment.context_id <> target_obligation.context_id
       or incoming_payment.linked_transaction_id is distinct from current_payment.linked_transaction_id
       or incoming_payment.status not in ('confirmed', 'void')
       or (neutral_payment and target_obligation.account_id is not null
           and (incoming_payment.account_id = target_obligation.account_id or jsonb_array_length(transaction_records) <> 2))
       or ((not neutral_payment or target_obligation.account_id is null) and jsonb_array_length(transaction_records) <> 1) then
        raise exception 'finance_payment_transaction_mismatch' using errcode = '23514';
    end if;
    paid_without_current := target_obligation.paid_amount - current_payment.amount;
    corrected_paid := paid_without_current + case when incoming_payment.status = 'void' then 0 else incoming_payment.amount end;
    if paid_without_current < 0 or corrected_paid < 0
       or corrected_paid > target_obligation.principal_amount + target_obligation.interest_amount + target_obligation.surcharge_amount then
        raise exception 'finance_payment_exceeds_balance' using errcode = '23514';
    end if;
    update public.finance_payments set
        account_id = incoming_payment.account_id,
        payment_method_id = incoming_payment.payment_method_id,
        amount = incoming_payment.amount, paid_on = incoming_payment.paid_on,
        reference = incoming_payment.reference, note = incoming_payment.note,
        status = incoming_payment.status, void_reason = incoming_payment.void_reason,
        voided_at = incoming_payment.voided_at, updated_by = auth.uid()
    where workspace_id = target_workspace and id = incoming_payment.id;

    for source_transaction in select value from jsonb_array_elements(transaction_records)
    loop
        incoming_transaction := jsonb_populate_record(null::public.finance_transactions, source_transaction);
        if incoming_transaction.workspace_id <> target_workspace or incoming_transaction.updated_by <> auth.uid()
           or incoming_transaction.related_payment_id <> current_payment.id
           or incoming_transaction.related_obligation_id <> target_obligation.id
           or incoming_transaction.context_id <> target_obligation.context_id
           or incoming_transaction.operation_group_id <> current_payment.id
           or incoming_transaction.amount <> incoming_payment.amount
           or incoming_transaction.status <> incoming_payment.status
           or incoming_transaction.transaction_type <> (case when target_obligation.direction = 'receivable' then 'income' else 'expense' end)
           or incoming_transaction.reporting_effect <> (case when neutral_payment then 'neutral' when target_obligation.direction = 'receivable' then 'income' else 'expense' end) then
            raise exception 'finance_payment_transaction_mismatch' using errcode = '42501';
        end if;
        select account_type into transaction_account_type from public.finance_accounts
        where workspace_id = target_workspace and context_id = target_obligation.context_id
          and id = incoming_transaction.account_id;
        if not found then raise exception 'finance_payment_account_mismatch' using errcode = '23503'; end if;
        normalized_delta := normalized_delta + case when transaction_account_type in ('credit_card', 'liability')
            then -incoming_transaction.balance_delta else incoming_transaction.balance_delta end;
        if incoming_transaction.operation_leg = 'source' and incoming_transaction.account_id = incoming_payment.account_id then
            source_legs := source_legs + 1;
            source_transaction_id := incoming_transaction.id;
        elsif incoming_transaction.operation_leg = 'destination' and neutral_payment
              and incoming_transaction.account_id = target_obligation.account_id then
            destination_legs := destination_legs + 1;
        else
            raise exception 'finance_payment_leg_mismatch' using errcode = '23514';
        end if;
        select * into current_transaction from public.finance_transactions
        where workspace_id = target_workspace and id = incoming_transaction.id for update;
        if found then
            if incoming_transaction.version <> current_transaction.version + 1 then
                raise exception 'finance_version_conflict' using errcode = '40001';
            end if;
            update public.finance_transactions set
                account_id = incoming_transaction.account_id,
                payment_method_id = incoming_transaction.payment_method_id,
                operation_leg = incoming_transaction.operation_leg,
                transaction_type = incoming_transaction.transaction_type,
                reporting_effect = incoming_transaction.reporting_effect,
                balance_delta = incoming_transaction.balance_delta,
                status = incoming_transaction.status,
                occurred_at = incoming_transaction.occurred_at,
                amount = incoming_transaction.amount,
                description = incoming_transaction.description,
                note = incoming_transaction.note,
                void_reason = incoming_transaction.void_reason,
                voided_at = incoming_transaction.voided_at,
                updated_by = auth.uid()
            where workspace_id = target_workspace and id = incoming_transaction.id;
        else
            insert into public.finance_transactions select incoming_transaction.*;
        end if;
    end loop;
    if source_legs <> 1 or source_transaction_id is distinct from incoming_payment.linked_transaction_id
       or destination_legs <> (case when jsonb_array_length(transaction_records) = 2 then 1 else 0 end)
       or (jsonb_array_length(transaction_records) = 2 and normalized_delta <> 0) then
        raise exception 'finance_payment_unbalanced' using errcode = '23514';
    end if;

    perform set_config('atlas.finance_month_override', 'on', true);
    update public.finance_obligations set
        paid_amount = corrected_paid,
        status = case when corrected_paid = principal_amount + interest_amount + surcharge_amount then 'paid' when corrected_paid > 0 then 'partial' else 'pending' end,
        updated_by = auth.uid()
    where workspace_id = target_workspace and id = target_obligation.id;
    return jsonb_build_object('operationKey', operation_key, 'paymentId', incoming_payment.id, 'state', incoming_payment.status);
end;
$$;

revoke all on function public.finance_update_payment(uuid, text, jsonb, jsonb, integer, integer) from public, anon;
grant execute on function public.finance_update_payment(uuid, text, jsonb, jsonb, integer, integer) to authenticated;

create or replace function public.finance_close_month(
    target_workspace uuid,
    close_record jsonb,
    operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare incoming public.finance_monthly_closes%rowtype;
begin
    if not public.finance_is_workspace_owner(target_workspace) then
        raise exception 'finance_owner_required' using errcode = '42501';
    end if;
    incoming := jsonb_populate_record(null::public.finance_monthly_closes, close_record);
    if incoming.workspace_id <> target_workspace or incoming.created_by <> auth.uid()
       or incoming.updated_by <> auth.uid() or incoming.state <> 'closed' then
        raise exception 'finance_close_invalid' using errcode = '42501';
    end if;
    if exists (select 1 from public.finance_monthly_closes where workspace_id = target_workspace and id = incoming.id) then
        return jsonb_build_object('operationKey', operation_key, 'repeated', true, 'closeId', incoming.id);
    end if;
    if (
        select state = 'closed' from public.finance_monthly_closes
        where workspace_id = target_workspace and context_id = incoming.context_id and month = incoming.month
        order by version_number desc limit 1
    ) then
        raise exception 'finance_month_already_closed' using errcode = '23505';
    end if;
    if incoming.version_number <> coalesce((
        select max(version_number) + 1 from public.finance_monthly_closes
        where workspace_id = target_workspace and context_id = incoming.context_id and month = incoming.month
    ), 1) then
        raise exception 'finance_close_version_invalid' using errcode = '40001';
    end if;
    insert into public.finance_monthly_closes select incoming.*;
    return jsonb_build_object('operationKey', operation_key, 'repeated', false, 'closeId', incoming.id, 'version', incoming.version_number);
end;
$$;

revoke all on function public.finance_close_month(uuid, jsonb, text) from public, anon;
grant execute on function public.finance_close_month(uuid, jsonb, text) to authenticated;

create or replace function public.finance_reopen_month(
    target_workspace uuid,
    reopen_record jsonb,
    operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    incoming public.finance_monthly_closes%rowtype;
    latest public.finance_monthly_closes%rowtype;
begin
    if not public.finance_is_workspace_owner(target_workspace) then
        raise exception 'finance_owner_required' using errcode = '42501';
    end if;
    incoming := jsonb_populate_record(null::public.finance_monthly_closes, reopen_record);
    if incoming.workspace_id <> target_workspace or incoming.created_by <> auth.uid()
       or incoming.updated_by <> auth.uid() or incoming.state <> 'reopened'
       or char_length(trim(coalesce(incoming.reopen_reason, ''))) < 3 then
        raise exception 'finance_reopen_reason_required' using errcode = '22023';
    end if;
    if exists (select 1 from public.finance_monthly_closes where workspace_id = target_workspace and id = incoming.id) then
        return jsonb_build_object('operationKey', operation_key, 'repeated', true, 'closeId', incoming.id);
    end if;
    select * into latest from public.finance_monthly_closes
    where workspace_id = target_workspace and context_id = incoming.context_id and month = incoming.month
    order by version_number desc limit 1 for update;
    if not found or latest.state <> 'closed' or incoming.previous_close_id <> latest.id
       or incoming.version_number <> latest.version_number + 1 or incoming.snapshot <> latest.snapshot then
        raise exception 'finance_reopen_version_conflict' using errcode = '40001';
    end if;
    insert into public.finance_monthly_closes select incoming.*;
    return jsonb_build_object('operationKey', operation_key, 'repeated', false, 'closeId', incoming.id, 'version', incoming.version_number);
end;
$$;

revoke all on function public.finance_reopen_month(uuid, jsonb, text) from public, anon;
grant execute on function public.finance_reopen_month(uuid, jsonb, text) to authenticated;

commit;
