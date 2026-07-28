-- ATLAS SO v0.3 · ejecutar una sola vez en Supabase > SQL Editor.
-- La publishable key puede usarse en el navegador porque estas políticas RLS
-- son las que deciden qué filas puede leer o modificar cada cuenta.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null default '',
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text unique,
    owner_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'member' check (role in ('owner', 'admin', 'editor', 'viewer')),
    created_at timestamptz not null default now(),
    primary key (workspace_id, user_id)
);

create table if not exists public.app_data (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    data_key text not null,
    value jsonb not null default 'null'::jsonb,
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (workspace_id, data_key)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'atlas-files',
    'atlas-files',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_workspace_member(target_workspace uuid)
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
    );
$$;

create or replace function public.can_edit_workspace(target_workspace uuid)
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
          and role in ('owner', 'admin', 'editor')
    );
$$;

create or replace function public.create_personal_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    current_user_id uuid := auth.uid();
    workspace_id_result uuid;
    display_name text;
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    select wm.workspace_id into workspace_id_result
    from public.workspace_members wm
    where wm.user_id = current_user_id
    order by wm.created_at
    limit 1;

    if workspace_id_result is not null then
        return workspace_id_result;
    end if;

    select coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), split_part(email, '@', 1), 'Mi espacio')
    into display_name
    from auth.users
    where id = current_user_id;

    insert into public.profiles (id, full_name)
    values (current_user_id, display_name)
    on conflict (id) do nothing;

    insert into public.workspaces (name, owner_id)
    values (display_name || ' · ATLAS SO', current_user_id)
    returning id into workspace_id_result;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (workspace_id_result, current_user_id, 'owner');

    return workspace_id_result;
end;
$$;

create or replace function public.create_personal_workspace_for(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    result_id uuid;
    display_name text;
begin
    select workspace_id into result_id
    from public.workspace_members
    where user_id = target_user
    order by created_at
    limit 1;
    if result_id is not null then return result_id; end if;

    select coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), split_part(email, '@', 1), 'Usuario')
    into display_name
    from auth.users
    where id = target_user;

    insert into public.workspaces (name, owner_id)
    values (display_name || ' · ATLAS SO', target_user)
    returning id into result_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (result_id, target_user, 'owner');
    return result_id;
end;
$$;

create or replace function public.handle_new_atlas_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name)
    values (
        new.id,
        coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1), 'Usuario')
    )
    on conflict (id) do nothing;

    perform public.create_personal_workspace_for(new.id);
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_atlas on auth.users;
create trigger on_auth_user_created_atlas
    after insert on auth.users
    for each row execute procedure public.handle_new_atlas_user();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.app_data enable row level security;

drop policy if exists "atlas_files_select" on storage.objects;
create policy "atlas_files_select" on storage.objects
    for select to authenticated using (
        bucket_id = 'atlas-files'
        and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists "atlas_files_insert" on storage.objects;
create policy "atlas_files_insert" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'atlas-files'
        and public.can_edit_workspace(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists "atlas_files_update" on storage.objects;
create policy "atlas_files_update" on storage.objects
    for update to authenticated using (
        bucket_id = 'atlas-files'
        and public.can_edit_workspace(((storage.foldername(name))[1])::uuid)
    ) with check (
        bucket_id = 'atlas-files'
        and public.can_edit_workspace(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists "atlas_files_delete" on storage.objects;
create policy "atlas_files_delete" on storage.objects
    for delete to authenticated using (
        bucket_id = 'atlas-files'
        and public.can_edit_workspace(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
    for select to authenticated using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
    for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces
    for select to authenticated using (public.is_workspace_member(id));

drop policy if exists "workspaces_update_admin" on public.workspaces;
create policy "workspaces_update_admin" on public.workspaces
    for update to authenticated using (public.can_edit_workspace(id)) with check (public.can_edit_workspace(id));

drop policy if exists "members_select_member" on public.workspace_members;
create policy "members_select_member" on public.workspace_members
    for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists "members_manage_admin" on public.workspace_members;
create policy "members_manage_admin" on public.workspace_members
    for all to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));

drop policy if exists "app_data_select_member" on public.app_data;
create policy "app_data_select_member" on public.app_data
    for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists "app_data_insert_editor" on public.app_data;
create policy "app_data_insert_editor" on public.app_data
    for insert to authenticated with check (
        public.can_edit_workspace(workspace_id) and updated_by = auth.uid()
    );

drop policy if exists "app_data_update_editor" on public.app_data;
create policy "app_data_update_editor" on public.app_data
    for update to authenticated using (public.can_edit_workspace(workspace_id))
    with check (public.can_edit_workspace(workspace_id) and updated_by = auth.uid());

drop policy if exists "app_data_delete_admin" on public.app_data;
create policy "app_data_delete_admin" on public.app_data
    for delete to authenticated using (public.can_edit_workspace(workspace_id));

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.app_data to authenticated;
grant execute on function public.create_personal_workspace() to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;

revoke all on function public.create_personal_workspace_for(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_atlas_user() from public, anon, authenticated;

revoke all on public.profiles from anon;
revoke all on public.workspaces from anon;
revoke all on public.workspace_members from anon;
revoke all on public.app_data from anon;

-- ATLAS SO v0.4 · administrador privado de Recursos Humanos.
-- La primera cuenta creada queda fijada una sola vez como administradora.
create table if not exists public.atlas_system_settings (
    singleton boolean primary key default true check (singleton),
    hr_admin_user_id uuid not null references auth.users(id) on delete restrict,
    updated_at timestamptz not null default now()
);

insert into public.atlas_system_settings (singleton, hr_admin_user_id)
select true, id
from auth.users
order by created_at asc
limit 1
on conflict (singleton) do nothing;

alter table public.atlas_system_settings enable row level security;

create or replace function public.is_hr_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.atlas_system_settings
        where singleton = true
          and hr_admin_user_id = auth.uid()
    );
$$;

revoke all on public.atlas_system_settings from public, anon, authenticated;
grant execute on function public.is_hr_admin() to authenticated;

create or replace function public.can_access_app_data(target_workspace uuid, target_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_workspace_member(target_workspace)
       and (target_key not like 'atlasHR%' or public.is_hr_admin());
$$;

drop policy if exists "app_data_select_member" on public.app_data;
create policy "app_data_select_member" on public.app_data
    for select to authenticated using (
        public.can_access_app_data(workspace_id, data_key)
    );

drop policy if exists "app_data_insert_editor" on public.app_data;
create policy "app_data_insert_editor" on public.app_data
    for insert to authenticated with check (
        public.can_edit_workspace(workspace_id)
        and public.can_access_app_data(workspace_id, data_key)
        and updated_by = auth.uid()
    );

drop policy if exists "app_data_update_editor" on public.app_data;
create policy "app_data_update_editor" on public.app_data
    for update to authenticated using (
        public.can_edit_workspace(workspace_id)
        and public.can_access_app_data(workspace_id, data_key)
    ) with check (
        public.can_edit_workspace(workspace_id)
        and public.can_access_app_data(workspace_id, data_key)
        and updated_by = auth.uid()
    );

drop policy if exists "app_data_delete_admin" on public.app_data;
create policy "app_data_delete_admin" on public.app_data
    for delete to authenticated using (
        public.can_edit_workspace(workspace_id)
        and public.can_access_app_data(workspace_id, data_key)
    );

grant execute on function public.can_access_app_data(uuid, text) to authenticated;
