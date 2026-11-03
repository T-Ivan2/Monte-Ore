import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { holidayName, monthDays, monday, validateEntry, romeNow, dueTimes, fmt, targetFor, validDayHours, dayLength } from '../src/logic.js';
import { buildSheets } from '../src/export.js';
import { runReminders } from '../netlify/lib/reminders.mjs';

describe('calendario', () => {
  it('riconosce le festività', () => {
    expect(holidayName('2026-12-08')).toBe('Immacolata');
    expect(holidayName('2027-03-29')).toBe('Pasquetta');
    expect(holidayName('2026-04-06')).toBe('Pasquetta');
    expect(holidayName('2027-10-04')).toBe('San Francesco');
    expect(holidayName('2025-10-04')).toBeNull();
    expect(holidayName('2026-11-04')).toBeNull();
  });
  it('conta i giorni e le ore previste del mese', () => {
    const due = (ym, h) => monthDays(ym).reduce((s, d) => s + targetFor(d, h), 0);
    expect(monthDays('2026-11')).toHaveLength(30);
    expect(due('2026-11')).toBe(168);
    expect(due('2026-10')).toBe(176);
    expect(due('2026-11', [8, 8, 8, 8, 4])).toBe(152);
    expect(monday('2026-11-08')).toBe('2026-11-02');
  });
  it('non prevede ore nel weekend, nei festivi e nei giorni a zero', () => {
    expect(targetFor('2026-11-04')).toBe(8);
    expect(targetFor('2026-11-07')).toBe(0);
    expect(targetFor('2026-12-08')).toBe(0);
    expect(targetFor('2026-11-06', [8, 8, 8, 8, 0])).toBe(0);
    expect(targetFor('2026-11-06', [8, 8, 8, 8, 6.5])).toBe(6.5);
  });
  it('controlla le ore previste e calcola la giornata media', () => {
    expect(validDayHours([8, 8, 8, 8, 4])).toBe(true);
    expect(validDayHours([8, 8, 8, 8])).toBe(false);
    expect(validDayHours([8, 8, 8, 8, 7.3])).toBe(false);
    expect(validDayHours([8, 8, 8, 8, 25])).toBe(false);
    expect(dayLength([6, 6, 6, 6, 0])).toBe(6);
    expect(dayLength([0, 0, 0, 0, 0])).toBe(8);
  });
});

describe('validazione voce', () => {
  const base = { kind: 'project', who: 'inpeco', code: 'task0048231', hours: '7,5', desc: '  nota ' };
  it('accetta e normalizza una voce di progetto', () => {
    const { errors, value } = validateEntry(base);
    expect(errors).toEqual({});
    expect(value).toEqual({ who: 'inpeco', hours: 7.5, code: 'TASK0048231', description: 'nota' });
  });
  it('rende obbligatorio il codice sui progetti', () => {
    expect(validateEntry({ ...base, code: ' ' }).errors.code).toMatch(/Inserisci/);
    expect(validateEntry({ ...base, newTask: false, code: '' }).errors.code).toMatch(/Scegli/);
  });
  it('accetta qualsiasi formato di codice', () => {
    expect(validateEntry({ ...base, code: 'inc 12-a' }).value.code).toBe('INC12-A');
    expect(validateEntry({ ...base, code: 'X' }).errors).toEqual({});
    expect(validateEntry({ ...base, code: 'A'.repeat(41) }).errors.code).toMatch(/40/);
  });
  it('non chiede il codice sulle assenze', () => {
    const { errors, value } = validateEntry({ kind: 'absence', who: 'ferie', code: 'X', hours: '8', desc: '' });
    expect(errors).toEqual({});
    expect(value.code).toBeNull();
  });
  it('controlla le ore', () => {
    expect(validateEntry({ ...base, hours: '0' }).errors.hours).toBeTruthy();
    expect(validateEntry({ ...base, hours: '7,3' }).errors.hours).toMatch(/mezz/);
    expect(validateEntry({ ...base, hours: '8' }, 20).errors.hours).toMatch(/24/);
    expect(validateEntry({ ...base, hours: 'abc' }).errors.hours).toBeTruthy();
  });
});

describe('promemoria', () => {
  it('usa l\'ora italiana anche con ora legale e solare', () => {
    expect(romeNow(new Date('2026-11-04T12:00:00Z'))).toEqual({ day: '2026-11-04', time: '13:00' });
    expect(romeNow(new Date('2026-07-01T11:00:00Z'))).toEqual({ day: '2026-07-01', time: '13:00' });
  });
  it('calcola gli orari dovuti', () => {
    expect(dueTimes(['13:00', '17:30'], '13:00')).toEqual(['13:00']);
    expect(dueTimes(['13:00'], '13:04')).toEqual(['13:00']);
    expect(dueTimes(['13:00'], '13:05')).toEqual([]);
    expect(dueTimes(['13:00'], '12:59')).toEqual([]);
    expect(dueTimes(['9', '13:0', '25:00', '13:00'], '13:00')).toEqual(['13:00']);
  });
  const setup = (hours) => {
    const seen = new Set(), sent = [];
    return { sent, seen, deps: {
      listSettings: async () => [{ user_id: 'u', times: ['13:00', '17:30'] }],
      claim: async (u, d, t) => { const k = u + d + t; if (seen.has(k)) return false; seen.add(k); return true; },
      release: async (u, d, t) => { seen.delete(u + d + t); },
      hoursFor: async () => hours,
      notify: async (u, p) => { sent.push(p.body); }
    } };
  };
  const at13 = new Date('2026-11-04T12:00:00Z');
  it('avvisa una sola volta se mancano ore', async () => {
    const { sent, deps } = setup(3);
    await runReminders(deps, at13);
    await runReminders(deps, new Date('2026-11-04T12:01:00Z'));
    expect(sent).toEqual(['Oggi mancano 5 h da inserire.']);
  });
  it('non avvisa a giornata completa, nel weekend, nei festivi o fuori orario', async () => {
    for (const [hours, date] of [[8, at13], [0, new Date('2026-11-07T12:00:00Z')], [0, new Date('2026-12-08T12:00:00Z')], [0, new Date('2026-11-04T10:00:00Z')]]) {
      const { sent, deps } = setup(hours);
      await runReminders(deps, date);
      expect(sent).toEqual([]);
    }
  });
  it('riprova al minuto dopo se l\'invio fallisce', async () => {
    const { sent, seen, deps } = setup(3);
    let fails = 1;
    const notify = deps.notify;
    deps.notify = async (u, p) => { if (fails-- > 0) throw new Error('rete'); return notify(u, p); };
    expect(await runReminders(deps, at13)).toEqual({ sent: 0, failed: 1 });
    expect(seen.size).toBe(0);
    expect(await runReminders(deps, new Date('2026-11-04T12:01:00Z'))).toEqual({ sent: 1, failed: 0 });
    expect(sent).toEqual(['Oggi mancano 5 h da inserire.']);
  });
  it('un errore su un utente non blocca gli altri', async () => {
    const { sent, deps } = setup(3);
    deps.listSettings = async () => [{ user_id: 'a', times: ['13:00'] }, { user_id: 'b', times: ['13:00'] }];
    const hoursFor = deps.hoursFor;
    deps.hoursFor = async u => { if (u === 'a') throw new Error('db'); return hoursFor(u); };
    expect(await runReminders(deps, at13)).toEqual({ sent: 1, failed: 1 });
    expect(sent).toHaveLength(1);
  });
  it('usa le ore previste dell\'utente', async () => {
    const run = async (day_hours, hours, date) => {
      const { sent, seen, deps } = setup(hours);
      deps.listSettings = async () => [{ user_id: 'u', times: ['13:00'], day_hours }];
      await runReminders(deps, date);
      return { sent, claimed: seen.size };
    };
    const fri = new Date('2026-11-06T12:00:00Z');
    expect(await run(['8', '8', '8', '8', '4'], 4, fri)).toEqual({ sent: [], claimed: 1 });
    expect((await run(['8', '8', '8', '8', '4'], 1, fri)).sent).toEqual(['Oggi mancano 3 h da inserire.']);
    expect(await run([8, 8, 8, 8, 0], 0, fri)).toEqual({ sent: [], claimed: 0 });
  });
  it('formatta le mezz\'ore', () => expect(fmt(2.5)).toBe('2,5'));
});

describe('schema database', () => {
  const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002';
  async function dbReady() {
    const db = new PGlite();
    await db.exec(`
      create schema auth; create table auth.users (id uuid primary key);
      create role authenticated; create role service_role;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('${U1}'), ('${U2}');
    `);
    await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
    return db;
  }
  const as = async (db, uid) => { await db.exec(`reset role; set app.uid = '${uid}'; set role authenticated;`); };
  const ok = `insert into entries (day, who, hours, code) values ('2026-11-04', 'inpeco', 7.5, 'TASK0048231')`;

  it('applica le regole su codice e ore', async () => {
    const db = await dbReady();
    await as(db, U1);
    await expect(db.exec(ok)).resolves.toBeTruthy();
    await expect(db.exec(`insert into entries (day, who, hours) values ('2026-11-04', 'inpeco', 8)`)).rejects.toThrow();
    await expect(db.exec(`insert into entries (day, who, hours, code) values ('2026-11-04', 'ferie', 8, 'TASK0048231')`)).rejects.toThrow();
    await expect(db.exec(`insert into entries (day, who, hours) values ('2026-11-04', 'ferie', 8)`)).resolves.toBeTruthy();
    await expect(db.exec(`insert into entries (day, who, hours, code) values ('2026-11-04', 'inpeco', 7.3, 'TASK0048231')`)).rejects.toThrow();
    await expect(db.exec(`insert into entries (day, who, hours, code) values ('2026-11-04', 'inpeco', 1, 'INC-12')`)).resolves.toBeTruthy();
    await expect(db.exec(`insert into entries (day, who, hours, code) values ('2026-11-04', 'inpeco', 1, 'minuscolo')`)).rejects.toThrow();
  });
  it('crea, riapre e somma le task', async () => {
    const db = await dbReady();
    await as(db, U1);
    await db.exec(ok);
    await db.exec(`insert into entries (day, who, hours, code) values ('2026-11-05', 'inpeco', 2, 'TASK0048231')`);
    let t = (await db.query('select * from task_hours')).rows;
    expect(t).toHaveLength(1);
    expect(Number(t[0].hours)).toBe(9.5);
    await db.exec(`update tasks set done_at = now()`);
    await db.exec(`update entries set hours = 3 where hours = 2`);
    t = (await db.query('select * from task_hours')).rows;
    expect(t[0].done_at).not.toBeNull();
    expect(Number(t[0].hours)).toBe(10.5);
    await db.exec(`insert into entries (day, who, hours, code) values ('2026-11-06', 'inpeco', 1, 'TASK0048231')`);
    expect((await db.query('select * from task_hours')).rows[0].done_at).toBeNull();
    await as(db, U2);
    expect((await db.query('select * from task_hours')).rows).toHaveLength(0);
    expect((await db.query('select * from tasks')).rows).toHaveLength(0);
  });
  it('si può rieseguire lo schema senza perdere dati', async () => {
    const db = await dbReady();
    await as(db, U1);
    await db.exec(ok);
    await db.exec('reset role;');
    await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
    await as(db, U1);
    expect((await db.query('select * from entries')).rows).toHaveLength(1);
    expect((await db.query('select * from tasks')).rows).toHaveLength(1);
  });
  it('accetta solo orari validi per i promemoria', async () => {
    const db = await dbReady();
    await as(db, U1);
    const set = t => db.exec(`insert into reminder_settings (times) values ('${t}') on conflict (user_id) do update set times = excluded.times`);
    await expect(set('{13:00,17:30}')).resolves.toBeTruthy();
    await expect(set('{}')).resolves.toBeTruthy();
    for (const bad of ['{9:00}', '{13:00:00}', '{25:00}', '{13:60}', '{"13:00,14:00"}', '{NULL}', `{${Array(13).fill('10:00').join(',')}}`]) {
      await expect(set(bad)).rejects.toThrow();
    }
  });
  it('accetta solo ore previste valide', async () => {
    const db = await dbReady();
    await as(db, U1);
    await db.exec(`insert into reminder_settings default values`);
    expect((await db.query('select day_hours from reminder_settings')).rows[0].day_hours.map(Number)).toEqual([8, 8, 8, 8, 8]);
    const set = h => db.exec(`update reminder_settings set day_hours = '${h}'`);
    await expect(set('{8,8,8,8,4.5}')).resolves.toBeTruthy();
    await expect(set('{0,0,0,0,0}')).resolves.toBeTruthy();
    for (const bad of ['{8,8,8,8}', '{8,8,8,8,8,8}', '{8,8,8,8,4.3}', '{8,8,8,8,25}', '{8,8,8,8,-1}', '{8,8,8,8,NULL}']) {
      await expect(set(bad)).rejects.toThrow();
    }
  });
  it('tiene separati i dati di ogni utente', async () => {
    const db = await dbReady();
    await as(db, U1);
    await db.exec(ok);
    await as(db, U2);
    expect((await db.query('select * from entries')).rows).toHaveLength(0);
    expect((await db.query('delete from entries returning id')).rows).toHaveLength(0);
    await as(db, U1);
    expect((await db.query('select * from entries')).rows).toHaveLength(1);
    await expect(db.query('select * from reminder_log')).rejects.toThrow();
    await expect(db.exec(`insert into reminder_log values ('${U1}', '2026-11-04', '13:00')`)).rejects.toThrow();
  });
});

describe('export', () => {
  it('converte le ore in giornate con la giornata dell\'utente', () => {
    const [, summary] = buildSheets([{ day: '2026-11-04', who: 'inpeco', hours: 6, code: 'T1', description: '' }], 120, 6);
    const row = summary.data.find(r => r[0]?.value === 'Inpeco');
    expect(row[2].value).toBe(1);
    expect(summary.data.find(r => r[0]?.value === 'Ore previste')[2].value).toBe(20);
  });
});
