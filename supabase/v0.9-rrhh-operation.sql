-- ATLAS SO v0.9 · contexto de sucursal y asignación en marcaciones.
-- Requisito: ejecutar después de v0.8-security-privacy-sync.sql.
-- Aditiva e idempotente: no elimina tablas ni datos existentes.

begin;

alter table public.hr_attendance_records
    add column if not exists branch_id text,
    add column if not exists assignment_id text;

create index if not exists hr_attendance_branch_period_idx
    on public.hr_attendance_records (workspace_id, company_id, client_id, branch_id, work_date);

create index if not exists hr_attendance_assignment_idx
    on public.hr_attendance_records (workspace_id, company_id, assignment_id);

create or replace function public.restore_hr_attendance_backup(target_workspace uuid, records jsonb)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
    restored_count integer := 0;
begin
    if auth.uid() is null
       or not public.is_hr_admin()
       or not public.can_edit_workspace(target_workspace) then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if records is null or jsonb_typeof(records) <> 'array' then
        raise exception 'Invalid attendance backup' using errcode = '22023';
    end if;
    if jsonb_array_length(records) > 250000 then
        raise exception 'Attendance backup is too large' using errcode = '54000';
    end if;
    if exists (
        select 1
        from jsonb_to_recordset(records) as invalid_row(
            id text, company_id text, employee_id text, work_date date,
            client_id text, branch_id text, assignment_id text
        )
        where nullif(btrim(invalid_row.company_id), '') is null
           or nullif(btrim(invalid_row.employee_id), '') is null
           or invalid_row.work_date is null
           or length(coalesce(invalid_row.id, '')) > 256
           or length(invalid_row.company_id) > 256
           or length(invalid_row.employee_id) > 256
           or length(coalesce(invalid_row.client_id, '')) > 256
           or length(coalesce(invalid_row.branch_id, '')) > 256
           or length(coalesce(invalid_row.assignment_id, '')) > 256
    ) then
        raise exception 'Attendance backup contains invalid records' using errcode = '22023';
    end if;

    delete from public.hr_attendance_records
    where workspace_id = target_workspace;

    insert into public.hr_attendance_records (
        id, workspace_id, company_id, client_id, branch_id, assignment_id,
        employee_id, clock_id, source_name, work_date, time_in, time_out,
        raw_status, resolved_status, note, source_import_id, updated_by, updated_at
    )
    select
        coalesce(nullif(row_data.id, ''), gen_random_uuid()::text),
        target_workspace,
        row_data.company_id,
        nullif(row_data.client_id, ''),
        nullif(row_data.branch_id, ''),
        nullif(row_data.assignment_id, ''),
        row_data.employee_id,
        nullif(row_data.clock_id, ''),
        nullif(row_data.source_name, ''),
        row_data.work_date,
        nullif(row_data.time_in, ''),
        nullif(row_data.time_out, ''),
        nullif(row_data.raw_status, ''),
        nullif(row_data.resolved_status, ''),
        nullif(row_data.note, ''),
        nullif(row_data.source_import_id, ''),
        auth.uid(),
        coalesce(row_data.updated_at, clock_timestamp())
    from jsonb_to_recordset(records) as row_data(
        id text,
        workspace_id uuid,
        company_id text,
        client_id text,
        branch_id text,
        assignment_id text,
        employee_id text,
        clock_id text,
        source_name text,
        work_date date,
        time_in text,
        time_out text,
        raw_status text,
        resolved_status text,
        note text,
        source_import_id text,
        updated_at timestamptz
    );

    get diagnostics restored_count = row_count;
    return restored_count;
end;
$$;

revoke all on function public.restore_hr_attendance_backup(uuid, jsonb) from public, anon;
grant execute on function public.restore_hr_attendance_backup(uuid, jsonb) to authenticated;

revoke all on public.hr_attendance_records from anon;

commit;
