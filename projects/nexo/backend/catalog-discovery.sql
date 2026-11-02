alter table public.catalog_items
    drop constraint catalog_items_media_type_check,
    drop constraint catalog_metadata_source,
    drop constraint catalog_provider_identity,
    drop constraint catalog_poster_source,
    add column platforms text[] not null default '{}',
    add column aliases text[] not null default '{}',
    add constraint catalog_media_type check (media_type in ('movie','series','book','manga','game')),
    add constraint catalog_metadata_source check (metadata_source in ('manual','tmdb','open_library','kitsu','igdb')),
    add constraint catalog_provider_identity check (
        (provider is null and provider_entity_type is null and external_id is null)
        or (provider is not null and provider_entity_type is not null and external_id is not null and (
            (provider='tmdb' and provider_entity_type='movie' and media_type='movie' and external_id ~ '^[0-9]+$')
            or (provider='tmdb' and provider_entity_type='tv' and media_type='series' and external_id ~ '^[0-9]+$')
            or (provider='open_library' and provider_entity_type='work' and media_type='book' and external_id ~ '^OL[0-9]+W$')
            or (provider='kitsu' and provider_entity_type='manga' and media_type='manga' and external_id ~ '^[0-9]+$')
            or (provider='igdb' and provider_entity_type='game' and media_type='game' and external_id ~ '^[0-9]+$')
        ))
    ),
    add constraint catalog_poster_source check (poster_path !~ '\.\.' and (
        poster_path ~ '^/images/[a-z0-9._-]+$'
        or poster_path ~ '^https://image\.tmdb\.org/t/p/w500/[A-Za-z0-9._-]+$'
        or poster_path ~ '^https://covers\.openlibrary\.org/b/id/[0-9]+-L\.jpg\?default=false$'
        or poster_path ~ '^https://media\.kitsu\.(app|io)/manga/[A-Za-z0-9/_.-]+$'
        or poster_path ~ '^https://images\.igdb\.com/igdb/image/upload/t_cover_big/[A-Za-z0-9_-]+\.jpg$'
    ));

create or replace function public.refresh_catalog_search() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    new.search_document := lower(extensions.unaccent(concat_ws(' ',new.title,new.original_title,
        array_to_string(new.creators,' '),array_to_string(new.genres,' '),
        array_to_string(new.platforms,' '),array_to_string(new.aliases,' '))));
    new.updated_at := now();
    return new;
end;
$$;
update public.catalog_items set title=title;

create function public.resolve_catalog_identities(p_keys jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
    if jsonb_typeof(p_keys)<>'array' or jsonb_array_length(p_keys)>100 then
        raise exception 'Invalid identity list' using errcode='22023';
    end if;
    select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(c)-'search_document'),'[]'::jsonb),
        'total',count(*),'limit',100,'offset',0) into result
    from public.catalog_items c where c.is_active and exists (
        select 1 from jsonb_to_recordset(p_keys) as k(provider text,entity text,external_id text)
        where c.provider=k.provider and c.provider_entity_type=k.entity and c.external_id=k.external_id
    );
    return result;
end;
$$;
revoke all on function public.resolve_catalog_identities(jsonb) from public;
grant execute on function public.resolve_catalog_identities(jsonb) to anon,authenticated;
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
