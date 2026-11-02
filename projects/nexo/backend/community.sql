create function public.valid_top_fives(v jsonb) returns boolean language sql immutable security invoker set search_path='' as $$
select jsonb_typeof(v)='object' and coalesce(bool_and(key in ('movie','series','book','manga','game') and case when jsonb_typeof(value)='array' then jsonb_array_length(value)<=5 else false end),true) from jsonb_each(v);
$$;
revoke all on function public.valid_top_fives(jsonb) from public,anon,authenticated;
grant execute on function public.valid_top_fives(jsonb) to authenticated;

create function public.public_media_snapshot(v jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(v) where key in ('id','slug','title','original_title','media_type','release_year','creators','genres','poster_path','description','editorial_note','source_url','provider','provider_entity_type','external_id','platforms','aliases');
$$;
revoke all on function public.public_media_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.public_media_snapshot(jsonb) to authenticated;
create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default '{}' check (jsonb_typeof(preferences)='object' and octet_length(preferences::text)<=50000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.public_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  bio text not null default '' check (length(bio)<=500),
  is_public boolean not null default false, show_ratings boolean not null default false,
  top_fives jsonb not null default '{}' check (public.valid_top_fives(top_fives) and octet_length(top_fives::text)<=250000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_reviews (
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_key text not null check (media_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(media_key)<=100),
  media_snapshot jsonb not null check (jsonb_typeof(media_snapshot)='object' and media_snapshot->>'slug'=media_key and octet_length(media_snapshot::text)<=100000),
  body text not null check (length(btrim(body)) between 1 and 4000),
  rating smallint check (rating between 1 and 5),
  visibility text not null default 'private' check (visibility in ('private','public')),
  spoiler boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(user_id,media_key)
);
create table public.public_ratings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_key text not null,
  media_snapshot jsonb not null check (jsonb_typeof(media_snapshot)='object' and media_snapshot->>'slug'=media_key and octet_length(media_snapshot::text)<=100000),
  rating smallint not null check (rating between 1 and 5),
  updated_at timestamptz not null default now(), primary key(user_id,media_key)
);
create table public.recommendation_feedback (
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_key text not null check (media_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(media_key)<=100),
  media_snapshot jsonb not null check (jsonb_typeof(media_snapshot)='object' and media_snapshot->>'slug'=media_key and octet_length(media_snapshot::text)<=100000),
  action text not null check (action in ('more_like_this','not_interested','already_known')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(user_id,media_key)
);
create index user_reviews_recent on public.user_reviews(user_id,updated_at desc,media_key);
create index public_ratings_recent on public.public_ratings(user_id,updated_at desc,media_key);
create index feedback_recent on public.recommendation_feedback(user_id,updated_at desc);

alter table public.user_preferences enable row level security;
alter table public.public_profiles enable row level security;
alter table public.user_reviews enable row level security;
alter table public.public_ratings enable row level security;
alter table public.recommendation_feedback enable row level security;
revoke all on public.user_preferences,public.public_profiles,public.user_reviews,public.public_ratings,public.recommendation_feedback from anon,authenticated;
grant select,insert,update,delete on public.user_preferences,public.public_profiles,public.user_reviews,public.public_ratings,public.recommendation_feedback to authenticated;
grant select on public.public_profiles,public.user_reviews,public.public_ratings to anon;
create policy "Own taste profile" on public.user_preferences for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Own feedback" on public.recommendation_feedback for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Own public profile" on public.public_profiles for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Published profiles" on public.public_profiles for select to anon,authenticated using (is_public);
create policy "Own reviews" on public.user_reviews for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Published reviews" on public.user_reviews for select to anon,authenticated using (visibility='public' and exists(select 1 from public.public_profiles p where p.user_id=user_reviews.user_id and p.is_public));
create policy "Own rating projection" on public.public_ratings for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Published ratings" on public.public_ratings for select to anon,authenticated using (exists(select 1 from public.public_profiles p where p.user_id=public_ratings.user_id and p.is_public and p.show_ratings));

create function public.sync_public_rating() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then
    delete from public.public_ratings where user_id=old.user_id and media_key=old.media_key;
    return old;
  end if;
  if new.rating is null then
    delete from public.public_ratings where user_id=new.user_id and media_key=new.media_key;
  else
    insert into public.public_ratings(user_id,media_key,media_snapshot,rating,updated_at)
    values(new.user_id,new.media_key,public.public_media_snapshot(new.media_snapshot),new.rating,new.updated_at)
    on conflict(user_id,media_key) do update set media_snapshot=excluded.media_snapshot,rating=excluded.rating,updated_at=excluded.updated_at;
  end if;
  update public.user_reviews set rating=new.rating where user_id=new.user_id and media_key=new.media_key and rating is distinct from new.rating;
  return new;
end; $$;
revoke all on function public.sync_public_rating() from public,anon,authenticated;
create trigger sync_rating after insert or update or delete on public.user_library for each row execute function public.sync_public_rating();
insert into public.public_ratings(user_id,media_key,media_snapshot,rating,updated_at)
select user_id,media_key,public.public_media_snapshot(media_snapshot),rating,updated_at from public.user_library where rating is not null;

create trigger preferences_updated before update on public.user_preferences for each row execute function public.refresh_account_timestamp();
create trigger public_profile_updated before update on public.public_profiles for each row execute function public.refresh_account_timestamp();
create trigger review_updated before update on public.user_reviews for each row execute function public.refresh_account_timestamp();
create trigger feedback_updated before update on public.recommendation_feedback for each row execute function public.refresh_account_timestamp();

create function public.save_user_review(p_item jsonb,p_rating integer,p_body text,p_visibility text,p_spoiler boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid := auth.uid(); saved public.user_reviews;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  insert into public.user_library(user_id,media_key,media_snapshot,rating)
  values(owner_id,p_item->>'slug',p_item,p_rating)
  on conflict(user_id,media_key) do update set media_snapshot=excluded.media_snapshot,rating=excluded.rating;
  insert into public.user_reviews(user_id,media_key,media_snapshot,rating,body,visibility,spoiler)
  values(owner_id,p_item->>'slug',p_item,p_rating,btrim(p_body),p_visibility,p_spoiler)
  on conflict(user_id,media_key) do update set media_snapshot=excluded.media_snapshot,rating=excluded.rating,body=excluded.body,visibility=excluded.visibility,spoiler=excluded.spoiler
  returning * into saved;
  return to_jsonb(saved);
end; $$;
revoke all on function public.save_user_review(jsonb,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.save_user_review(jsonb,integer,text,text,boolean) to authenticated;
create function public.get_public_activity(p_username text,p_limit integer default 12,p_offset integer default 0)
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
), page as (
 select item,rating,body,spoiler,updated_at from activity order by updated_at desc,media_key
 limit greatest(1,least(p_limit,24)) offset greatest(0,least(p_offset,10000))
)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from activity),'limit',greatest(1,least(p_limit,24)),'offset',greatest(0,least(p_offset,10000)));
$$;
revoke all on function public.get_public_activity(text,integer,integer) from public,anon,authenticated;
grant execute on function public.get_public_activity(text,integer,integer) to anon,authenticated;

