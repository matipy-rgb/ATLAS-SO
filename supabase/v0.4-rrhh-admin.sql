-- ATLAS SO v0.4 · compatibilidad segura para instalaciones que aún recorren
-- las migraciones históricas. El administrador de RR. HH. se configura solo
-- mediante configure-hr-admin.example.sql con un UID verificado.

create table if not exists public.atlas_system_settings (
    singleton boolean primary key default true check (singleton),
    hr_admin_user_id uuid not null references auth.users(id) on delete restrict,
    updated_at timestamptz not null default now()
);

drop trigger if exists on_auth_user_created_atlas_hr_admin on auth.users;
drop function if exists public.assign_first_hr_admin();

alter table public.atlas_system_settings enable row level security;

create or replace function public.is_hr_admin()
returns boolean language sql stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.atlas_system_settings
        where singleton = true and hr_admin_user_id = auth.uid()
    );
$$;

revoke all on public.atlas_system_settings from public, anon, authenticated;
grant execute on function public.is_hr_admin() to authenticated;

create or replace function public.can_access_app_data(target_workspace uuid, target_key text)
returns boolean language sql stable security definer set search_path = public
as $$
    select public.is_workspace_member(target_workspace)
       and (lower(coalesce(target_key, '')) not like 'atlashr%' or public.is_hr_admin());
$$;

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

grant execute on function public.can_access_app_data(uuid, text) to authenticated;
