-- Fase 3: the BookInfo shelf is built once a day by a cron and read with one call.
-- Idempotent: safe to run more than once. Run after book-lookup-stats.sql.

-- 1. One row per BookInfo week. The payload is exactly what the explore page shows
--    (items + period info), so reading it never calls an external source.
create table if not exists public.book_showcase (
  week date primary key,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload->'items') = 'array'
    and jsonb_typeof(payload->'info') = 'object'
    and octet_length(payload::text) <= 2000000
  ),
  generated_at timestamptz not null default now()
);
alter table public.book_showcase enable row level security;
revoke all on public.book_showcase from anon, authenticated;
grant select, insert, update on public.book_showcase to service_role;

comment on table public.book_showcase is
  'Vitrine semanal do BookInfo, gerada pelo cron do backend. Sem dados de usuário.';

-- 2. Public read of the latest week only. security definer because the table itself grants
--    nothing to anon/authenticated; it returns just the stored payload, no other columns.
create or replace function public.get_book_showcase()
returns jsonb language sql stable security definer set search_path = '' as $$
  select payload from public.book_showcase order by week desc limit 1;
$$;
revoke all on function public.get_book_showcase() from public, anon, authenticated;
grant execute on function public.get_book_showcase() to anon, authenticated, service_role;

-- 3. Retention for lookup_stats, run by the same cron (days passed by the backend).
create or replace function public.cleanup_lookup_stats(p_days integer)
returns integer language plpgsql volatile security invoker set search_path = '' as $$
declare
  removed integer;
begin
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'Invalid retention' using errcode = '22023';
  end if;
  delete from public.lookup_stats where created_at < now() - make_interval(days => p_days);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.cleanup_lookup_stats(integer) from public, anon, authenticated;
grant execute on function public.cleanup_lookup_stats(integer) to service_role;
grant select, delete on public.lookup_stats to service_role;
