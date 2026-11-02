
begin;
insert into auth.users(id,aud,role,email) values ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','nexo-test-1@example.invalid'),('10000000-0000-4000-8000-000000000002','authenticated','authenticated','nexo-test-2@example.invalid');
insert into public.profiles(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.public_profiles(user_id,username,display_name,is_public,show_ratings) values (auth.uid(),'nexo-test-private','Test',false,false);
insert into public.user_preferences(user_id,preferences) values(auth.uid(),'{"like_text":"PRIVATE_SENTINEL"}');
insert into public.recommendation_feedback(user_id,media_key,media_snapshot,action) values(auth.uid(),'test-title','{"slug":"test-title"}','not_interested');
select public.save_user_review('{"slug":"test-public","title":"Public title"}',5,'PUBLIC_REVIEW','public',true)->>'rating' as saved_rating;
select public.save_user_review('{"slug":"test-private","title":"Private title"}',2,'PRIVATE_REVIEW','private',false)->>'rating' as saved_private_rating;
do $$ begin
 if (select count(*) from public.public_ratings where user_id=auth.uid())<>2 then raise exception 'rating sync failed'; end if;
end $$;
set local role anon;
do $$ begin
 if exists(select 1 from public.public_profiles where username='nexo-test-private') then raise exception 'closed profile leaked'; end if;
 if exists(select 1 from public.user_reviews where media_key in ('test-public','test-private')) then raise exception 'closed review leaked'; end if;
end $$;
set local role authenticated;
update public.public_profiles set is_public=true where user_id=auth.uid();
set local role anon;
do $$ begin
 if not exists(select 1 from public.public_profiles where username='nexo-test-private') then raise exception 'public profile missing'; end if;
 if (select count(*) from public.user_reviews where media_key='test-public')<>1 then raise exception 'public review missing'; end if;
 if exists(select 1 from public.user_reviews where media_key='test-private') then raise exception 'private review leaked'; end if;
 if exists(select 1 from public.public_ratings where media_key in ('test-public','test-private')) then raise exception 'hidden ratings leaked'; end if;
 if (public.get_public_activity('nexo-test-private')->>'total')::int<>1 then raise exception 'activity count failed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.user_preferences) then raise exception 'other tastes leaked'; end if;
 if exists(select 1 from public.recommendation_feedback) then raise exception 'other feedback leaked'; end if;
 if exists(select 1 from public.user_library) then raise exception 'other library leaked'; end if;
 update public.public_profiles set bio='ATTACK' where username='nexo-test-private';
 if found then raise exception 'other profile editable'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
update public.public_profiles set show_ratings=true where user_id=auth.uid();
update public.user_library set rating=4 where user_id=auth.uid() and media_key='test-public';
do $$ begin
 if (select rating from public.user_reviews where user_id=auth.uid() and media_key='test-public')<>4 then raise exception 'review sync failed'; end if;
 begin
  update public.public_profiles set top_fives='{"movie":[{},{},{},{},{},{}]}' where user_id=auth.uid();
  raise exception 'top limit missing';
 exception when check_violation then null;
 end;
end $$;
set local role anon;
do $$ begin
 if (public.get_public_activity('nexo-test-private')->>'total')::int<>2 then raise exception 'ratings activity failed'; end if;
 if public.get_public_activity('nexo-test-private')::text like '%PRIVATE_REVIEW%' then raise exception 'private body leaked in activity'; end if;
end $$;
set local role authenticated;
update public.public_profiles set is_public=false where user_id=auth.uid();
set local role anon;
do $$ begin
 if (public.get_public_activity('nexo-test-private')->>'total')::int<>0 then raise exception 'unpublish failed'; end if;
end $$;
reset role;
rollback;
select 'all privacy, ownership, atomic rating and Top 5 checks passed; fixtures rolled back' as result;

