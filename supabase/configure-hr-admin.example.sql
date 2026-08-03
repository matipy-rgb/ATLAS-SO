-- Ejecutar manualmente en Supabase > SQL Editor.
-- Reemplazá NULL por el UID verificado de la cuenta principal, por ejemplo:
-- target_user := '00000000-0000-4000-8000-000000000000'::uuid;

do $$
declare
    target_user uuid := null;
begin
    if target_user is null then
        raise exception 'Reemplazá NULL por el UID verificado de la cuenta administradora';
    end if;
    if not exists (select 1 from auth.users where id = target_user) then
        raise exception 'El UID no corresponde a una cuenta de Authentication';
    end if;

    insert into public.atlas_system_settings (singleton, hr_admin_user_id, updated_at)
    values (true, target_user, now())
    on conflict (singleton) do update
    set hr_admin_user_id = excluded.hr_admin_user_id,
        updated_at = excluded.updated_at;
end;
$$;
