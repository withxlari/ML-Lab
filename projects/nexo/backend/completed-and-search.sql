alter table public.user_library add column if not exists reaction text
  check (reaction in ('liked','disliked'));
grant insert (reaction), update (reaction) on public.user_library to authenticated;

create or replace function public.record_completed_work(p_item jsonb,p_reaction text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid := auth.uid(); saved public.user_library;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  insert into public.user_library(user_id,media_key,media_snapshot,status,reaction)
    values(owner_id,p_item->>'slug',p_item,'completed',p_reaction)
  on conflict(user_id,media_key) do update set media_snapshot=excluded.media_snapshot,
    status='completed',reaction=coalesce(excluded.reaction,public.user_library.reaction)
  returning * into saved;
  delete from public.recommendation_feedback where user_id=owner_id and media_key=saved.media_key;
  return jsonb_build_object('item',saved.media_snapshot,'entry',jsonb_build_object(
    'media_key',saved.media_key,'status',saved.status,'rating',saved.rating,
    'is_favorite',saved.is_favorite,'reaction',saved.reaction));
end; $$;
revoke all on function public.record_completed_work(jsonb,text) from public,anon,authenticated;
grant execute on function public.record_completed_work(jsonb,text) to authenticated;

create or replace function public.search_public_profiles(p_query text,p_limit integer default 12,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
with term as (
  select lower(left(ltrim(btrim(p_query),'@'),80)) as q
), matching as (
  select p.username,p.display_name,p.bio,p.avatar_path,
    case when lower(p.username)=t.q then 0
      when starts_with(lower(p.username),t.q) then 1
      when starts_with(lower(p.display_name),t.q) then 2 else 3 end as rank
  from public.public_profiles p cross join term t
  where p.is_public and length(t.q)>=2 and
    (strpos(lower(p.username),t.q)>0 or strpos(lower(p.display_name),t.q)>0)
), page as (
  select username,display_name,bio,avatar_path from matching order by rank,username
    limit greatest(1,least(p_limit,24)) offset greatest(0,least(p_offset,5000))
)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
  'total',(select count(*) from matching),'limit',greatest(1,least(p_limit,24)),
  'offset',greatest(0,least(p_offset,5000)));
$$;
revoke all on function public.search_public_profiles(text,integer,integer) from public,anon,authenticated;
grant execute on function public.search_public_profiles(text,integer,integer) to anon,authenticated;
