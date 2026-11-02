
alter table public.profiles add column avatar_path text check (avatar_path is null or (avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$' and split_part(avatar_path,'/',1)=id::text));
grant update(avatar_path) on public.profiles to authenticated;
alter table public.public_profiles add column avatar_path text check (avatar_path is null or (avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$' and split_part(avatar_path,'/',1)=user_id::text));

create function public.sync_profile_avatar() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.public_profiles set avatar_path=new.avatar_path where user_id=new.id;
 return new;
end $$;
revoke all on function public.sync_profile_avatar() from public,anon,authenticated;
create trigger profile_avatar_updated after update of avatar_path on public.profiles for each row execute function public.sync_profile_avatar();

create function public.initialize_public_avatar() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 select avatar_path into new.avatar_path from public.profiles where id=new.user_id;
 return new;
end $$;
revoke all on function public.initialize_public_avatar() from public,anon,authenticated;
create trigger public_avatar_created before insert on public.public_profiles for each row execute function public.initialize_public_avatar();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('avatars','avatars',false,1048576,array['image/webp']);

create policy "Avatar owner reads" on storage.objects for select to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Avatar owner uploads" on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');
create policy "Avatar owner removes" on storage.objects for delete to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Published avatar reads" on storage.objects for select to anon using(bucket_id='avatars' and exists(select 1 from public.public_profiles p where p.is_public and p.avatar_path=name and p.user_id::text=(storage.foldername(name))[1]));

