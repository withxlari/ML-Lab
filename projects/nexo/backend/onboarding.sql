alter table public.profiles add column onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started','skipped','completed'));
grant update (onboarding_status) on public.profiles to authenticated;
