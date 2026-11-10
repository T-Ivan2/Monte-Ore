-- 0001: schema iniziale. Si può rieseguire senza perdere i dati.
-- Le migrazioni successive vanno eseguite una sola volta, in ordine: vedi il README.

-- Registro delle migrazioni applicate.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  who text not null check (who in ('shueco', 'inpeco', 'frau', 'ferie', 'permesso', 'altro')),
  hours numeric(4, 1) not null check (hours > 0 and hours <= 24 and mod(hours * 2, 1) = 0),
  code text,
  description text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists entries_user_day on public.entries (user_id, day);

-- Il codice ServiceNow è obbligatorio sui progetti e assente sulle assenze.
alter table public.entries drop constraint if exists entries_code_rule;
alter table public.entries add constraint entries_code_rule check (
  (who in ('shueco', 'inpeco', 'frau') and code is not null and code = upper(code) and char_length(code) between 1 and 40 and code !~ '\s')
  or (who in ('ferie', 'permesso', 'altro') and code is null)
);

-- Le task nascono alla prima registrazione. Terminate restano archiviate con le loro ore.
create table if not exists public.tasks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  who text not null check (who in ('shueco', 'inpeco', 'frau')),
  code text not null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, who, code)
);

insert into public.tasks (user_id, who, code)
  select distinct user_id, who, code from public.entries where code is not null
  on conflict do nothing;

-- Registrare ore su una task la crea oppure la riapre se era terminata.
create or replace function public.entries_touch_task() returns trigger
language plpgsql as $$
begin
  if new.code is not null and (tg_op = 'INSERT' or new.code is distinct from old.code or new.who is distinct from old.who) then
    insert into public.tasks (user_id, who, code) values (new.user_id, new.who, new.code)
    on conflict (user_id, who, code) do update set done_at = null;
  end if;
  return new;
end $$;
drop trigger if exists entries_touch_task on public.entries;
create trigger entries_touch_task after insert or update on public.entries
  for each row execute function public.entries_touch_task();

-- Si crea solo se manca: le migrazioni successive la ampliano (la 0003 aggiunge il titolo)
-- e rieseguire la 0001 non deve riportarla indietro, cosa che PostgreSQL rifiuterebbe.
do $$ begin
  if not exists (select 1 from pg_views where schemaname = 'public' and viewname = 'task_hours') then
    execute $v$
      create view public.task_hours with (security_invoker = on) as
        select t.who, t.code, t.done_at, t.created_at,
               coalesce(sum(e.hours), 0) as hours, max(e.day) as last_day
        from public.tasks t
        left join public.entries e on e.user_id = t.user_id and e.who = t.who and e.code = t.code
        group by t.user_id, t.who, t.code, t.done_at, t.created_at
    $v$;
  end if;
end $$;

-- Impostazioni dell'utente: orari dei promemoria e ore previste da lunedì a venerdì.
create table if not exists public.reminder_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  times text[] not null default '{13:00,17:30}'
);
alter table public.reminder_settings add column if not exists day_hours numeric(3, 1)[] not null default '{8,8,8,8,8}';

create or replace function public.valid_day_hours(h numeric[]) returns boolean
language sql immutable as $$
  select cardinality(h) = 5
     and (select bool_and(coalesce(x between 0 and 24 and mod(x * 2, 1) = 0, false)) from unnest(h) x)
$$;
alter table public.reminder_settings drop constraint if exists reminder_day_hours_format;
alter table public.reminder_settings add constraint reminder_day_hours_format check (public.valid_day_hours(day_hours));

-- Al massimo 12 orari, ognuno nel formato HH:MM. Nessun orario significa notifiche spente.
create or replace function public.valid_reminder_times(t text[]) returns boolean
language sql immutable as $$
  select cardinality(t) <= 12
     and coalesce((select bool_and(coalesce(x ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$', false)) from unnest(t) x), true)
$$;
alter table public.reminder_settings drop constraint if exists reminder_times_format;
alter table public.reminder_settings add constraint reminder_times_format check (public.valid_reminder_times(times));

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Evita di inviare due volte lo stesso promemoria. Lo usa solo il server.
create table if not exists public.reminder_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  time text not null,
  primary key (user_id, day, time)
);

alter table public.entries enable row level security;
alter table public.tasks enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_log enable row level security;

drop policy if exists "own entries" on public.entries;
drop policy if exists "own tasks" on public.tasks;
drop policy if exists "own reminder settings" on public.reminder_settings;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own entries" on public.entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own tasks" on public.tasks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own reminder settings" on public.reminder_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Permessi espliciti: l'app accede solo ai propri dati, il log resta al server.
grant select, insert, update, delete on public.entries, public.tasks, public.reminder_settings, public.push_subscriptions to authenticated;
grant select on public.task_hours to authenticated;
grant all on public.entries, public.tasks, public.reminder_settings, public.push_subscriptions, public.reminder_log to service_role;
grant all on public.schema_migrations to service_role;

insert into public.schema_migrations (version) values ('0001') on conflict do nothing;
