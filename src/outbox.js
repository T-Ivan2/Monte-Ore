// Coda delle modifiche alle ore fatte senza connessione. Funzioni pure: niente rete né storage,
// così le regole si possono provare a fondo. Le operazioni sono:
//   { op: 'add', row }            voce nuova, con id già assegnato sul dispositivo
//   { op: 'update', id, patch }   modifica di una voce
//   { op: 'remove', id }          eliminazione di una voce
//   { op: 'title', who, code, title }  titolo di una task (null lo toglie)

// Aggiunge un'operazione fondendola con quelle in attesa sulla stessa voce. Non modifica la coda ricevuta.
export function enqueue(queue, op) {
  if (op.op === 'add') return [...queue, op];
  // Del titolo conta solo l'ultimo: sostituisce quello in attesa, ma resta dopo la voce che crea la task.
  if (op.op === 'title') return [...queue.filter(q => !(q.op === 'title' && q.who === op.who && q.code === op.code)), op];
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
const isTitleOp = q => q.op === 'title';

// Le task nascono e si riaprono sul server quando si registrano ore: offline lo simula per le voci nuove.
export function overlayTasks(tasks, queue) {
  const out = tasks.map(t => ({ ...t }));
  for (const q of queue) {
    if (isTitleOp(q)) {
      const t = out.find(x => x.who === q.who && x.code === q.code);
      if (t) t.title = q.title;
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
    const q = queue[i];
    try {
      if (q.op === 'add') await api.add(q.row);
      if (q.op === 'update') await api.update(q.id, q.patch);
      if (q.op === 'remove') await api.remove(q.id);
      if (q.op === 'title') await api.title(q.who, q.code, q.title);
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
