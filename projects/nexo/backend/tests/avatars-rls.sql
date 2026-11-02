
begin;
insert into auth.users(id,aud,role,email) values ('10000000-0000-4000-8000-000000000011','authenticated','authenticated','avatar-test-1@example.invalid'),('10000000-0000-4000-8000-000000000012','authenticated','authenticated','avatar-test-2@example.invalid');
insert into public.profiles(id) values ('10000000-0000-4000-8000-000000000011'),('10000000-0000-4000-8000-000000000012');
insert into storage.objects(bucket_id,name) values ('avatars','10000000-0000-4000-8000-000000000011/20000000-0000-4000-8000-000000000001.webp'),('avatars','10000000-0000-4000-8000-000000000011/20000000-0000-4000-8000-000000000002.webp');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',true);
update public.profiles set avatar_path='10000000-0000-4000-8000-000000000011/20000000-0000-4000-8000-000000000001.webp' where id=auth.uid();
insert into public.public_profiles(user_id,username,display_name) values(auth.uid(),'avatar-test-profile','Test');
do $$ begin
 if (select avatar_path from public.public_profiles where user_id=auth.uid()) is null then raise exception 'initial avatar sync failed'; end if;
 if (select count(*) from storage.objects where bucket_id='avatars' and name like '10000000-0000-4000-8000-000000000011/%')<>2 then raise exception 'owner read failed'; end if;
 begin
  update public.profiles set avatar_path='10000000-0000-4000-8000-000000000012/20000000-0000-4000-8000-000000000001.webp' where id=auth.uid();
  raise exception 'foreign path allowed';
 exception when check_violation then null;
 end;
end $$;
set local role anon;
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='avatars' and name like '10000000-0000-4000-8000-000000000011/%') then raise exception 'private avatar exposed'; end if;
end $$;
set local role authenticated;
update public.public_profiles set is_public=true where user_id=auth.uid();
update public.profiles set avatar_path='10000000-0000-4000-8000-000000000011/20000000-0000-4000-8000-000000000002.webp' where id=auth.uid();
set local role anon;
do $$ begin
 if (select count(*) from storage.objects where bucket_id='avatars' and name like '10000000-0000-4000-8000-000000000011/%')<>1 then raise exception 'only current avatar should be public'; end if;
 if not exists(select 1 from storage.objects where bucket_id='avatars' and name like '%/20000000-0000-4000-8000-000000000002.webp') then raise exception 'changed avatar not published'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000012',true);
do $$ begin
 begin
  insert into storage.objects(bucket_id,name) values ('avatars','10000000-0000-4000-8000-000000000011/20000000-0000-4000-8000-000000000003.webp');
  raise exception 'foreign upload allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',true);
update public.profiles set avatar_path=null where id=auth.uid();
set local role anon;
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='avatars' and name like '10000000-0000-4000-8000-000000000011/%') then raise exception 'removed avatar still accessible'; end if;
end $$;
reset role;
rollback;
select 'avatar ownership, private/public visibility, sync, replacement and removal passed; test data rolled back' as result;

