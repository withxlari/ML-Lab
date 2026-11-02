create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public.catalog_items
    drop constraint catalog_items_metadata_source_check,
    drop constraint catalog_items_poster_path_check,
    add column provider text,
    add column provider_entity_type text,
    add column external_id text,
    add column metadata_fetched_at timestamptz,
    add column description_language text,
    add column search_document text not null default '',
    add constraint catalog_metadata_source check (metadata_source in ('manual','tmdb','open_library')),
    add constraint catalog_provider_identity check (
        (provider is null and provider_entity_type is null and external_id is null)
        or (provider is not null and provider_entity_type is not null and external_id is not null and (
            (provider='tmdb' and provider_entity_type='movie' and media_type='movie' and external_id ~ '^[0-9]+$')
            or (provider='tmdb' and provider_entity_type='tv' and media_type='series' and external_id ~ '^[0-9]+$')
            or (provider='open_library' and provider_entity_type='work' and media_type='book' and external_id ~ '^OL[0-9]+W$')
        ))
    ),
    add constraint catalog_import_provenance check (
        metadata_source='manual' or (metadata_fetched_at is not null and metadata_source=provider)
    ),
    add constraint catalog_provider_unique unique (provider, provider_entity_type, external_id),
    add constraint catalog_poster_source check (
        poster_path !~ '\.\.' and (
            poster_path ~ '^/images/[a-z0-9._-]+$'
            or poster_path ~ '^https://image\.tmdb\.org/t/p/w500/[A-Za-z0-9._-]+$'
            or poster_path ~ '^https://covers\.openlibrary\.org/b/id/[0-9]+-L\.jpg\?default=false$'
        )
    );
update public.catalog_items set
    provider='tmdb',
    provider_entity_type=case when media_type='movie' then 'movie' else 'tv' end,
    external_id=substring(source_url from '/([0-9]+)$')
where source_url ~ '^https://www\.themoviedb\.org/(movie|tv)/[0-9]+$';

create function public.refresh_catalog_search() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    new.search_document := lower(extensions.unaccent(
        concat_ws(' ',new.title,new.original_title,array_to_string(new.creators,' '),array_to_string(new.genres,' '))
    ));
    new.updated_at := now();
    return new;
end;
$$;
revoke all on function public.refresh_catalog_search() from public, anon, authenticated;
create trigger catalog_search_update before insert or update on public.catalog_items
    for each row execute function public.refresh_catalog_search();
update public.catalog_items set title=title;
create index catalog_search_trigram on public.catalog_items
    using gin (search_document extensions.gin_trgm_ops) where is_active;
create index catalog_type_position on public.catalog_items (media_type,position,id) where is_active;
create index catalog_position on public.catalog_items (position,id) where is_active;

create function public.search_catalog(
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
        or (p_media_type is not null and p_media_type not in ('movie','series','book'))
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
    ), page as (
        select * from matches order by position,id limit p_limit offset p_offset
    )
    select jsonb_build_object(
        'items',coalesce((select jsonb_agg(to_jsonb(page)-'search_document' order by position,id) from page),'[]'::jsonb),
        'total',(select count(*) from matches),'limit',p_limit,'offset',p_offset
    ) into result;
    return result;
end;
$$;
revoke all on function public.search_catalog(text,text,integer,integer,text[],uuid) from public;
grant execute on function public.search_catalog(text,text,integer,integer,text[],uuid) to anon, authenticated;

comment on table public.catalog_items is
    'Public catalog read model with scoped provider identity, manual/editorial preservation, and cached metadata. No personal data.';
