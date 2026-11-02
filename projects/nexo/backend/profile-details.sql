alter table public.public_profiles
  add column if not exists show_stats boolean not null default false,
  add column if not exists show_followers boolean not null default false,
  add column if not exists show_following boolean not null default false;

create schema if not exists nexo_private;
revoke all on schema nexo_private from public;
grant usage on schema nexo_private to anon,authenticated;

create or replace function nexo_private.profile_details(p_username text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.public_profiles; explored bigint; favorites bigint;
begin
  select * into p from public.public_profiles where username=p_username and is_public;
  if not found then return null; end if;
  if p.show_stats then
    select count(*) filter(where status='completed'),count(*) filter(where is_favorite)
      into explored,favorites from public.user_library where user_id=p.user_id;
  end if;
  return jsonb_build_object(
    'username',p.username,'display_name',p.display_name,'bio',p.bio,
    'avatar_path',p.avatar_path,'is_public',p.is_public,'show_ratings',p.show_ratings,
    'show_stats',p.show_stats,'show_followers',p.show_followers,'show_following',p.show_following,
    'top_fives',p.top_fives,'updated_at',p.updated_at,
    'stats',jsonb_build_object('explored',explored,'favorites',favorites,
      'followers',case when p.show_followers then (select count(*) from public.profile_follows where followed_id=p.user_id) end,
      'following',case when p.show_following then (select count(*) from public.profile_follows where follower_id=p.user_id) end));
end; $$;
revoke all on function nexo_private.profile_details(text) from public,anon,authenticated;
grant execute on function nexo_private.profile_details(text) to anon,authenticated;

create or replace function public.get_public_profile(p_username text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select nexo_private.profile_details(p_username);
$$;
revoke all on function public.get_public_profile(text) from public,anon,authenticated;
grant execute on function public.get_public_profile(text) to anon,authenticated;

create or replace function nexo_private.profile_connections(p_username text,p_direction text,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.public_profiles; result jsonb;
begin
  select * into p from public.public_profiles where username=p_username and is_public;
  if not found or p_direction not in ('followers','following') then return null; end if;
  if (p_direction='followers' and not p.show_followers) or
     (p_direction='following' and not p.show_following) then return null; end if;
  with visible as (
    select other.username,other.display_name,other.bio,other.avatar_path
    from public.profile_follows f join public.public_profiles other on other.user_id=
      case when p_direction='followers' then f.follower_id else f.followed_id end
    where other.is_public and
      case when p_direction='followers' then f.followed_id=p.user_id else f.follower_id=p.user_id end
  ), page as (
    select * from visible order by username
      limit greatest(1,least(p_limit,24)) offset greatest(0,least(p_offset,10000))
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page) order by username) from page),'[]'::jsonb),
    'total',(select count(*) from visible),'limit',greatest(1,least(p_limit,24)),
    'offset',greatest(0,least(p_offset,10000))) into result;
  return result;
end; $$;
revoke all on function nexo_private.profile_connections(text,text,integer,integer) from public,anon,authenticated;
grant execute on function nexo_private.profile_connections(text,text,integer,integer) to anon,authenticated;

create or replace function public.get_profile_connections(p_username text,p_direction text,p_limit integer default 12,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select nexo_private.profile_connections(p_username,p_direction,p_limit,p_offset);
$$;
revoke all on function public.get_profile_connections(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.get_profile_connections(text,text,integer,integer) to anon,authenticated;

create or replace function public.public_media_snapshot(v jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(v) where key in
('id','slug','title','original_title','media_type','release_year','creators','genres','poster_path','backdrop_path','is_adult','age_rating','isbn_13','language','publisher','edition_date','description','editorial_note','source_url','provider','provider_entity_type','external_id','platforms','aliases');
$$;
revoke all on function public.public_media_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.public_media_snapshot(jsonb) to authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon,authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated;
alter default privileges for role postgres in schema nexo_private revoke execute on functions from public,anon,authenticated;
create or replace function public.get_public_activity(p_username text,p_limit integer,p_offset integer,p_kind text)
returns jsonb language sql stable security invoker set search_path='' as $$
with owner as (
 select user_id,show_ratings from public.public_profiles where username=p_username and is_public
), activity as (
 select r.media_key,r.media_snapshot as item,r.rating,r.body,r.spoiler,r.updated_at
 from public.user_reviews r join owner o on o.user_id=r.user_id where r.visibility='public'
 union all
 select r.media_key,r.media_snapshot,r.rating,null::text,false,r.updated_at
 from public.public_ratings r join owner o on o.user_id=r.user_id
 where o.show_ratings and not exists(select 1 from public.user_reviews v where v.user_id=r.user_id and v.media_key=r.media_key and v.visibility='public')
), chosen as (
 select * from activity where p_kind='all' or (p_kind='reviews' and body is not null) or (p_kind='ratings' and rating is not null)
), page as (
 select item,rating,body,spoiler,updated_at from chosen order by updated_at desc,media_key
 limit greatest(1,least(p_limit,24)) offset greatest(0,least(p_offset,10000))
), recent as (
 select item,rating,body is not null as has_review,updated_at from activity order by updated_at desc,media_key limit 4
)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
'recent',coalesce((select jsonb_agg(to_jsonb(recent)) from recent),'[]'::jsonb),
'total',(select count(*) from chosen),'limit',greatest(1,least(p_limit,24)),'offset',greatest(0,least(p_offset,10000)));
$$;
revoke all on function public.get_public_activity(text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.get_public_activity(text,integer,integer,text) to anon,authenticated;
