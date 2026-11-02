create table public.catalog_items (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
    title text not null check (length(btrim(title)) between 1 and 500),
    original_title text check (length(btrim(original_title)) between 1 and 500),
    media_type text not null check (media_type in ('movie', 'series', 'book')),
    release_year smallint check (release_year between -9999 and 9999 and release_year <> 0),
    creators text[] not null default '{}',
    genres text[] not null default '{}',
    poster_path text check (poster_path ~ '^/images/[a-z0-9._-]+$' and poster_path !~ '\.\.'),
    description text check (length(btrim(description)) between 1 and 20000),
    editorial_note text check (length(btrim(editorial_note)) between 1 and 500),
    source_url text not null check (source_url ~ '^https://' and length(source_url) <= 2048),
    metadata_source text not null default 'manual' check (metadata_source = 'manual'),
    position integer not null check (position >= 0),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now() check (updated_at >= created_at)
);

alter table public.catalog_items enable row level security;
revoke all on public.catalog_items from anon, authenticated;
grant select on public.catalog_items to anon, authenticated;
create policy "Read active editorial titles" on public.catalog_items
    for select to anon, authenticated using (is_active);

comment on table public.catalog_items is
    'Initial manual editorial read model. Contains no accounts or personal data; normalize before general imports.';
