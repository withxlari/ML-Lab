create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text check (length(btrim(display_name)) between 1 and 80),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now() check (updated_at >= created_at)
);
create table public.user_library (
    user_id uuid not null references public.profiles(id) on delete cascade,
    media_key text not null check (media_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(media_key)<=100),
    media_snapshot jsonb not null check (
        jsonb_typeof(media_snapshot)='object' and media_snapshot ? 'slug' and media_snapshot->>'slug'=media_key
        and octet_length(media_snapshot::text)<=100000
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now() check (updated_at >= created_at),
    primary key (user_id,media_key)
);
create index user_library_recent on public.user_library (user_id,created_at desc,media_key);

alter table public.profiles enable row level security;
alter table public.user_library enable row level security;
revoke all on public.profiles,public.user_library from anon,authenticated;
grant select on public.profiles to authenticated;
grant insert (id,display_name) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select,delete on public.user_library to authenticated;
grant insert (user_id,media_key,media_snapshot) on public.user_library to authenticated;
grant update (user_id,media_key,media_snapshot) on public.user_library to authenticated;

create policy "Read own profile" on public.profiles for select to authenticated
    using ((select auth.uid())=id);
create policy "Create own profile" on public.profiles for insert to authenticated
    with check ((select auth.uid())=id);
create policy "Edit own profile" on public.profiles for update to authenticated
    using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy "Read own library" on public.user_library for select to authenticated
    using ((select auth.uid())=user_id);
create policy "Add to own library" on public.user_library for insert to authenticated
    with check ((select auth.uid())=user_id);
create policy "Edit own library" on public.user_library for update to authenticated
    using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Remove from own library" on public.user_library for delete to authenticated
    using ((select auth.uid())=user_id);

create function public.refresh_account_timestamp() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    new.created_at := old.created_at;
    new.updated_at := now();
    return new;
end;
$$;
revoke all on function public.refresh_account_timestamp() from public,anon,authenticated;
create trigger profile_updated before update on public.profiles
    for each row execute function public.refresh_account_timestamp();
create trigger library_updated before update on public.user_library
    for each row execute function public.refresh_account_timestamp();
comment on table public.user_library is
    'Private per-user favorites. Validated metadata snapshot supports works not imported into the shared catalog. Not ratings or recommendation events.';
