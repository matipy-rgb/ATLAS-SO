-- ATLAS SO v0.8 · privacidad, permisos y restauración atómica.
-- Ejecutar una sola vez después de v0.7.1-security-hardening.sql en bases existentes.

begin;

-- La administración de RR. HH. nunca se concede automáticamente a un alta nueva.
-- Se conserva el administrador que ya exista en atlas_system_settings.
drop trigger if exists on_auth_user_created_atlas_hr_admin on auth.users;
drop function if exists public.assign_first_hr_admin();

revoke create on schema public from public, anon, authenticated;
grant usage on schema public to authenticated;

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

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;
grant execute on function public.can_manage_workspace(uuid) to authenticated;
grant execute on function public.create_personal_workspace() to authenticated;
grant execute on function public.is_hr_admin() to authenticated;
grant execute on function public.can_access_app_data(uuid, text) to authenticated;
grant execute on function public.is_hr_data_key(text) to authenticated;
grant execute on function public.storage_workspace_id(text) to authenticated;

revoke all on function public.create_personal_workspace_for(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_atlas_user() from public, anon, authenticated;

drop policy if exists "atlas_files_select" on storage.objects;
create policy "atlas_files_select" on storage.objects
for select to authenticated
using (
    bucket_id = 'atlas-files'
    and public.storage_workspace_id(name) is not null
    and public.is_workspace_member(public.storage_workspace_id(name))
);

drop policy if exists "atlas_files_insert" on storage.objects;
create policy "atlas_files_insert" on storage.objects
for insert to authenticated
with check (
    bucket_id = 'atlas-files'
    and public.storage_workspace_id(name) is not null
    and public.can_edit_workspace(public.storage_workspace_id(name))
);

drop policy if exists "atlas_files_update" on storage.objects;
create policy "atlas_files_update" on storage.objects
for update to authenticated
using (
    bucket_id = 'atlas-files'
    and public.storage_workspace_id(name) is not null
    and public.can_edit_workspace(public.storage_workspace_id(name))
)
with check (
    bucket_id = 'atlas-files'
    and public.storage_workspace_id(name) is not null
    and public.can_edit_workspace(public.storage_workspace_id(name))
);

drop policy if exists "atlas_files_delete" on storage.objects;
create policy "atlas_files_delete" on storage.objects
for delete to authenticated
using (
    bucket_id = 'atlas-files'
    and public.storage_workspace_id(name) is not null
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
            id text, company_id text, employee_id text, work_date date
        )
        where nullif(btrim(invalid_row.company_id), '') is null
           or nullif(btrim(invalid_row.employee_id), '') is null
           or invalid_row.work_date is null
           or length(coalesce(invalid_row.id, '')) > 256
           or length(invalid_row.company_id) > 256
           or length(invalid_row.employee_id) > 256
    ) then
        raise exception 'Attendance backup contains invalid records' using errcode = '22023';
    end if;

    delete from public.hr_attendance_records
    where workspace_id = target_workspace;

    insert into public.hr_attendance_records (
        id, workspace_id, company_id, client_id, employee_id, clock_id,
        source_name, work_date, time_in, time_out, raw_status, resolved_status,
        note, source_import_id, updated_by, updated_at
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
        coalesce(row_data.updated_at, clock_timestamp())
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
        updated_at timestamptz
    );

    get diagnostics restored_count = row_count;
    return restored_count;
end;
$$;

revoke all on function public.restore_hr_attendance_backup(uuid, jsonb) from public, anon;
grant execute on function public.restore_hr_attendance_backup(uuid, jsonb) to authenticated;

revoke all on public.atlas_system_settings from public, anon, authenticated;
revoke all on public.app_data from anon;
revoke all on public.hr_attendance_records from anon;

commit;
