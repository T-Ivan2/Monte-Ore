import { WHO, TARGET, isAbsence, parse } from './logic.js';

const head = v => ({ value: v, fontWeight: 'bold', backgroundColor: '#E6EBEF' });
// L'ora UTC tiene ferma la data in Excel, qualunque sia il fuso del telefono.
const excelDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

// Prepara i fogli del file: dettaglio delle voci e riepilogo del mese.
// dayLen sono le ore di una giornata, usate per convertire le ore in giornate.
export function buildSheets(entries, target, dayLen = TARGET) {
  const sorted = [...entries].sort((a, b) => a.day.localeCompare(b.day) || WHO[a.who].name.localeCompare(WHO[b.who].name, 'it'));
  const total = sorted.reduce((s, e) => s + e.hours, 0);
  const detail = [
    ['Data', 'Giorno', 'Tipo', 'Progetto o assenza', 'Codice ServiceNow', 'Ore', 'Descrizione'].map(head),
    ...sorted.map(e => [
      { value: excelDate(e.day), type: Date, format: 'dd/mm/yyyy' },
      { value: WEEKDAYS[parse(e.day).getDay()], type: String },
      { value: isAbsence(e.who) ? 'Assenza' : 'Progetto', type: String },
      { value: WHO[e.who].name, type: String },
      { value: e.code || '', type: String },
      { value: e.hours, type: Number, format: '0.0' },
      { value: e.description || '', type: String, wrap: true }
    ]),
    [{ value: 'Totale', fontWeight: 'bold' }, null, null, null, null, { value: total, type: Number, format: '0.0', fontWeight: 'bold' }, null]
  ];
  const sum = (arr) => arr.reduce((s, e) => s + e.hours, 0);
  const whoRows = Object.keys(WHO).map(id => ({ id, h: sum(sorted.filter(e => e.who === id)) })).filter(r => r.h > 0);
  const taskKeys = [...new Set(sorted.filter(e => e.code).map(e => `${e.who}|${e.code}`))];
  const summary = [
    [head('Monte ore'), head('Ore'), head('Giornate')],
    ...whoRows.map(r => [
      { value: WHO[r.id].name, type: String },
      { value: r.h, type: Number, format: '0.0' },
      { value: r.h / dayLen, type: Number, format: '0.00' }
    ]),
    [{ value: 'Totale', fontWeight: 'bold' }, { value: total, type: Number, format: '0.0', fontWeight: 'bold' }, { value: total / dayLen, type: Number, format: '0.00', fontWeight: 'bold' }],
    [{ value: 'Ore previste', type: String }, { value: target, type: Number, format: '0.0' }, { value: target / dayLen, type: Number, format: '0.00' }],
    [null, null, null],
    [head('Task'), head('Ore'), head('Progetto')],
    ...taskKeys.map(k => {
      const [who, code] = k.split('|');
      return [
        { value: code, type: String },
        { value: sum(sorted.filter(e => e.who === who && e.code === code)), type: Number, format: '0.0' },
        { value: WHO[who].name, type: String }
      ];
    })
  ];
  return [
    { data: detail, sheet: 'Dettaglio', columns: [{ width: 12 }, { width: 12 }, { width: 10 }, { width: 18 }, { width: 20 }, { width: 7 }, { width: 44 }] },
    { data: summary, sheet: 'Riepilogo', columns: [{ width: 22 }, { width: 8 }, { width: 18 }] }
  ];
}

export async function exportMonth(entries, month, target, dayLen) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const blob = await writeXlsxFile(buildSheets(entries, target, dayLen)).toBlob();
  const name = `monte-ore-${month}.xlsx`;
  const file = new File([blob], name, { type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  // Sul telefono apre il menu di condivisione: Salva su File, Mail, WhatsApp e così via.
  if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (err) { if (err.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
