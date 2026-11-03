-- Fase 0: one row per real network call to a book source (Google Books, Open Library, BookInfo).
-- Idempotent: safe to run more than once. Written only by the backend (sb_secret_ key).
create table if not exists public.lookup_stats (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('google_books','open_library','bookinfo')),
  ok boolean not null,   -- the source answered (no timeout, 5xx or 429)
  hit boolean not null,  -- the answer had a result
  ms integer not null check (ms between 0 and 600000)
);
create index if not exists lookup_stats_created_idx on public.lookup_stats (created_at desc);

alter table public.lookup_stats enable row level security;
revoke all on public.lookup_stats from anon, authenticated;
grant insert on public.lookup_stats to service_role;

comment on table public.lookup_stats is
  'Uma linha por chamada externa de livros. Sem dados de usuário. Só o backend grava.';

-- Check (run separately):
-- select source, count(*) calls,
--        round(100.0 * avg(ok::int), 1) ok_pct,
--        round(100.0 * avg(hit::int), 1) hit_pct,
--        round(avg(ms)) avg_ms,
--        percentile_cont(0.95) within group (order by ms) p95_ms
-- from public.lookup_stats
-- where created_at > now() - interval '24 hours'
-- group by source;
