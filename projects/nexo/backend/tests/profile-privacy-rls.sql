begin;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000081','profile-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000082','profile-b@example.invalid'),
 ('10000000-0000-4000-8000-000000000083','profile-c@example.invalid');
insert into public.profiles(id) select id from auth.users where id in
 ('10000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000082','10000000-0000-4000-8000-000000000083');
insert into public.public_profiles(user_id,username,display_name,is_public) values
 ('10000000-0000-4000-8000-000000000081','privacy-test-a','A',true),
 ('10000000-0000-4000-8000-000000000082','privacy-test-b','B',true),
 ('10000000-0000-4000-8000-000000000083','privacy-test-c','PRIVATE_PERSON',false);
insert into public.user_library(user_id,media_key,media_snapshot,status,is_favorite,rating) values
 ('10000000-0000-4000-8000-000000000081','private-favorite','{"slug":"private-favorite","title":"PRIVATE_FAVORITE"}','completed',true,5);
insert into public.user_reviews(user_id,media_key,media_snapshot,body,visibility,rating) values
 ('10000000-0000-4000-8000-000000000081','private-review','{"slug":"private-review"}','PRIVATE_REVIEW','private',5),
 ('10000000-0000-4000-8000-000000000081','public-review','{"slug":"public-review"}','A public review.','public',4);
insert into public.profile_follows(follower_id,followed_id) values
 ('10000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000082'),
 ('10000000-0000-4000-8000-000000000082','10000000-0000-4000-8000-000000000081'),
 ('10000000-0000-4000-8000-000000000083','10000000-0000-4000-8000-000000000081');
set local role anon;
do $$ declare v jsonb; begin
 v:=public.get_public_profile('privacy-test-a');
 if v->'stats'->>'explored' is not null or v->'stats'->>'followers' is not null then raise exception 'counts published without consent'; end if;
 if public.get_profile_connections('privacy-test-a','followers',12,0) is not null then raise exception 'hidden network leaked'; end if;
 if public.get_public_profile('privacy-test-c') is not null then raise exception 'closed profile leaked'; end if;
 if public.get_public_activity('privacy-test-a',12,0,'all')::text like '%PRIVATE_%' then raise exception 'private review or favorites leaked'; end if;
 begin perform count(*) from public.user_library; raise exception 'private table accessible'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.public_profiles set show_stats=true,show_followers=true,show_following=true where username='privacy-test-a';
set local role anon;
do $$ declare v jsonb; begin
 v:=public.get_public_profile('privacy-test-a');
 if v#>>'{stats,explored}'<>'1' or v#>>'{stats,favorites}'<>'1' or v#>>'{stats,followers}'<>'2' or v#>>'{stats,following}'<>'1' then raise exception 'incorrect aggregate counts'; end if;
 if v::text like '%PRIVATE_%' then raise exception 'aggregate exposed private titles'; end if;
 v:=public.get_profile_connections('privacy-test-a','followers',12,0);
 if v->>'total'<>'1' or v::text like '%PRIVATE_%' then raise exception 'closed person exposed'; end if;
 v:=public.get_public_activity('privacy-test-a',12,0,'reviews');
 if v->>'total'<>'1' or v::text like '%PRIVATE_%' then raise exception 'incorrect public activity filtering'; end if;
end $$;
reset role;
update public.public_profiles set is_public=false where username='privacy-test-a';
set local role anon;
do $$ begin
 if public.get_public_profile('privacy-test-a') is not null then raise exception 'closed profile summary visible'; end if;
 if public.get_profile_connections('privacy-test-a','followers',12,0) is not null then raise exception 'closed profile network visible'; end if;
 if public.get_public_activity('privacy-test-a',12,0,'all')->>'total'<>'0' then raise exception 'closed profile activity visible'; end if;
end $$;
reset role;
rollback;
select 'profile privacy and statistics checks passed; fixtures rolled back' as result;
