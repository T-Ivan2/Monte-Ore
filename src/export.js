import { saveFile } from './files.js';
import { TARGET, DEFAULT_PROJECTS, ABSENCES, PLACES, isAbsence, parse } from './logic.js';

const DEFAULT_NAMES = Object.fromEntries([...DEFAULT_PROJECTS, ...ABSENCES].map(w => [w.id, w.name]));

const head = v => ({ value: v, fontWeight: 'bold', backgroundColor: '#E6EBEF' });
// L'ora UTC tiene ferma la data in Excel, qualunque sia il fuso del telefono.
const excelDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

// Prepara i fogli del file: dettaglio delle voci e riepilogo del mese.
// dayLen sono le ore di una giornata, usate per convertire le ore in giornate. names associa ogni progetto o assenza al suo nome;
// titles associa "progetto|codice" al titolo della task; places sono le sedi dei giorni del mese;
// tasks porta funzionale, ore stimate e ore totali di ogni task.
export function buildSheets(entries, target, dayLen = TARGET, names = DEFAULT_NAMES, titles = {}, places = [], tasks = []) {
  const nameOf = id => names[id] ?? id;
  const taskInfo = (who, code) => tasks.find(t => t.who === who && t.code === code) || {};
  const titleOf = (who, code) => (code && titles[`${who}|${code}`]) || '';
  const sorted = [...entries].sort((a, b) => a.day.localeCompare(b.day) || nameOf(a.who).localeCompare(nameOf(b.who), 'it'));
  const total = sorted.reduce((s, e) => s + e.hours, 0);
  const detail = [
    ['Data', 'Giorno', 'Tipo', 'Progetto o assenza', 'Codice ServiceNow', 'Titolo task', 'Ore', 'Descrizione'].map(head),
    ...sorted.map(e => [
      { value: excelDate(e.day), type: Date, format: 'dd/mm/yyyy' },
      { value: WEEKDAYS[parse(e.day).getDay()], type: String },
      { value: isAbsence(e.who) ? 'Assenza' : 'Progetto', type: String },
      { value: nameOf(e.who), type: String },
      { value: e.code || '', type: String },
      { value: titleOf(e.who, e.code), type: String, wrap: true },
      { value: e.hours, type: Number, format: '0.0' },
      { value: e.description || '', type: String, wrap: true }
    ]),
    [{ value: 'Totale', fontWeight: 'bold' }, null, null, null, null, null, { value: total, type: Number, format: '0.0', fontWeight: 'bold' }, null]
  ];
  const sum = (arr) => arr.reduce((s, e) => s + e.hours, 0);
  const ids = [...new Set([...Object.keys(names), ...sorted.map(e => e.who)])];
  const whoRows = ids.map(id => ({ id, h: sum(sorted.filter(e => e.who === id)) })).filter(r => r.h > 0);
  const taskKeys = [...new Set(sorted.filter(e => e.code).map(e => `${e.who}|${e.code}`))];
  const summary = [
    [head('Monte ore'), head('Ore'), head('Giornate')],
    ...whoRows.map(r => [
      { value: nameOf(r.id), type: String },
      { value: r.h, type: Number, format: '0.0' },
      { value: r.h / dayLen, type: Number, format: '0.00' }
    ]),
    [{ value: 'Totale', fontWeight: 'bold' }, { value: total, type: Number, format: '0.0', fontWeight: 'bold' }, { value: total / dayLen, type: Number, format: '0.00', fontWeight: 'bold' }],
    [{ value: 'Ore previste', type: String }, { value: target, type: Number, format: '0.0' }, { value: target / dayLen, type: Number, format: '0.00' }],
    [null, null, null],
    [head('Task'), head('Ore'), head('Progetto'), head('Titolo'), head('Funzionale'), head('Ore stimate'), head('Ore totali'), head('Residuo')],
    ...taskKeys.map(k => {
      const [who, code] = k.split('|');
      const t = taskInfo(who, code);
      // Residuo sulla stima con tutte le ore della task, non solo quelle del mese; negativo se si è oltre.
      const est = t.estimate ?? null, all = t.hours ?? null;
      return [
        { value: code, type: String },
        { value: sum(sorted.filter(e => e.who === who && e.code === code)), type: Number, format: '0.0' },
        { value: nameOf(who), type: String },
        { value: titleOf(who, code), type: String, wrap: true },
        { value: t.functional || '', type: String },
        est != null ? { value: est, type: Number, format: '0.0' } : null,
        all != null ? { value: all, type: Number, format: '0.0' } : null,
        est != null && all != null ? { value: est - all, type: Number, format: '0.0' } : null
      ];
    })
  ];
  // Presenze: dove si è lavorato ogni giorno, con le ore registrate, e i giorni per sede.
  const hoursOn = d => sorted.filter(e => e.day === d).reduce((n, e) => n + e.hours, 0);
  const sortedPlaces = [...places].sort((a, b) => a.day.localeCompare(b.day));
  const presence = [
    ['Data', 'Giorno', 'Sede', 'Luogo', 'Cliente', 'Ore registrate'].map(head),
    ...sortedPlaces.map(p => [
      { value: excelDate(p.day), type: Date, format: 'dd/mm/yyyy' },
      { value: WEEKDAYS[parse(p.day).getDay()], type: String },
      { value: PLACES.find(x => x.id === p.kind)?.name ?? p.kind, type: String },
      { value: p.place || '', type: String },
      { value: p.client || '', type: String },
      { value: hoursOn(p.day), type: Number, format: '0.0' }
    ]),
    [null, null, null, null, null, null],
    [head('Sede'), head('Giorni'), null, null, null, null],
    ...PLACES.map(x => [{ value: x.name, type: String }, { value: sortedPlaces.filter(p => p.kind === x.id).length, type: Number }, null, null, null, null])
  ];
  return [
    { data: detail, sheet: 'Dettaglio', columns: [{ width: 12 }, { width: 12 }, { width: 10 }, { width: 18 }, { width: 20 }, { width: 30 }, { width: 7 }, { width: 44 }] },
    { data: summary, sheet: 'Riepilogo', columns: [{ width: 22 }, { width: 8 }, { width: 18 }, { width: 34 }, { width: 22 }, { width: 11 }, { width: 10 }, { width: 9 }] },
    { data: presence, sheet: 'Presenze', columns: [{ width: 12 }, { width: 12 }, { width: 16 }, { width: 22 }, { width: 22 }, { width: 14 }] }
  ];
}

export async function exportMonth(entries, month, target, dayLen, names, titles, places, tasks) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const blob = await writeXlsxFile(buildSheets(entries, target, dayLen, names, titles, places, tasks)).toBlob();
  const name = `monte-ore-${month}.xlsx`;
  const file = new File([blob], name, { type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return saveFile(file);
}
