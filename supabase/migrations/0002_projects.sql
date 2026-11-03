-- 0002: i progetti si gestiscono dall'app invece di essere scritti nel codice.
-- Esegui una sola volta nello SQL Editor, dopo la 0001. Se è già stata applicata si ferma senza cambiare nulla.

create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
do $$ begin
  if exists (select 1 from public.schema_migrations where version = '0002') then
    raise exception 'La migrazione 0002 è già stata applicata: non serve eseguirla di nuovo.';
  end if;
end $$;

-- I colori sono quelli della palette dell'app (c1…c8), così restano leggibili in tema chiaro e scuro.
create table public.projects (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,39}$' and id not in ('ferie', 'permesso', 'altro')),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  color text not null check (color in ('c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create unique index projects_user_name on public.projects (user_id, lower(name));

-- I tre progetti che prima erano nel codice, per ogni utente esistente.
insert into public.projects (user_id, id, name, color, created_at)
  select u.id, p.id, p.name, p.color, now() + p.n * interval '1 millisecond'
  from auth.users u
  cross join (values (1, 'shueco', 'Shüco', 'c1'), (2, 'inpeco', 'Inpeco', 'c2'), (3, 'frau', 'Poltrona Frau', 'c3')) as p (n, id, name, color);

-- Le assenze restano fisse; ogni voce di progetto deve avere una task, e ogni task un progetto.
alter table public.entries drop constraint if exists entries_who_check;
alter table public.tasks drop constraint if exists tasks_who_check;
alter table public.entries drop constraint if exists entries_code_rule;
alter table public.entries add constraint entries_code_rule check (
  (who in ('ferie', 'permesso', 'altro') and code is null)
  or (who not in ('ferie', 'permesso', 'altro') and code is not null and code = upper(code) and char_length(code) between 1 and 40 and code !~ '\s')
);

insert into public.tasks (user_id, who, code)
  select distinct user_id, who, code from public.entries where code is not null
  on conflict do nothing;

alter table public.tasks add constraint tasks_project_fk
  foreign key (user_id, who) references public.projects (user_id, id) on delete restrict;
-- Le assenze hanno code nullo e non vengono controllate dalla chiave.
alter table public.entries add constraint entries_task_fk
  foreign key (user_id, who, code) references public.tasks (user_id, who, code) on delete restrict;

-- La task va creata prima della voce, perché la chiave esterna la richiede subito.
drop trigger if exists entries_touch_task on public.entries;
create trigger entries_touch_task before insert or update on public.entries
  for each row execute function public.entries_touch_task();

alter table public.projects enable row level security;
create policy "own projects" on public.projects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;

insert into public.schema_migrations (version) values ('0002');
