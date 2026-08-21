-- Borrado total del espacio actual, solicitado explícitamente desde Acerca de.
-- Seguro para reejecutar: solo el propietario puede borrar su propio espacio.

begin;

create or replace function public.atlas_reset_workspace_data(target_workspace uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    target_table text;
    deleted_rows integer := 0;
    total_rows integer := 0;
begin
    if auth.uid() is null or not exists (
        select 1
        from public.workspaces
        where id = target_workspace
          and owner_id = auth.uid()
    ) then
        raise exception 'workspace_owner_required' using errcode = '42501';
    end if;

    -- Cortar referencias internas antes del borrado masivo. Ambas columnas son
    -- opcionales y usan ON DELETE RESTRICT, por lo que deben quedar vacías
    -- incluso cuando se eliminarán todas las filas del mismo espacio.
    if to_regclass('public.finance_categories') is not null then
        update public.finance_categories
        set parent_id = null
        where workspace_id = target_workspace and parent_id is not null;
    end if;
    if to_regclass('public.finance_monthly_closes') is not null then
        update public.finance_monthly_closes
        set previous_close_id = null
        where workspace_id = target_workspace and previous_close_id is not null;
    end if;

    foreach target_table in array array[
        'finance_attachments',
        'finance_asset_valuations',
        'finance_goal_entries',
        'finance_payments',
        'finance_transactions',
        'finance_obligations',
        'finance_migration_errors',
        'finance_migration_runs',
        'finance_budgets',
        'finance_monthly_closes',
        'finance_saved_filters',
        'finance_recurrences',
        'finance_goals',
        'finance_assets',
        'finance_payment_methods',
        'finance_categories',
        'finance_accounts',
        'finance_contexts',
        'finance_audit_log'
    ] loop
        if to_regclass('public.' || target_table) is not null then
            execute format('delete from public.%I where workspace_id = $1', target_table)
            using target_workspace;
            get diagnostics deleted_rows = row_count;
            total_rows := total_rows + deleted_rows;
        end if;
    end loop;

    if to_regclass('public.hr_attendance_records') is not null then
        delete from public.hr_attendance_records where workspace_id = target_workspace;
        get diagnostics deleted_rows = row_count;
        total_rows := total_rows + deleted_rows;
    end if;

    delete from public.app_data where workspace_id = target_workspace;
    get diagnostics deleted_rows = row_count;
    total_rows := total_rows + deleted_rows;

    return jsonb_build_object(
        'workspace_id', target_workspace,
        'deleted_rows', total_rows,
        'reset_at', clock_timestamp()
    );
end;
$$;

revoke all on function public.atlas_reset_workspace_data(uuid) from public, anon;
grant execute on function public.atlas_reset_workspace_data(uuid) to authenticated;

commit;
