-- 0004: funzionale di riferimento e ore stimate delle task; sede di lavoro di ogni giorno.
-- Esegui una sola volta nello SQL Editor, dopo la 0003. Se è già stata applicata si ferma senza cambiare nulla.

do $$ begin
  if exists (select 1 from public.schema_migrations where version = '0004') then
    raise exception 'La migrazione 0004 è già stata applicata: non serve eseguirla di nuovo.';
  end if;
end $$;

-- Funzionale: facoltativo, senza spazi ai bordi, al massimo 80 caratteri.
-- Ore stimate: facoltative, a mezz'ore, tra 0,5 e 9999.
alter table public.tasks
  add column functional text
    check (functional is null or (functional = btrim(functional) and char_length(functional) between 1 and 80)),
  add column estimate numeric(6, 1)
    check (estimate is null or (estimate > 0 and estimate <= 9999 and mod(estimate * 2, 1) = 0));

-- La vista aggiunge i nuovi campi in fondo: le colonne esistenti restano dove sono.
create or replace view public.task_hours with (security_invoker = on) as
  select t.who, t.code, t.done_at, t.created_at,
         coalesce(sum(e.hours), 0) as hours, max(e.day) as last_day, t.title, t.functional, t.estimate
  from public.tasks t
  left join public.entries e on e.user_id = t.user_id and e.who = t.who and e.code = t.code
  group by t.user_id, t.who, t.code, t.done_at, t.created_at, t.title, t.functional, t.estimate;

-- Dove si lavora ogni giorno: un solo valore per giorno. In trasferta il luogo è obbligatorio e il cliente facoltativo.
create table public.day_places (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('torino', 'milano', 'smart', 'trasferta')),
  place text check (place is null or (place = btrim(place) and char_length(place) between 1 and 80)),
  client text check (client is null or (client = btrim(client) and char_length(client) between 1 and 80)),
  updated_at timestamptz not null default now(),
  primary key (user_id, day),
  check ((kind = 'trasferta' and place is not null) or (kind <> 'trasferta' and place is null and client is null))
);

alter table public.day_places enable row level security;
create policy "own day places" on public.day_places for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.day_places to authenticated;
grant all on public.day_places to service_role;

insert into public.schema_migrations (version) values ('0004');
