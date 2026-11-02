
create table public.profile_follows (
 follower_id uuid not null references public.profiles(id) on delete cascade,
 followed_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(follower_id,followed_id),
 check (follower_id<>followed_id)
);
create index profile_follows_target on public.profile_follows(followed_id);
create index profile_follows_recent on public.profile_follows(follower_id,created_at desc,followed_id);
alter table public.profile_follows enable row level security;
revoke all on public.profile_follows from anon,authenticated;
grant select,insert,delete on public.profile_follows to authenticated;
create policy "Read own follows" on public.profile_follows for select to authenticated using ((select auth.uid())=follower_id);
create policy "Follow published profiles" on public.profile_follows for insert to authenticated with check ((select auth.uid())=follower_id and exists(select 1 from public.public_profiles p where p.user_id=followed_id and p.is_public));
create policy "Unfollow own choices" on public.profile_follows for delete to authenticated using ((select auth.uid())=follower_id);

create function public.people_media_snapshot(v jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(v)
where key in ('id','slug','title','media_type','release_year','creators','genres','poster_path','source_url','provider','provider_entity_type','external_id');
$$;
revoke all on function public.people_media_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.people_media_snapshot(jsonb) to anon,authenticated;

create function public.discover_public_people(p_limit integer default 25,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
with profiles as (
 select user_id,username,display_name,bio,avatar_path,show_ratings,top_fives from public.public_profiles
 where is_public order by username limit greatest(1,least(p_limit,50)) offset greatest(0,least(p_offset,10000))
), people as (
 select p.user_id,p.username,p.display_name,p.bio,p.avatar_path,
 coalesce((select jsonb_object_agg(c.key,c.items) from (
  select key,coalesce((select jsonb_agg(public.people_media_snapshot(item)) from jsonb_array_elements(value) item),'[]'::jsonb) items
  from jsonb_each(p.top_fives)
 ) c),'{}'::jsonb) top_fives,
 coalesce((select jsonb_agg(jsonb_build_object('item',public.people_media_snapshot(s.media_snapshot),'rating',s.rating)) from (
  select distinct on (media_key) media_key,media_snapshot,rating,updated_at from (
   select r.media_key,r.media_snapshot,r.rating,r.updated_at from public.public_ratings r where r.user_id=p.user_id and p.show_ratings
   union all
   select r.media_key,r.media_snapshot,r.rating,r.updated_at from public.user_reviews r where r.user_id=p.user_id and r.visibility='public' and r.rating is not null
  ) ratings order by media_key,updated_at desc limit 100
 ) s),'[]'::jsonb) signals from profiles p
)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(people) order by username) from people),'[]'::jsonb),
'total',(select count(*) from public.public_profiles where is_public),
'limit',greatest(1,least(p_limit,50)),'offset',greatest(0,least(p_offset,10000)));
$$;
revoke all on function public.discover_public_people(integer,integer) from public,anon,authenticated;
grant execute on function public.discover_public_people(integer,integer) to anon,authenticated;

