-- Fase 1b: books found at runtime are stored in catalog_items.
-- Idempotent: safe to run more than once. Only additions; existing columns keep name and type.
-- Run after catalog-discovery.sql (constraint names below match the production database).

-- 1. Book columns, enrichment marker and origin
alter table public.catalog_items
  add column if not exists isbn_13 text check (isbn_13 ~ '^97[89][0-9]{10}$'),
  add column if not exists publisher text check (length(btrim(publisher)) between 1 and 300),
  add column if not exists edition_date text check (length(btrim(edition_date)) between 1 and 100),
  add column if not exists language text check (length(btrim(language)) between 1 and 30),
  add column if not exists enriched_at timestamptz,
  add column if not exists origin text not null default 'editorial'
    check (origin in ('editorial','runtime'));

-- 2. Accept google_books as a source (all current rules kept)
alter table public.catalog_items drop constraint if exists catalog_metadata_source;
alter table public.catalog_items add constraint catalog_metadata_source
  check (metadata_source in ('manual','tmdb','open_library','kitsu','igdb','google_books'));

alter table public.catalog_items drop constraint if exists catalog_provider_identity;
alter table public.catalog_items add constraint catalog_provider_identity check (
  (provider is null and provider_entity_type is null and external_id is null)
  or (provider is not null and provider_entity_type is not null and external_id is not null and (
    (provider='tmdb' and provider_entity_type='movie' and media_type='movie' and external_id ~ '^[0-9]+$')
    or (provider='tmdb' and provider_entity_type='tv' and media_type='series' and external_id ~ '^[0-9]+$')
    or (provider='open_library' and provider_entity_type='work' and media_type='book' and external_id ~ '^OL[0-9]+W$')
    or (provider='kitsu' and provider_entity_type='manga' and media_type='manga' and external_id ~ '^[0-9]+$')
    or (provider='igdb' and provider_entity_type='game' and media_type='game' and external_id ~ '^[0-9]+$')
    or (provider='google_books' and provider_entity_type='volume' and media_type='book'
        and external_id ~ '^[A-Za-z0-9_-]{1,80}$')
  ))
);

-- 3. Covers: the formats the backend (MediaItem) and frontend already accept
alter table public.catalog_items drop constraint if exists catalog_poster_source;
alter table public.catalog_items add constraint catalog_poster_source check (
  poster_path is null or (poster_path !~ '\.\.' and (
    poster_path ~ '^/images/[a-z0-9._-]+$'
    or poster_path ~ '^https://image\.tmdb\.org/t/p/w500/[A-Za-z0-9._-]+$'
    or poster_path ~ '^https://covers\.openlibrary\.org/b/id/[0-9]+-L\.jpg\?default=false$'
    or poster_path ~ '^https://covers\.openlibrary\.org/b/isbn/[0-9]{13}-L\.jpg\?default=false$'
    or poster_path ~ '^https://bookinfo-imagens-prod\.s3\.amazonaws\.com/[0-9]{13}-180x240\.jpg$'
    or poster_path ~ '^https://books\.google\.com/books/(publisher/)?content\?[A-Za-z0-9%=&._~+-]+$'
    or poster_path ~ '^https://media\.kitsu\.(app|io)/manga/[A-Za-z0-9/_.-]+$'
    or poster_path ~ '^https://images\.igdb\.com/igdb/image/upload/t_cover_big/[A-Za-z0-9_-]+\.jpg$'
  ))
);

-- 4. Runtime rows are always books from google_books/open_library
alter table public.catalog_items drop constraint if exists catalog_runtime_books;
alter table public.catalog_items add constraint catalog_runtime_books check (
  origin = 'editorial'
  or (media_type = 'book' and provider in ('google_books','open_library') and metadata_source = provider)
);

-- 5. One row per ISBN (slug is already unique: catalog_items_slug_key)
create unique index if not exists catalog_isbn_13_unique
  on public.catalog_items (isbn_13) where isbn_13 is not null and isbn_13 <> '';

-- 6. search_catalog: same as catalog-discovery.sql, plus: an empty listing (no text, no slugs,
--    no id) only shows editorial rows, so searched books never reach the discovery page.
create or replace function public.search_catalog(
    p_media_type text default null, p_query text default '',
    p_limit integer default 24, p_offset integer default 0,
    p_slugs text[] default null, p_id uuid default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
    result jsonb;
    term text;
begin
    if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0
        or length(coalesce(p_query,'')) > 200
        or (p_media_type is not null and p_media_type not in ('movie','series','book','manga','game'))
        or cardinality(p_slugs) > 100 then
        raise exception 'Invalid catalog query' using errcode='22023';
    end if;
    term := replace(replace(replace(lower(extensions.unaccent(trim(coalesce(p_query,'')))),
        E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
    with matches as materialized (
        select c.* from public.catalog_items c
        where c.is_active and (p_media_type is null or c.media_type=p_media_type)
            and (term='' or c.search_document like '%' || term || '%' escape E'\\')
            and (p_slugs is null or c.slug=any(p_slugs))
            and (p_id is null or c.id=p_id)
            and (c.origin='editorial' or term<>'' or p_slugs is not null or p_id is not null)
    ), page as (
        select * from matches order by position,id limit p_limit offset p_offset
    )
    select jsonb_build_object(
        'items',coalesce((select jsonb_agg(to_jsonb(page)-'search_document'-'enriched_at'-'origin'
            order by position,id) from page),'[]'::jsonb),
        'total',(select count(*) from matches),'limit',p_limit,'offset',p_offset
    ) into result;
    return result;
end;
$$;
-- create or replace keeps the existing grants (anon, authenticated).

-- 7. Store one book. Returns the slug of the row that holds it (existing or new).
--    Existing runtime rows only get empty fields filled; editorial rows are never changed.
create or replace function public.upsert_runtime_book(p_item jsonb)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare
    v_id uuid;
    v_slug text;
    v_isbn text;
    v_provider text;
    v_entity text;
    v_external text;
    v_creators text[];
    v_genres text[];
    existing public.catalog_items;
    attempt integer;
begin
    if jsonb_typeof(p_item) is distinct from 'object'
        or octet_length(p_item::text) > 100000
        or p_item->>'media_type' is distinct from 'book'
        or coalesce(p_item->>'provider','') not in ('google_books','open_library')
        or nullif(btrim(p_item->>'title'),'') is null
        or jsonb_typeof(coalesce(p_item->'creators','[]'::jsonb)) <> 'array'
        or jsonb_typeof(coalesce(p_item->'genres','[]'::jsonb)) <> 'array' then
        raise exception 'Invalid book' using errcode='22023';
    end if;
    v_id := (p_item->>'id')::uuid;
    v_slug := p_item->>'slug';
    v_isbn := nullif(p_item->>'isbn_13','');
    v_provider := p_item->>'provider';
    v_entity := p_item->>'provider_entity_type';
    v_external := p_item->>'external_id';
    v_creators := array(
        select left(btrim(x),300) from jsonb_array_elements_text(coalesce(p_item->'creators','[]'::jsonb)) x
        where btrim(x) <> '' limit 20);
    v_genres := array(
        select left(btrim(x),300) from jsonb_array_elements_text(coalesce(p_item->'genres','[]'::jsonb)) x
        where btrim(x) <> '' limit 20);

    for attempt in 1..2 loop
        -- The same book may already exist under any of the four unique keys.
        select c.* into existing from public.catalog_items c
        where c.id = v_id or c.slug = v_slug
           or (v_isbn is not null and c.isbn_13 = v_isbn)
           or (c.provider = v_provider and c.provider_entity_type = v_entity and c.external_id = v_external)
        order by (c.slug = v_slug) desc, (c.isbn_13 is not distinct from v_isbn) desc, c.created_at
        limit 1
        for update;
        if found then
            if existing.origin = 'runtime' then
                update public.catalog_items c set
                    original_title = coalesce(c.original_title, left(nullif(btrim(p_item->>'original_title'),''),300)),
                    release_year = coalesce(c.release_year, nullif(p_item->>'release_year','')::smallint),
                    creators = case when cardinality(c.creators) = 0 then v_creators else c.creators end,
                    genres = case when cardinality(c.genres) = 0 then v_genres else c.genres end,
                    poster_path = coalesce(c.poster_path, nullif(p_item->>'poster_path','')),
                    description = coalesce(c.description, left(nullif(btrim(p_item->>'description'),''),5000)),
                    isbn_13 = coalesce(c.isbn_13, case when v_isbn is not null and not exists (
                        select 1 from public.catalog_items o where o.isbn_13 = v_isbn) then v_isbn end),
                    publisher = coalesce(c.publisher, left(nullif(btrim(p_item->>'publisher'),''),300)),
                    edition_date = coalesce(c.edition_date, left(nullif(btrim(p_item->>'edition_date'),''),100)),
                    language = coalesce(c.language, left(nullif(btrim(p_item->>'language'),''),30))
                where c.id = existing.id;
            end if;
            return existing.slug;
        end if;
        begin
            insert into public.catalog_items (
                id, slug, title, original_title, media_type, release_year, creators, genres,
                poster_path, description, source_url, isbn_13, publisher, edition_date, language,
                provider, provider_entity_type, external_id, metadata_source, metadata_fetched_at,
                position, origin
            ) values (
                v_id, v_slug, left(btrim(p_item->>'title'),300),
                left(nullif(btrim(p_item->>'original_title'),''),300), 'book',
                nullif(p_item->>'release_year','')::smallint, v_creators, v_genres,
                nullif(p_item->>'poster_path',''), left(nullif(btrim(p_item->>'description'),''),5000),
                p_item->>'source_url', v_isbn,
                left(nullif(btrim(p_item->>'publisher'),''),300),
                left(nullif(btrim(p_item->>'edition_date'),''),100),
                left(nullif(btrim(p_item->>'language'),''),30),
                v_provider, v_entity, v_external, v_provider,
                coalesce(nullif(p_item->>'fetched_at','')::timestamptz, now()),
                1000000, 'runtime'
            );
            return v_slug;
        exception when unique_violation then
            -- Another request stored the same book at the same moment: look it up again.
            if attempt = 2 then raise; end if;
        end;
    end loop;
    return null;
end;
$$;
revoke all on function public.upsert_runtime_book(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_runtime_book(jsonb) to service_role;

-- 8. Store a batch (one search). Returns one slug per item, in order; null for an item that
--    could not be stored (invalid data), so one bad item never drops the whole batch.
create or replace function public.upsert_runtime_books(p_items jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
    item jsonb;
    saved text;
    result jsonb := '[]'::jsonb;
begin
    if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 50 then
        raise exception 'Invalid book list' using errcode='22023';
    end if;
    for item in select value from jsonb_array_elements(p_items) loop
        begin
            saved := public.upsert_runtime_book(item);
        exception when data_exception or integrity_constraint_violation then
            saved := null;
        end;
        result := result || jsonb_build_array(saved);
    end loop;
    return result;
end;
$$;
revoke all on function public.upsert_runtime_books(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_runtime_books(jsonb) to service_role;

-- 9. Reserve one enrichment attempt per book per day, across all instances.
create or replace function public.claim_enrichment(p_slug text)
returns boolean language sql volatile security invoker set search_path='' as $$
    with claimed as (
        update public.catalog_items
           set enriched_at = now()
         where slug = p_slug
           and origin = 'runtime'
           and (enriched_at is null or enriched_at < now() - interval '24 hours')
        returning 1
    )
    select exists (select 1 from claimed);
$$;
revoke all on function public.claim_enrichment(text) from public, anon, authenticated;
grant execute on function public.claim_enrichment(text) to service_role;

-- 10. The backend (service_role) writes rows; users keep read-only access through RLS.
grant select, insert, update on public.catalog_items to service_role;

comment on column public.catalog_items.origin is
  'editorial: curated by hand or by import_catalog.py. runtime: book stored by the backend from a search.';
