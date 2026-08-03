-- ATLAS SO v0.8 · privacidad, permisos y restauración atómica.
-- Ejecutar una sola vez después de v0.7.1-security-hardening.sql en bases existentes.

begin;

-- La administración de RR. HH. nunca se concede automáticamente a un alta nueva.
-- Se conserva el administrador que ya exista en atlas_system_settings.
drop trigger if exists on_auth_user_created_atlas_hr_admin on auth.users;
drop function if exists public.assign_first_hr_admin();

revoke create on schema public from public, anon, authenticated;
grant usage on schema public to authenticated;

alter table public.app_data
    add column if not exists client_updated_at timestamptz not null default clock_timestamp();

alter table public.hr_attendance_records
    add column if not exists client_updated_at timestamptz not null default clock_timestamp();

create index if not exists app_data_client_updated_idx
    on public.app_data (workspace_id, client_updated_at desc);

create table if not exists public.hr_attendance_tombstones (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    company_id text not null,
    record_id text not null,
    employee_id text,
    work_date date,
    deleted_by uuid references auth.users(id) on delete set null,
    deleted_at timestamptz not null default clock_timestamp(),
    primary key (workspace_id, company_id, record_id)
);

create index if not exists hr_attendance_tombstones_logical_idx
    on public.hr_attendance_tombstones (workspace_id, company_id, employee_id, work_date, deleted_at desc);

alter table public.hr_attendance_tombstones enable row level security;

create or replace function public.is_hr_data_key(target_key text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
    select lower(coalesce(target_key, '')) like 'atlashr%';
$$;

create or replace function public.storage_workspace_id(object_name text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
declare
    candidate text := split_part(coalesce(object_name, ''), '/', 1);
begin
    if candidate !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        return null;
    end if;
    return candidate::uuid;
exception when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.storage_receipt_path_is_valid(object_name text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, public
as $$
    select public.storage_workspace_id(object_name) is not null
       and array_length(string_to_array(coalesce(object_name, ''), '/'), 1) = 3
       and split_part(object_name, '/', 2) ~ '^[A-Za-z0-9_-]{1,128}$'
       and split_part(object_name, '/', 3) ~ '^[A-Za-z0-9._-]{1,100}$';
$$;

alter function public.is_workspace_member(uuid) set search_path = pg_catalog, public;
alter function public.can_edit_workspace(uuid) set search_path = pg_catalog, public;
alter function public.can_manage_workspace(uuid) set search_path = pg_catalog, public;
alter function public.create_personal_workspace() set search_path = pg_catalog, public;
alter function public.create_personal_workspace_for(uuid) set search_path = pg_catalog, public;
alter function public.handle_new_atlas_user() set search_path = pg_catalog, public;
alter function public.is_hr_admin() set search_path = pg_catalog, public;

create or replace function public.can_access_app_data(target_workspace uuid, target_key text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
    select public.is_workspace_member(target_workspace)
       and (not public.is_hr_data_key(target_key) or public.is_hr_admin());
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.can_edit_workspace(uuid) from public, anon;
revoke all on function public.can_manage_workspace(uuid) from public, anon;
revoke all on function public.create_personal_workspace() from public, anon;
revoke all on function public.is_hr_admin() from public, anon;
revoke all on function public.can_access_app_data(uuid, text) from public, anon;
revoke all on function public.is_hr_data_key(text) from public, anon;
revoke all on function public.storage_workspace_id(text) from public, anon;
revoke all on function public.storage_receipt_path_is_valid(text) from public, anon;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;
grant execute on function public.can_manage_workspace(uuid) to authenticated;
grant execute on function public.create_personal_workspace() to authenticated;
grant execute on function public.is_hr_admin() to authenticated;
grant execute on function public.can_access_app_data(uuid, text) to authenticated;
grant execute on function public.is_hr_data_key(text) to authenticated;
grant execute on function public.storage_workspace_id(text) to authenticated;
grant execute on function public.storage_receipt_path_is_valid(text) to authenticated;

revoke all on function public.create_personal_workspace_for(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_atlas_user() from public, anon, authenticated;

drop policy if exists "atlas_files_select" on storage.objects;
create policy "atlas_files_select" on storage.objects
for select to authenticated
using (
    bucket_id = 'atlas-files'
    and public.storage_receipt_path_is_valid(name)
    and public.is_workspace_member(public.storage_workspace_id(name))
);

drop policy if exists "atlas_files_insert" on storage.objects;
create policy "atlas_files_insert" on storage.objects
for insert to authenticated
with check (
    bucket_id = 'atlas-files'
    and public.storage_receipt_path_is_valid(name)
    and public.can_edit_workspace(public.storage_workspace_id(name))
);

drop policy if exists "atlas_files_update" on storage.objects;
create policy "atlas_files_update" on storage.objects
for update to authenticated
using (
    bucket_id = 'atlas-files'
    and public.storage_receipt_path_is_valid(name)
    and public.can_edit_workspace(public.storage_workspace_id(name))
)
with check (
    bucket_id = 'atlas-files'
    and public.storage_receipt_path_is_valid(name)
    and public.can_edit_workspace(public.storage_workspace_id(name))
);

drop policy if exists "atlas_files_delete" on storage.objects;
create policy "atlas_files_delete" on storage.objects
for delete to authenticated
using (
    bucket_id = 'atlas-files'
    and public.storage_receipt_path_is_valid(name)
    and public.can_edit_workspace(public.storage_workspace_id(name))
);

drop policy if exists "app_data_select_member" on public.app_data;
create policy "app_data_select_member" on public.app_data
for select to authenticated
using (public.can_access_app_data(workspace_id, data_key));

drop policy if exists "app_data_insert_editor" on public.app_data;
create policy "app_data_insert_editor" on public.app_data
for insert to authenticated
with check (
    public.can_edit_workspace(workspace_id)
    and public.can_access_app_data(workspace_id, data_key)
    and updated_by = auth.uid()
);

drop policy if exists "app_data_update_editor" on public.app_data;
create policy "app_data_update_editor" on public.app_data
for update to authenticated
using (
    public.can_edit_workspace(workspace_id)
    and public.can_access_app_data(workspace_id, data_key)
)
with check (
    public.can_edit_workspace(workspace_id)
    and public.can_access_app_data(workspace_id, data_key)
    and updated_by = auth.uid()
);

drop policy if exists "app_data_delete_admin" on public.app_data;
create policy "app_data_delete_admin" on public.app_data
for delete to authenticated
using (
    public.can_edit_workspace(workspace_id)
    and public.can_access_app_data(workspace_id, data_key)
);

create or replace function public.stamp_app_data_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
    if auth.uid() is not null then
        new.updated_by := auth.uid();
        new.updated_at := clock_timestamp();
        new.client_updated_at := coalesce(new.client_updated_at, new.updated_at);
    end if;
    return new;
end;
$$;

drop trigger if exists stamp_app_data_write on public.app_data;
create trigger stamp_app_data_write
before insert or update on public.app_data
for each row execute function public.stamp_app_data_write();

create or replace function public.stamp_hr_attendance_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
    if auth.uid() is not null then
        new.updated_by := auth.uid();
        new.updated_at := clock_timestamp();
        new.client_updated_at := coalesce(new.client_updated_at, new.updated_at);
    end if;
    return new;
end;
$$;

drop trigger if exists stamp_hr_attendance_write on public.hr_attendance_records;
create trigger stamp_hr_attendance_write
before insert or update on public.hr_attendance_records
for each row execute function public.stamp_hr_attendance_write();

revoke all on function public.stamp_app_data_write() from public, anon, authenticated;
revoke all on function public.stamp_hr_attendance_write() from public, anon, authenticated;

create or replace function public.upsert_app_data_if_newer(
    target_workspace uuid,
    target_key text,
    target_value jsonb,
    target_client_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    result jsonb;
begin
    if auth.uid() is null
       or not public.can_edit_workspace(target_workspace)
       or not public.can_access_app_data(target_workspace, target_key) then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if target_key is null
       or length(target_key) < 1
       or length(target_key) > 200
       or target_client_updated_at is null
       or target_client_updated_at < timestamptz '2000-01-01 00:00:00+00'
       or target_client_updated_at > clock_timestamp() + interval '5 minutes' then
        raise exception 'Invalid app data write' using errcode = '22023';
    end if;

    insert into public.app_data as current_row (
        workspace_id, data_key, value, updated_by, client_updated_at
    ) values (
        target_workspace,
        target_key,
        coalesce(target_value, 'null'::jsonb),
        auth.uid(),
        target_client_updated_at
    )
    on conflict (workspace_id, data_key) do update
    set value = excluded.value,
        updated_by = auth.uid(),
        client_updated_at = excluded.client_updated_at
    where excluded.client_updated_at >= current_row.client_updated_at
    returning jsonb_build_object(
        'applied', true,
        'value', value,
        'client_updated_at', client_updated_at,
        'updated_at', updated_at
    ) into result;

    if result is null then
        select jsonb_build_object(
            'applied', false,
            'value', value,
            'client_updated_at', client_updated_at,
            'updated_at', updated_at
        )
        into result
        from public.app_data
        where workspace_id = target_workspace
          and data_key = target_key;
    end if;
    return result;
end;
$$;

create or replace function public.upsert_hr_attendance_if_newer(
    target_workspace uuid,
    target_company text,
    records jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    row_data record;
    row_timestamp timestamptz;
    affected integer;
    applied integer := 0;
begin
    if auth.uid() is null
       or not public.is_hr_admin()
       or not public.can_edit_workspace(target_workspace) then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if nullif(btrim(target_company), '') is null
       or records is null
       or jsonb_typeof(records) <> 'array'
       or jsonb_array_length(records) > 500 then
        raise exception 'Invalid attendance batch' using errcode = '22023';
    end if;

    for row_data in
        select * from jsonb_to_recordset(records) as batch(
            id text,
            employee_id text,
            client_id text,
            clock_id text,
            source_name text,
            work_date date,
            time_in text,
            time_out text,
            raw_status text,
            resolved_status text,
            note text,
            source_import_id text,
            client_updated_at timestamptz,
            updated_at timestamptz
        )
    loop
        row_timestamp := coalesce(row_data.client_updated_at, row_data.updated_at, clock_timestamp());
        if nullif(btrim(row_data.employee_id), '') is null
           or row_data.work_date is null
           or length(coalesce(row_data.id, '')) > 256
           or length(row_data.employee_id) > 256
           or row_timestamp < timestamptz '2000-01-01 00:00:00+00'
           or row_timestamp > clock_timestamp() + interval '5 minutes' then
            raise exception 'Attendance batch contains invalid records' using errcode = '22023';
        end if;

        if exists (
            select 1 from public.hr_attendance_tombstones tombstone
            where tombstone.workspace_id = target_workspace
              and tombstone.company_id = target_company
              and (
                  tombstone.record_id = coalesce(nullif(row_data.id, ''), row_data.employee_id || '-' || row_data.work_date::text)
                  or (tombstone.employee_id = row_data.employee_id and tombstone.work_date = row_data.work_date)
              )
              and tombstone.deleted_at >= row_timestamp
        ) then
            continue;
        end if;

        delete from public.hr_attendance_tombstones tombstone
        where tombstone.workspace_id = target_workspace
          and tombstone.company_id = target_company
          and (
              tombstone.record_id = coalesce(nullif(row_data.id, ''), row_data.employee_id || '-' || row_data.work_date::text)
              or (tombstone.employee_id = row_data.employee_id and tombstone.work_date = row_data.work_date)
          )
          and tombstone.deleted_at < row_timestamp;

        insert into public.hr_attendance_records as current_row (
            id, workspace_id, company_id, client_id, employee_id, clock_id,
            source_name, work_date, time_in, time_out, raw_status, resolved_status,
            note, source_import_id, updated_by, client_updated_at
        ) values (
            coalesce(nullif(row_data.id, ''), gen_random_uuid()::text),
            target_workspace,
            target_company,
            nullif(row_data.client_id, ''),
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
            row_timestamp
        )
        on conflict (workspace_id, company_id, employee_id, work_date) do update
        set client_id = excluded.client_id,
            clock_id = excluded.clock_id,
            source_name = excluded.source_name,
            time_in = excluded.time_in,
            time_out = excluded.time_out,
            raw_status = excluded.raw_status,
            resolved_status = excluded.resolved_status,
            note = excluded.note,
            source_import_id = excluded.source_import_id,
            updated_by = auth.uid(),
            client_updated_at = excluded.client_updated_at
        where excluded.client_updated_at >= current_row.client_updated_at;
        get diagnostics affected = row_count;
        applied := applied + affected;
    end loop;
    return applied;
end;
$$;

create or replace function public.delete_hr_attendance_records(
    target_workspace uuid,
    target_company text,
    records jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    row_data record;
    existing_employee text;
    existing_date date;
    affected integer;
    deleted_count integer := 0;
begin
    if auth.uid() is null
       or not public.is_hr_admin()
       or not public.can_edit_workspace(target_workspace) then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if nullif(btrim(target_company), '') is null
       or records is null
       or jsonb_typeof(records) <> 'array'
       or jsonb_array_length(records) > 200 then
        raise exception 'Invalid attendance deletion batch' using errcode = '22023';
    end if;

    for row_data in
        select * from jsonb_to_recordset(records) as batch(id text, deleted_at timestamptz)
    loop
        if nullif(btrim(row_data.id), '') is null or length(row_data.id) > 256 then
            raise exception 'Attendance deletion contains invalid identifiers' using errcode = '22023';
        end if;
        existing_employee := null;
        existing_date := null;
        select employee_id, work_date
        into existing_employee, existing_date
        from public.hr_attendance_records
        where workspace_id = target_workspace
          and company_id = target_company
          and id = row_data.id;

        if row_data.deleted_at is not null and (
            row_data.deleted_at < timestamptz '2000-01-01 00:00:00+00'
            or row_data.deleted_at > clock_timestamp() + interval '5 minutes'
        ) then
            raise exception 'Attendance deletion contains an invalid timestamp' using errcode = '22023';
        end if;

        insert into public.hr_attendance_tombstones (
            workspace_id, company_id, record_id, employee_id, work_date, deleted_by, deleted_at
        ) values (
            target_workspace,
            target_company,
            row_data.id,
            existing_employee,
            existing_date,
            auth.uid(),
            coalesce(row_data.deleted_at, clock_timestamp())
        )
        on conflict (workspace_id, company_id, record_id) do update
        set employee_id = coalesce(excluded.employee_id, public.hr_attendance_tombstones.employee_id),
            work_date = coalesce(excluded.work_date, public.hr_attendance_tombstones.work_date),
            deleted_by = auth.uid(),
            deleted_at = greatest(public.hr_attendance_tombstones.deleted_at, excluded.deleted_at);

        delete from public.hr_attendance_records
        where workspace_id = target_workspace
          and company_id = target_company
          and id = row_data.id;
        get diagnostics affected = row_count;
        deleted_count := deleted_count + affected;
    end loop;
    return deleted_count;
end;
$$;

revoke all on function public.upsert_app_data_if_newer(uuid, text, jsonb, timestamptz) from public, anon;
revoke all on function public.upsert_hr_attendance_if_newer(uuid, text, jsonb) from public, anon;
revoke all on function public.delete_hr_attendance_records(uuid, text, jsonb) from public, anon;
grant execute on function public.upsert_app_data_if_newer(uuid, text, jsonb, timestamptz) to authenticated;
grant execute on function public.upsert_hr_attendance_if_newer(uuid, text, jsonb) to authenticated;
grant execute on function public.delete_hr_attendance_records(uuid, text, jsonb) to authenticated;

create or replace function public.restore_hr_attendance_backup(target_workspace uuid, records jsonb)
returns integer
language plpgsql
security definer
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
            id text,
            company_id text,
            employee_id text,
            work_date date,
            updated_at timestamptz,
            client_updated_at timestamptz
        )
        where nullif(btrim(invalid_row.company_id), '') is null
           or nullif(btrim(invalid_row.employee_id), '') is null
           or invalid_row.work_date is null
           or length(coalesce(invalid_row.id, '')) > 256
           or length(invalid_row.company_id) > 256
           or length(invalid_row.employee_id) > 256
           or coalesce(invalid_row.client_updated_at, invalid_row.updated_at, clock_timestamp()) < timestamptz '2000-01-01 00:00:00+00'
           or coalesce(invalid_row.client_updated_at, invalid_row.updated_at, clock_timestamp()) > clock_timestamp() + interval '5 minutes'
    ) then
        raise exception 'Attendance backup contains invalid records' using errcode = '22023';
    end if;

    insert into public.hr_attendance_tombstones (
        workspace_id, company_id, record_id, employee_id, work_date, deleted_by, deleted_at
    )
    select
        existing.workspace_id,
        existing.company_id,
        existing.id,
        existing.employee_id,
        existing.work_date,
        auth.uid(),
        clock_timestamp()
    from public.hr_attendance_records existing
    where existing.workspace_id = target_workspace
      and not exists (
          select 1
          from jsonb_to_recordset(records) as restored(
              id text, company_id text, employee_id text, work_date date
          )
          where restored.id = existing.id
             or (
                 restored.company_id = existing.company_id
                 and restored.employee_id = existing.employee_id
                 and restored.work_date = existing.work_date
             )
      )
    on conflict (workspace_id, company_id, record_id) do update
    set employee_id = excluded.employee_id,
        work_date = excluded.work_date,
        deleted_by = auth.uid(),
        deleted_at = excluded.deleted_at;

    delete from public.hr_attendance_records
    where workspace_id = target_workspace;

    insert into public.hr_attendance_records (
        id, workspace_id, company_id, client_id, employee_id, clock_id,
        source_name, work_date, time_in, time_out, raw_status, resolved_status,
        note, source_import_id, updated_by, client_updated_at
    )
    select
        coalesce(nullif(row_data.id, ''), gen_random_uuid()::text),
        target_workspace,
        row_data.company_id,
        nullif(row_data.client_id, ''),
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
        coalesce(row_data.client_updated_at, row_data.updated_at, clock_timestamp())
    from jsonb_to_recordset(records) as row_data(
        id text,
        workspace_id uuid,
        company_id text,
        client_id text,
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
        updated_at timestamptz,
        client_updated_at timestamptz
    );

    get diagnostics restored_count = row_count;

    delete from public.hr_attendance_tombstones tombstone
    using public.hr_attendance_records restored
    where restored.workspace_id = target_workspace
      and tombstone.workspace_id = restored.workspace_id
      and tombstone.company_id = restored.company_id
      and (
          tombstone.record_id = restored.id
          or (tombstone.employee_id = restored.employee_id and tombstone.work_date = restored.work_date)
      );

    return restored_count;
end;
$$;

revoke all on function public.restore_hr_attendance_backup(uuid, jsonb) from public, anon;
grant execute on function public.restore_hr_attendance_backup(uuid, jsonb) to authenticated;

revoke all on public.atlas_system_settings from public, anon, authenticated;
revoke all on public.app_data from public, anon, authenticated;
grant select on public.app_data to authenticated;
revoke all on public.hr_attendance_records from public, anon, authenticated;
grant select on public.hr_attendance_records to authenticated;
revoke all on public.hr_attendance_tombstones from public, anon, authenticated;

commit;
