
begin;
insert into auth.users(id,aud,role,email) values
('10000000-0000-4000-8000-000000000021','authenticated','authenticated','people-test-1@example.invalid'),
('10000000-0000-4000-8000-000000000022','authenticated','authenticated','people-test-2@example.invalid'),
('10000000-0000-4000-8000-000000000023','authenticated','authenticated','people-test-3@example.invalid');
insert into public.profiles(id) values ('10000000-0000-4000-8000-000000000021'),('10000000-0000-4000-8000-000000000022'),('10000000-0000-4000-8000-000000000023');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000022',true);
insert into public.public_profiles(user_id,username,display_name,is_public,show_ratings,top_fives)
values(auth.uid(),'people-test-public','Test',true,false,'{"book":[{"id":"30000000-0000-4000-8000-000000000001","slug":"dune-test","title":"Dune","media_type":"book","source_url":"https://example.invalid/dune","genres":["Science fiction"]}]}');
select public.save_user_review('{"slug":"private-work","title":"PRIVATE_WORK_SENTINEL"}',5,'PRIVATE_REVIEW_SENTINEL','private',false)->>'rating';
select public.save_user_review('{"slug":"public-work","title":"Visible title"}',4,'PUBLIC_REVIEW_BODY_SENTINEL','public',false)->>'rating';
do $$ declare data jsonb; begin
 select x into data from jsonb_array_elements(public.discover_public_people(50,0)->'items') x where x->>'username'='people-test-public';
 if data::text like '%PRIVATE_%' or data::text like '%PUBLIC_REVIEW_BODY_SENTINEL%' then raise exception 'private/body data leaked into people matching'; end if;
 if jsonb_array_length(data->'signals')<>1 then raise exception 'hidden ratings used'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000023',true);
insert into public.public_profiles(user_id,username,display_name,is_public) values(auth.uid(),'people-test-closed','Hidden',false);
set local role anon;
do $$ begin
 if exists(select 1 from jsonb_array_elements(public.discover_public_people(50,0)->'items') x where x->>'username'='people-test-closed') then raise exception 'closed profile discovered'; end if;
 begin
  perform count(*) from public.profile_follows;
  raise exception 'anonymous follow graph visible';
 exception when insufficient_privilege then null;
 end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000021',true);
insert into public.public_profiles(user_id,username,display_name,is_public) values(auth.uid(),'people-test-self','Self',true);
insert into public.profile_follows(follower_id,followed_id) values(auth.uid(),'10000000-0000-4000-8000-000000000022') on conflict do nothing;
insert into public.profile_follows(follower_id,followed_id) values(auth.uid(),'10000000-0000-4000-8000-000000000022') on conflict do nothing;
do $$ begin
 if (select count(*) from public.profile_follows)<>1 then raise exception 'duplicate follows'; end if;
 begin
  insert into public.profile_follows(follower_id,followed_id) values(auth.uid(),auth.uid());
  raise exception 'self follow allowed';
 exception when check_violation then null;
 end;
 begin
  insert into public.profile_follows(follower_id,followed_id) values(auth.uid(),'10000000-0000-4000-8000-000000000023');
  raise exception 'closed target followed';
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000022',true);
do $$ begin
 if exists(select 1 from public.profile_follows) then raise exception 'another following list leaked'; end if;
 begin
  insert into public.profile_follows(follower_id,followed_id) values('10000000-0000-4000-8000-000000000021',auth.uid());
  raise exception 'forged follower allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
update public.public_profiles set is_public=false where user_id=auth.uid();
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000021',true);
do $$ begin if not exists(select 1 from public.profile_follows) then raise exception 'own following choice lost on profile closure'; end if; end $$;
reset role;
rollback;
select 'private/public discovery and follow ownership checks passed; all fixtures rolled back' as result;

