import { describe, it, expect } from 'vitest';
import { buildBackup, parseBackup, planRestore } from '../src/backup.js';

const projects = [{ id: 'inpeco', name: 'Inpeco', color: 'c2', archived_at: null, created_at: '2026-01-01' }, { id: 'acme', name: 'Acme', color: 'c4', archived_at: '2026-10-01', created_at: '2026-02-01' }];
const tasks = [{ who: 'inpeco', code: 'T1', done_at: null, created_at: 'x', hours: 8, title: 'Analisi requisiti' }, { who: 'acme', code: 'A1', done_at: '2026-10-01', created_at: 'y', hours: 2, title: null }];
const e = (id, day, who, hours, code = null) => ({ id, day, who, hours, code, description: '', created_at: 'z', user_id: 'u' });
const entries = [e('2', '2026-11-04', 'inpeco', 8, 'T1'), e('1', '2026-10-01', 'acme', 2, 'A1'), e('3', '2026-11-05', 'ferie', 8)];
const settings = { times: ['13:00'], dayHours: [8, 8, 8, 8, 4] };
const file = () => JSON.stringify(buildBackup({ entries, projects, tasks, settings }, new Date('2026-11-05T10:00:00Z')));

describe('backup', () => {
  it('contiene tutto, in ordine e senza dati interni', () => {
    const b = JSON.parse(file());
    expect(b).toMatchObject({ app: 'monte-ore', version: 1, exported_at: '2026-11-05T10:00:00.000Z', settings: { times: ['13:00'], day_hours: [8, 8, 8, 8, 4] } });
    expect(b.entries.map(x => x.id)).toEqual(['1', '2', '3']);
    expect(b.entries[0]).toEqual({ id: '1', day: '2026-10-01', who: 'acme', hours: 2, code: 'A1', description: '', created_at: 'z' });
    expect(b.tasks[0]).toEqual({ who: 'inpeco', code: 'T1', title: 'Analisi requisiti', done_at: null, created_at: 'x' });
  });
  it('rifiuta file che non sono backup', () => {
    expect(() => parseBackup('ciao')).toThrow(/JSON valido/);
    expect(() => parseBackup('{"entries": []}')).toThrow(/non è un backup/);
    expect(() => parseBackup(JSON.stringify({ ...JSON.parse(file()), version: 99 }))).toThrow(/più recente/);
  });
  it('un titolo non valido si perde senza scartare la task', () => {
    const b = JSON.parse(file());
    b.tasks[0].title = 'x'.repeat(81);
    b.tasks[1].title = '  Piano   di  test ';
    const parsed = parseBackup(JSON.stringify(b));
    expect(parsed.tasks.map(t => t.title)).toEqual([null, 'Piano di test']);
  });
  it('salta le voci e i progetti non validi', () => {
    const b = JSON.parse(file());
    b.entries.push(
      { id: 'x1', day: '2026-11-06', who: 'inpeco', hours: 7.3, code: 'T1' },
      { id: 'x2', day: '6/11/2026', who: 'inpeco', hours: 1, code: 'T1' },
      { id: 'x3', day: '2026-11-06', who: 'ferie', hours: 8, code: 'T1' },
      { id: 'x4', day: '2026-11-06', who: 'inpeco', hours: 1, code: 'minuscolo' },
      { day: '2026-11-06', who: 'ferie', hours: 8 }
    );
    b.projects.push({ id: 'ferie', name: 'Ferie', color: 'c1' }, { id: 'ok', name: 'Ok', color: 'rosso' });
    const parsed = parseBackup(JSON.stringify(b));
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.invalid).toBe(5);
    expect(parsed.projects.map(p => p.id)).toEqual(['inpeco', 'acme']);
  });
});

describe('ripristino', () => {
  const backup = () => parseBackup(file());
  it('su un account vuoto ricrea tutto, con le task terminate', () => {
    const plan = planRestore(backup(), { entries: [], projects: [], tasks: [] });
    expect(plan.projects).toEqual([{ id: 'inpeco', name: 'Inpeco', color: 'c2', archived_at: null }, { id: 'acme', name: 'Acme', color: 'c4', archived_at: '2026-10-01' }]);
    expect(plan.entries.map(x => x.id)).toEqual(['1', '2', '3']);
    expect(plan.entries[0]).toEqual({ id: '1', day: '2026-10-01', who: 'acme', hours: 2, code: 'A1', description: '' });
    expect(plan.doneTasks).toEqual([{ who: 'acme', code: 'A1' }]);
    expect(plan.titles).toEqual([{ who: 'inpeco', code: 'T1', title: 'Analisi requisiti' }]);
    expect(plan).toMatchObject({ present: 0, skipped: 0 });
  });
  it('ripristinare due volte non aggiunge nulla', () => {
    const plan = planRestore(backup(), { entries, projects, tasks });
    expect(plan).toEqual({ projects: [], entries: [], doneTasks: [], titles: [], present: 3, skipped: 0 });
  });
  it('non cambia i dati esistenti e rinomina i progetti con lo stesso nome', () => {
    const current = { entries: [e('9', '2026-11-04', 'mio', 1, 'M1')], projects: [{ id: 'mio', name: 'inpeco', color: 'c1' }], tasks: [{ who: 'acme', code: 'A1', done_at: null }] };
    const plan = planRestore(backup(), current);
    expect(plan.projects.map(p => [p.id, p.name])).toEqual([['inpeco', 'Inpeco (backup)'], ['acme', 'Acme']]);
    // La task A1 esiste già aperta: il ripristino non la chiude e non le cambia il titolo.
    expect(plan.doneTasks).toEqual([]);
    expect(plan.titles).toEqual([{ who: 'inpeco', code: 'T1', title: 'Analisi requisiti' }]);
  });
  it('salta le voci di progetti che non esistono da nessuna parte', () => {
    const b = JSON.parse(file());
    b.entries.push({ id: '4', day: '2026-11-06', who: 'sparito', hours: 2, code: 'S1', description: '' });
    const plan = planRestore(parseBackup(JSON.stringify(b)), { entries: [], projects: [], tasks: [] });
    expect(plan.entries.map(x => x.id)).toEqual(['1', '2', '3']);
    expect(plan.skipped).toBe(1);
  });
});
