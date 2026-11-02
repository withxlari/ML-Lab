begin;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000091','completed-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000092','completed-b@example.invalid');
insert into public.profiles(id) values
 ('10000000-0000-4000-8000-000000000091'),
 ('10000000-0000-4000-8000-000000000092');
insert into public.public_profiles(user_id,username,display_name,is_public) values
 ('10000000-0000-4000-8000-000000000091','completed-search-a','Busca Nexo Teste',true),
 ('10000000-0000-4000-8000-000000000092','completed-search-b','Busca Nexo Teste',false);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000091","role":"authenticated"}',true);
do $$ declare v jsonb; begin
 v:=public.record_completed_work('{"slug":"completed-test","title":"Test"}','liked');
 if v#>>'{entry,status}'<>'completed' or v#>>'{entry,reaction}'<>'liked' or v#>>'{entry,rating}' is not null then raise exception 'incorrect completion'; end if;
 update public.user_library set rating=4,is_favorite=true where media_key='completed-test';
 v:=public.record_completed_work('{"slug":"completed-test","title":"Test"}','disliked');
 if v#>>'{entry,rating}'<>'4' or v#>>'{entry,is_favorite}'<>'true' or v#>>'{entry,reaction}'<>'disliked' then raise exception 'existing preferences overwritten'; end if;
 begin
  perform public.record_completed_work('{"slug":"completed-test","title":"Test"}','bad');
  raise exception 'invalid opinion accepted';
 exception when check_violation then null; end;
 if (select reaction from public.user_library where media_key='completed-test')<>'disliked' then raise exception 'failed write was not atomic'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000092","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.user_library where media_key='completed-test') then raise exception 'another library exposed'; end if;
 perform public.record_completed_work('{"slug":"completed-test","title":"Test"}','liked');
end $$;
reset role;
do $$ begin
 if (select count(*) from public.user_library where media_key='completed-test')<>2 then raise exception 'owner isolation failed'; end if;
 if (select reaction from public.user_library where media_key='completed-test' and user_id='10000000-0000-4000-8000-000000000091')<>'disliked' then raise exception 'other owner changed'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ declare v jsonb; begin
 begin
  perform public.record_completed_work('{"slug":"unauthorized"}',null);
  raise exception 'anonymous write allowed';
 exception when insufficient_privilege then null; end;
 v:=public.search_public_profiles('@COMPLETED-SEARCH',12,0);
 if v->>'total'<>'1' or v#>>'{items,0,username}'<>'completed-search-a' then raise exception 'search leaked unpublished profile'; end if;
 if v::text like '%email%' or v::text like '%reaction%' or v::text like '%user_id%' then raise exception 'private data in search'; end if;
 if public.search_public_profiles('a',12,0)->>'total'<>'0' then raise exception 'short search accepted'; end if;
 if public.search_public_profiles('%_',12,0)->>'total'<>'0' then raise exception 'wildcard search accepted'; end if;
 if public.get_public_profile('completed-search-a')::text like '%disliked%' then raise exception 'private opinion published'; end if;
end $$;
reset role;
rollback;
select 'completed works and public search checks passed; fixtures rolled back' as result;
