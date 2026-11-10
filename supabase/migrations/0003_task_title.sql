-- 0003: titolo delle task. Appartiene alla task, non alla singola voce: resta lo stesso in tutte le registrazioni.
-- Esegui una sola volta nello SQL Editor, dopo la 0002. Se è già stata applicata si ferma senza cambiare nulla.

do $$ begin
  if exists (select 1 from public.schema_migrations where version = '0003') then
    raise exception 'La migrazione 0003 è già stata applicata: non serve eseguirla di nuovo.';
  end if;
end $$;

-- Facoltativo; se c'è, senza spazi ai bordi e al massimo 80 caratteri.
alter table public.tasks add column title text
  check (title is null or (title = btrim(title) and char_length(title) between 1 and 80));

-- La vista aggiunge il titolo in fondo: le colonne esistenti restano dove sono.
create or replace view public.task_hours with (security_invoker = on) as
  select t.who, t.code, t.done_at, t.created_at,
         coalesce(sum(e.hours), 0) as hours, max(e.day) as last_day, t.title
  from public.tasks t
  left join public.entries e on e.user_id = t.user_id and e.who = t.who and e.code = t.code
  group by t.user_id, t.who, t.code, t.done_at, t.created_at, t.title;

insert into public.schema_migrations (version) values ('0003');
