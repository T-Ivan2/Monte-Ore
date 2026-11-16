// Coda delle modifiche alle ore fatte senza connessione. Funzioni pure: niente rete né storage,
// così le regole si possono provare a fondo. Le operazioni sono:
//   { op: 'add', row }            voce nuova, con id già assegnato sul dispositivo
//   { op: 'update', id, patch }   modifica di una voce
//   { op: 'remove', id }          eliminazione di una voce
//   { op: 'task', who, code, patch }   dettagli di una task: titolo, funzionale, ore stimate (null toglie)
//   { op: 'place', day, value }        sede di lavoro di un giorno (value null la toglie)
//   { op: 'title', who, code, title }  formato precedente di 'task', ancora letto dalle code già salvate

// Aggiunge un'operazione fondendola con quelle in attesa sulla stessa voce. Non modifica la coda ricevuta.
// Le code salvate prima dei dettagli delle task contengono operazioni 'title': diventano 'task'.
export const upgradeOp = q => q.op === 'title' ? { op: 'task', who: q.who, code: q.code, patch: { title: q.title } } : q;

export function enqueue(queue, op) {
  op = upgradeOp(op);
  if (op.op === 'add') return [...queue, op];
  // Dettagli della task: si fondono con quelli in attesa e restano dopo la voce che crea la task.
  if (op.op === 'task') {
    const same = q => q.op === 'task' && q.who === op.who && q.code === op.code;
    const prev = queue.find(same);
    return [...queue.filter(q => !same(q)), prev ? { ...op, patch: { ...prev.patch, ...op.patch } } : op];
  }
  // Della sede di un giorno conta solo l'ultima scelta.
  if (op.op === 'place') return [...queue.filter(q => !(q.op === 'place' && q.day === op.day)), op];
  const pendingAdd = queue.find(q => q.op === 'add' && q.row.id === op.id);
  if (op.op === 'update') {
    if (pendingAdd) return queue.map(q => q === pendingAdd ? { op: 'add', row: { ...q.row, ...op.patch } } : q);
    const pendingUpdate = queue.find(q => q.op === 'update' && q.id === op.id);
    if (pendingUpdate) return queue.map(q => q === pendingUpdate ? { ...q, patch: { ...q.patch, ...op.patch } } : q);
    return [...queue, op];
  }
  if (op.op === 'remove') {
    // Una voce mai inviata e poi eliminata non deve lasciare traccia.
    const rest = queue.filter(q => (q.op === 'add' ? q.row.id : q.id) !== op.id);
    return pendingAdd ? rest : [...rest, op];
  }
  throw new Error(`operazione sconosciuta: ${op.op}`);
}

// Applica la coda alle voci lette (dal server o dalla copia locale), così si vedono le modifiche non ancora inviate.
export function overlay(entries, queue) {
  let out = [...entries];
  for (const q of queue) {
    if (q.op === 'add' && !out.some(e => e.id === q.row.id)) out.push({ description: '', ...q.row });
    if (q.op === 'update') out = out.map(e => e.id === q.id ? { ...e, ...q.patch } : e);
    if (q.op === 'remove') out = out.filter(e => e.id !== q.id);
  }
  return out;
}
// Sedi lette (dal server o dalla copia locale) più quelle scelte e non ancora inviate.
export function overlayPlaces(places, queue) {
  const out = new Map(places.map(p => [p.day, p]));
  for (const q of queue.map(upgradeOp)) {
    if (q.op !== 'place') continue;
    if (q.value) out.set(q.day, { day: q.day, ...q.value }); else out.delete(q.day);
  }
  return [...out.values()];
}

// Le task nascono e si riaprono sul server quando si registrano ore: offline lo simula per le voci nuove.
export function overlayTasks(tasks, queue) {
  const out = tasks.map(t => ({ ...t }));
  for (const q of queue.map(upgradeOp)) {
    if (q.op === 'task') {
      const t = out.find(x => x.who === q.who && x.code === q.code);
      if (t) Object.assign(t, q.patch);
      continue;
    }
    if (q.op !== 'add' || !q.row.code) continue;
    const t = out.find(x => x.who === q.row.who && x.code === q.row.code);
    if (t) { t.hours += q.row.hours; t.done_at = null; if (!t.last_day || q.row.day > t.last_day) t.last_day = q.row.day; }
    else out.unshift({ who: q.row.who, code: q.row.code, done_at: null, hours: q.row.hours, last_day: q.row.day });
  }
  return out;
}

// Invia le operazioni in ordine. Alla prima mancanza di rete si ferma e tiene il resto per dopo.
// Un errore del server scarta l'operazione e la segnala: riprovarla darebbe lo stesso errore.
export async function flush(queue, api, isNetworkError) {
  const failed = [];
  let applied = 0;
  for (let i = 0; i < queue.length; i++) {
    const q = upgradeOp(queue[i]);
    try {
      if (q.op === 'add') await api.add(q.row);
      if (q.op === 'update') await api.update(q.id, q.patch);
      if (q.op === 'remove') await api.remove(q.id);
      if (q.op === 'task') await api.task(q.who, q.code, q.patch);
      if (q.op === 'place') await api.place(q.day, q.value);
      applied += 1;
    } catch (err) {
      if (isNetworkError(err)) return { remaining: queue.slice(i), applied, failed };
      // Voce già arrivata al server in un tentativo precedente di cui si è persa la risposta.
      if (q.op === 'add' && err?.code === '23505') { applied += 1; continue; }
      failed.push({ op: q, error: err });
    }
  }
  return { remaining: [], applied, failed };
}
