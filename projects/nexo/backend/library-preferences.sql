alter table public.user_library
    add column status text not null default 'planned'
        check (status in ('planned','in_progress','completed','paused','dropped')),
    add column rating smallint check (rating between 1 and 5),
    add column is_favorite boolean not null default false;

grant insert (status,rating,is_favorite), update (status,rating,is_favorite)
    on public.user_library to authenticated;

comment on column public.user_library.rating is 'Private explicit rating, integer 1 to 5; NULL means not rated.';
comment on column public.user_library.is_favorite is 'Explicit favorite, independent of saved-list membership and progress.';
