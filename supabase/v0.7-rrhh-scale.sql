-- ATLAS SO v0.7 · ejecutar una sola vez después de v0.4-rrhh-admin.sql.
-- Guarda marcaciones por fila y por mes para no limitar la nómina al espacio
-- disponible en localStorage. Solo el administrador de RR. HH. puede acceder.

create table if not exists public.hr_attendance_records (
    id text primary key,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    company_id text not null,
    client_id text,
    employee_id text not null,
    clock_id text,
    source_name text,
    work_date date not null,
    time_in text,
    time_out text,
    raw_status text,
    resolved_status text,
    note text,
    source_import_id text,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (workspace_id, company_id, employee_id, work_date)
);

create index if not exists hr_attendance_period_idx
    on public.hr_attendance_records (workspace_id, company_id, work_date);
create index if not exists hr_attendance_client_period_idx
    on public.hr_attendance_records (workspace_id, company_id, client_id, work_date);
create index if not exists hr_attendance_clock_idx
    on public.hr_attendance_records (workspace_id, company_id, clock_id);

alter table public.hr_attendance_records enable row level security;

drop policy if exists "hr_attendance_select_admin" on public.hr_attendance_records;
create policy "hr_attendance_select_admin" on public.hr_attendance_records
for select to authenticated
using (
    public.is_hr_admin()
    and public.is_workspace_member(workspace_id)
);

drop policy if exists "hr_attendance_insert_admin" on public.hr_attendance_records;
create policy "hr_attendance_insert_admin" on public.hr_attendance_records
for insert to authenticated
with check (
    public.is_hr_admin()
    and public.can_edit_workspace(workspace_id)
    and updated_by = auth.uid()
);

drop policy if exists "hr_attendance_update_admin" on public.hr_attendance_records;
create policy "hr_attendance_update_admin" on public.hr_attendance_records
for update to authenticated
using (
    public.is_hr_admin()
    and public.can_edit_workspace(workspace_id)
)
with check (
    public.is_hr_admin()
    and public.can_edit_workspace(workspace_id)
    and updated_by = auth.uid()
);

drop policy if exists "hr_attendance_delete_admin" on public.hr_attendance_records;
create policy "hr_attendance_delete_admin" on public.hr_attendance_records
for delete to authenticated
using (
    public.is_hr_admin()
    and public.can_edit_workspace(workspace_id)
);

revoke all on public.hr_attendance_records from public, anon, authenticated;
grant select on public.hr_attendance_records to authenticated;
