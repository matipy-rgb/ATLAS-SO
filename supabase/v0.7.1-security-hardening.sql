-- ATLAS SO v0.7.1 · ejecutar una sola vez después del esquema v0.7.
-- Separa la edición de datos de la administración de miembros.

drop trigger if exists on_auth_user_created_atlas_hr_admin on auth.users;
drop function if exists public.assign_first_hr_admin();

create or replace function public.can_manage_workspace(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.workspace_members
        where workspace_id = target_workspace
          and user_id = auth.uid()
          and role in ('owner', 'admin')
    );
$$;

drop policy if exists "workspaces_update_admin" on public.workspaces;
create policy "workspaces_update_admin" on public.workspaces
    for update to authenticated
    using (public.can_manage_workspace(id))
    with check (public.can_manage_workspace(id));

drop policy if exists "members_manage_admin" on public.workspace_members;

drop policy if exists "members_insert_admin" on public.workspace_members;
create policy "members_insert_admin" on public.workspace_members
    for insert to authenticated
    with check (
        public.can_manage_workspace(workspace_id)
        and role in ('admin', 'editor', 'viewer')
    );

drop policy if exists "members_update_admin" on public.workspace_members;
create policy "members_update_admin" on public.workspace_members
    for update to authenticated
    using (
        public.can_manage_workspace(workspace_id)
        and role <> 'owner'
    )
    with check (
        public.can_manage_workspace(workspace_id)
        and role in ('admin', 'editor', 'viewer')
    );

drop policy if exists "members_delete_admin" on public.workspace_members;
create policy "members_delete_admin" on public.workspace_members
    for delete to authenticated
    using (
        public.can_manage_workspace(workspace_id)
        and role <> 'owner'
    );

grant execute on function public.can_manage_workspace(uuid) to authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, updated_at) on public.profiles to authenticated;

revoke update on public.workspaces from authenticated;
grant update (name, slug, updated_at) on public.workspaces to authenticated;

revoke update on public.workspace_members from authenticated;
grant update (role) on public.workspace_members to authenticated;

drop function if exists public.is_workspace_owner(uuid);
