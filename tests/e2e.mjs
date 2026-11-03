// Prova l'app costruita: modalità locale con flussi completi, poi Supabase simulato per verificare login e richieste.
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(process.env.PLAYWRIGHT_FROM || import.meta.url);
const { chromium } = require('playwright');
const OUT = process.env.SHOTS || '.';
const badge = p => p.evaluate(() => window.__badges.at(-1));
const NOW = new Date('2026-11-04T10:00:00+01:00');

async function serve(dir, port) {
  const busy = await fetch(`http://localhost:${port}/`).then(() => true, () => false);
  if (busy) throw new Error(`la porta ${port} è già occupata, forse da un test precedente rimasto aperto`);
  const p = spawn('npx', ['vite', 'preview', '--outDir', dir, '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
  // Aspetta che il server risponda invece di un tempo fisso, che sulle macchine lente non basta.
  return (async () => {
    for (let i = 0; i < 100; i++) {
      if (p.exitCode !== null) throw new Error(`il server sulla porta ${port} non è partito`);
      try { await fetch(`http://localhost:${port}/`); return p; } catch { await new Promise(r => setTimeout(r, 200)); }
    }
    throw new Error(`il server sulla porta ${port} non risponde`);
  })();
}
const b = await chromium.launch();
const errs = [];
// Applica la stessa Content-Security-Policy di Netlify, così una violazione fa fallire il test.
const CSP = readFileSync('netlify.toml', 'utf8').match(/Content-Security-Policy = "([^"]+)"/)[1];
async function page(url, opts) {
  const c = await b.newContext({ serviceWorkers: 'block', ...opts });
  // Registra i valori mandati al contatore sull'icona.
  await c.addInitScript(() => {
    window.__badges = [];
    navigator.setAppBadge = n => { window.__badges.push(n); return Promise.resolve(); };
    navigator.clearAppBadge = () => { window.__badges.push(0); return Promise.resolve(); };
  });
  await c.route('http://localhost:*/**', async route => {
    const res = await route.fetch();
    route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': CSP } });
  });
  const p = await c.newPage();
  await p.clock.setFixedTime(NOW);
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (/Content Security Policy/i.test(m.text())) errs.push(m.text()); });
  return [p, c, url];
}

execSync('npx vite build --outDir dist', { stdio: 'ignore' });
const s1 = await serve('dist', 4301);
{
  const [p] = await page('', { viewport: { width: 1100, height: 900 }, colorScheme: 'light' });
  await p.goto('http://localhost:4301/');
  await p.waitForSelector('#entry-form');
  assert.match(await p.textContent('.dayhead h2'), /Mercoledì 4 novembre/);
  assert.match(await p.textContent('.state'), /0 di 8 h · Mancano 8 h/);
  // Lunedì 2, martedì 3 e mercoledì 4 (oggi) sono incompleti
  assert.equal(await badge(p), 3);
  await p.click('#save');
  assert.match(await p.textContent('#e-code'), /Inserisci il codice/);

  await p.click('label:has(#who-frau)');
  await p.fill('#f-code', 'inc 0048-231');
  assert.equal(await p.inputValue('#f-code'), 'INC0048-231');
  await p.fill('#f-code', 'task0048231');
  assert.equal(await p.inputValue('#f-code'), 'TASK0048231');
  await p.fill('#f-hours', '3');
  await p.fill('#f-desc', '<b>riunione</b>');
  await p.click('#save');
  await p.waitForSelector('.entry');
  assert.match(await p.textContent('.state'), /3 di 8 h · Mancano 5 h/);
  assert.equal(await p.locator('.desc b').count(), 0);
  assert.equal(await p.inputValue('#f-hours'), '5');
  await p.click('label:has(#kind-absence)');
  assert.equal(await p.locator('#f-code').count(), 0);
  await p.click('label:has(#who-permesso)');
  await p.click('#save');
  await p.waitForFunction(() => /Completo/.test(document.querySelector('.state').textContent));
  assert.equal(await p.locator('#entry-form').count(), 0);
  assert.equal(await badge(p), 2);
  await p.screenshot({ path: `${OUT}/day.png`, fullPage: true });
  await p.click('[id^=edit-] >> nth=0');
  await p.fill('#f-hours', '4');
  await p.click('#save');
  await p.waitForFunction(() => /9 di 8 h/.test(document.querySelector('.state').textContent));
  assert.match(await p.textContent('.state'), /1 h in più/);
  await p.click('#undo');
  await p.waitForFunction(() => /8 di 8 h/.test(document.querySelector('.state').textContent));
  await p.click('[id^=remove-] >> nth=-1');
  await p.waitForFunction(() => /3 di 8 h/.test(document.querySelector('.state').textContent));
  await p.click('#undo');
  await p.waitForFunction(() => /8 di 8 h/.test(document.querySelector('.state').textContent));
  await p.reload();
  await p.waitForSelector('.entry');
  assert.equal(await p.locator('.entry').count(), 2);
  // Task: si sceglie tra le aperte, più task sullo stesso progetto, poi si termina
  await p.click('#strip-2026-11-03');
  await p.waitForSelector('#entry-form');
  await p.click('label:has(#who-frau)');
  assert.equal(await p.locator('input[name=task]:checked').inputValue(), 'TASK0048231');
  await p.click('#new-task');
  await p.fill('#f-code', 'CHG777'); await p.fill('#f-hours', '2'); await p.click('#save');
  await p.waitForFunction(() => /2 di 8 h/.test(document.querySelector('.state').textContent));
  assert.equal(await p.locator('input[name=task]').count(), 2);
  await p.click('#save');
  assert.match(await p.textContent('#e-code'), /Scegli una task/);
  await p.click('label:has(input[value=TASK0048231])');
  await p.fill('#f-hours', '6'); await p.click('#save');
  await p.waitForFunction(() => /8 di 8 h/.test(document.querySelector('.state').textContent));
  await p.click('#tab-tasks');
  await p.waitForSelector('[data-act=donetask]');
  assert.equal(await badge(p), 1);
  assert.equal(await p.locator('[data-act=donetask]').count(), 2);
  const taskText = await p.textContent('.list');
  assert.match(taskText, /TASK0048231[\s\S]*9 h/);
  await p.screenshot({ path: `${OUT}/tasks.png`, fullPage: true });
  await p.click('[data-act=donetask][data-code=CHG777]');
  await p.waitForSelector('[data-act=reopentask]');
  assert.equal(await p.locator('[data-act=donetask]').count(), 1);
  assert.match(await p.textContent('[data-act=reopentask] >> xpath=ancestor::div[contains(@class,"entry")]'), /CHG777[\s\S]*2 h/);
  await p.click('#tab-day');
  await p.click('#strip-2026-11-05');
  await p.click('label:has(#who-frau)');
  assert.equal(await p.locator('input[name=task]').count(), 1);
  assert.equal(await p.locator('input[value=CHG777]').count(), 0);
  await p.click('#tab-month');
  await p.waitForSelector('.bankfig');
  assert.match(await p.textContent('.bankfig'), /16 di 168 h/);
  assert.match(await p.textContent('.state'), /1 giorno incompleto/);
  assert.match(await p.textContent('.legend'), /Poltrona Frau 11 h.*Permesso 5 h/);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export-xlsx')]);
  assert.equal(dl.suggestedFilename(), 'monte-ore-2026-11.xlsx');
  await dl.saveAs(`${OUT}/export.xlsx`);
  await p.screenshot({ path: `${OUT}/month.png`, fullPage: true });
  await p.click('#prev-month');
  await p.waitForSelector('#cal-2026-10-05');
  await p.click('#cal-2026-10-05');
  await p.waitForFunction(() => /Lunedì 5 ottobre/.test(document.querySelector('.dayhead h2')?.textContent));
  await p.click('#go-today');
  await p.waitForFunction(() => /Mercoledì 4 novembre/.test(document.querySelector('.dayhead h2')?.textContent));
  await p.click('#notif-toggle');
  await p.click('#add-time');
  await p.reload();
  await p.waitForSelector('.strip');
  assert.match(await p.textContent('#notif-toggle'), /3 orari/);
}
{
  const [p] = await page('', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await p.goto('http://localhost:4301/');
  await p.waitForSelector('#entry-form');
  await p.click('#tab-month');
  assert.equal(await p.locator('#export-xlsx').isDisabled(), true);
  await p.click('#tab-day');
  await p.waitForSelector('#entry-form');
  await p.fill('#f-code', 'TASK0048231'); await p.fill('#f-hours', '4'); await p.click('#save');
  await p.waitForSelector('.entry');
  // Nessun avviso di nuova versione quando lo script pubblicato è lo stesso
  await p.waitForTimeout(300);
  assert.equal(await p.locator('#update').count(), 0);

  // Copia le voci dell'ultimo giorno compilato, con annulla
  await p.click('#strip-2026-11-05');
  assert.match(await p.textContent('#copy-day'), /Copia da mercoledì 4 novembre · 4 h/);
  await p.click('#copy-day');
  await p.waitForFunction(() => /4 di 8 h/.test(document.querySelector('.state').textContent));
  assert.equal(await p.locator('#copy-day').count(), 0);
  await p.click('#undo');
  await p.waitForFunction(() => /0 di 8 h/.test(document.querySelector('.state').textContent));

  // Ore nel weekend: nessuna ora prevista, ma si possono registrare
  await p.click('#strip-2026-11-07');
  assert.match(await p.textContent('.state'), /Weekend/);
  assert.equal(await p.locator('#entry-form').count(), 0);
  assert.equal(await p.locator('#copy-day').count(), 0);
  assert.equal(await p.textContent('#open-form'), 'Aggiungi ore');
  await p.click('#open-form');
  await p.fill('#f-hours', '2'); await p.click('#save');
  await p.waitForFunction(() => /2 h · Weekend/.test(document.querySelector('.state').textContent));

  // Ore previste: venerdì a 4 ore, valore non valido rifiutato
  assert.match(await p.textContent('#hours-toggle'), /40 h/);
  await p.click('#hours-toggle');
  await p.fill('#dh-4', '4'); await p.press('#dh-4', 'Tab');
  await p.waitForFunction(() => /36 h/.test(document.getElementById('hours-toggle').textContent));
  await p.fill('#dh-0', 'tanto'); await p.press('#dh-0', 'Tab');
  await p.waitForSelector('#e-dh');
  assert.match(await p.textContent('#hours-toggle'), /36 h/);
  await p.click('#strip-2026-11-06');
  assert.match(await p.textContent('.state'), /0 di 4 h/);
  await p.click('#hours-toggle');
  await p.screenshot({ path: `${OUT}/phone.png`, fullPage: true });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  await p.click('#tab-month');
  await p.waitForSelector('.bankfig');
  assert.match(await p.textContent('.bankfig'), /6 di 152 h/);
  assert.match(await p.textContent('#cal-2026-11-07'), /2/);
  assert.match(await p.textContent('#cal-2026-11-08'), /–/);
  await p.screenshot({ path: `${OUT}/phone-month.png`, fullPage: true });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  // Avviso di nuova versione quando lo script pubblicato cambia
  await p.route('http://localhost:4301/', async route => {
    if (route.request().resourceType() !== 'fetch') return route.fallback();
    const res = await route.fetch();
    route.fulfill({ response: res, body: (await res.text()).replace('/assets/index-', '/assets/index-nuovo') });
  });
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForSelector('#update');
  assert.match(await p.textContent('#update'), /Nuova versione disponibile/);
  await Promise.all([p.waitForEvent('load'), p.click('#reload')]);
}
{
  // Progetti: aggiunta, nome duplicato, archivio, eliminazione, rinomina
  const [p] = await page('', { viewport: { width: 1000, height: 900 }, colorScheme: 'light' });
  await p.goto('http://localhost:4301/');
  await p.waitForSelector('#entry-form');
  await p.click('#tab-tasks');
  await p.click('#add-project');
  await p.fill('#p-name', '  Acme   <b>x</b> ');
  await p.click('label:has(#pcolor-c4)');
  await p.click('#p-save');
  await p.waitForSelector('#edit-project-acme-b-x-b');
  assert.equal(await p.locator('#projects .who b').count(), 0);
  assert.match(await p.textContent('#projects'), /Acme <b>x<\/b>/);
  await p.click('#add-project');
  await p.fill('#p-name', 'SHÜCO');
  await p.click('#p-save');
  assert.match(await p.textContent('#e-p-name'), /Esiste già/);
  await p.click('#p-cancel');

  await p.click('#tab-day');
  assert.equal(await p.locator('input[name=who]:checked').inputValue(), 'acme-b-x-b');
  await p.fill('#f-code', 'ACM1'); await p.fill('#f-hours', '2'); await p.click('#save');
  await p.waitForFunction(() => /2 di 8 h/.test(document.querySelector('.state').textContent));
  assert.match(await p.textContent('.list'), /Acme <b>x<\/b>/);

  await p.click('#tab-tasks');
  await p.waitForSelector('#archive-project-inpeco');
  assert.equal(await p.locator('#del-project-acme-b-x-b').count(), 0);
  await p.click('#archive-project-inpeco');
  await p.waitForSelector('#restore-project-inpeco');
  await p.click('#del-project-frau');
  await p.waitForFunction(() => !document.getElementById('edit-project-frau'));
  await p.click('#edit-project-shueco');
  await p.fill('#p-name', 'Schüco'); await p.click('label:has(#pcolor-c8)'); await p.click('#p-save');
  await p.waitForFunction(() => /Schüco/.test(document.getElementById('projects').textContent));

  await p.click('#tab-day');
  assert.deepEqual(await p.locator('input[name=who]').evaluateAll(els => els.map(e => e.value)), ['shueco', 'acme-b-x-b']);
  await p.click('#tab-month');
  await p.waitForSelector('.legend');
  const legend = await p.textContent('.legend');
  assert.match(legend, /Schüco 0 h/);
  assert.match(legend, /Acme <b>x<\/b> 2 h/);
  assert.doesNotMatch(legend, /Inpeco|Poltrona/);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export-xlsx')]);
  assert.equal(dl.suggestedFilename(), 'monte-ore-2026-11.xlsx');

  await p.reload();
  await p.waitForSelector('#entry-form');
  await p.click('#tab-tasks');
  await p.waitForSelector('#restore-project-inpeco');
  await p.click('#restore-project-inpeco');
  await p.waitForSelector('#archive-project-inpeco');
  // Schede da tastiera: frecce con ritorno all'inizio, Home e Fine; solo la scheda attiva riceve il Tab
  const active = () => p.evaluate(() => [document.activeElement.id, document.querySelector('[aria-selected=true]').id, document.getElementById('app').getAttribute('aria-labelledby')]);
  await p.focus('#tab-tasks');
  await p.keyboard.press('ArrowRight');
  await p.waitForSelector('.bankfig');
  assert.deepEqual(await active(), ['tab-month', 'tab-month', 'tab-month']);
  await p.keyboard.press('ArrowRight');
  await p.waitForSelector('.strip');
  assert.deepEqual(await active(), ['tab-day', 'tab-day', 'tab-day']);
  await p.keyboard.press('End');
  await p.waitForSelector('.bankfig');
  await p.keyboard.press('Home');
  await p.waitForSelector('.strip');
  assert.deepEqual(await active(), ['tab-day', 'tab-day', 'tab-day']);
  assert.deepEqual(await p.$$eval('[role=tab]', els => els.map(e => e.tabIndex)), [0, -1, -1]);

  // Tocco su una notifica con l'app aperta: torna alla scheda Giorno su oggi
  await p.click('#tab-month');
  await p.click('#prev-month');
  await p.waitForSelector('#cal-2026-10-05');
  await p.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'open-today' } })));
  await p.waitForFunction(() => /Mercoledì 4 novembre/.test(document.querySelector('.dayhead h2')?.textContent));
  assert.equal(await p.getAttribute('#tab-day', 'aria-selected'), 'true');
  await p.click('#tab-tasks');
  await p.screenshot({ path: `${OUT}/projects.png`, fullPage: true });
}
{
  // Backup: scarica, cancella tutto, ripristina, ripristina di nuovo senza doppioni
  const [p] = await page('', { viewport: { width: 1000, height: 900 }, colorScheme: 'light' });
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:4301/');
  await p.waitForSelector('#entry-form');
  await p.fill('#f-code', 'T1'); await p.fill('#f-hours', '3'); await p.click('#save');
  await p.waitForFunction(() => /3 di 8 h/.test(document.querySelector('.state').textContent));
  await p.click('#strip-2026-11-03');
  await p.click('#new-task');
  await p.fill('#f-code', 'OLD1'); await p.fill('#f-hours', '8'); await p.click('#save');
  await p.waitForFunction(() => /Completo/.test(document.querySelector('.state').textContent));
  await p.click('#tab-tasks');
  await p.click('[data-act=donetask][data-code=OLD1]');
  await p.waitForSelector('[data-act=reopentask][data-code=OLD1]');

  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
  assert.equal(dl.suggestedFilename(), 'monte-ore-backup-2026-11-04.json');
  const file = `${OUT}/backup.json`;
  await dl.saveAs(file);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.app, 'monte-ore');
  assert.deepEqual(saved.entries.map(e => [e.day, e.code, e.hours]), [['2026-11-03', 'OLD1', 8], ['2026-11-04', 'T1', 3]]);
  assert.equal(saved.projects.length, 3);

  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForSelector('#entry-form');
  assert.equal(await p.locator('.entry').count(), 0);

  await p.setInputFiles('#restore-file', file);
  await p.waitForFunction(() => /Ripristino completato: aggiunte 2 voci/.test(document.getElementById('toast').textContent));
  await p.click('#tab-day');
  await p.waitForFunction(() => /3 di 8 h/.test(document.querySelector('.state').textContent));
  await p.click('#tab-tasks');
  await p.waitForSelector('[data-act=reopentask][data-code=OLD1]');
  assert.equal(await p.locator('[data-act=donetask][data-code=T1]').count(), 1);

  await p.setInputFiles('#restore-file', file);
  await p.waitForFunction(() => /Niente da ripristinare: 2 voci sono già presenti/.test(document.getElementById('toast').textContent));
  await p.click('#tab-month');
  await p.waitForSelector('.bankfig');
  assert.match(await p.textContent('.bankfig'), /11 di 168 h/);

  writeFileSync(`${OUT}/non-backup.json`, '{"ciao": 1}');
  await p.setInputFiles('#restore-file', `${OUT}/non-backup.json`);
  await p.waitForFunction(() => /non è un backup di Monte Ore/.test(document.getElementById('toast').textContent));
}
process.kill(-s1.pid);

// Supabase simulato: verifica login e forma delle richieste.
execSync('npx vite build --outDir dist-remote', { stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: 'https://fake.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon', VITE_VAPID_PUBLIC_KEY: 'BA' } });
const s2 = await serve('dist-remote', 4302);
{
  const [p, c] = await page('', { viewport: { width: 1000, height: 800 } });
  const inserted = [];
  const writes = [];
  let down = false;
  const user = { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'a@b.it' };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await c.route('https://fake.supabase.co/**', async route => {
    const r = route.request(), u = new URL(r.url());
    const json = (body, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    // Rete assente per i dati: la richiesta fallisce come in treno o in galleria.
    if (down && u.pathname.startsWith('/rest/')) return route.abort('internetdisconnected');
    if (u.pathname.startsWith('/rest/v1/entries') && r.method() !== 'GET') writes.push(r.method());
    if (u.pathname === '/auth/v1/token') {
      const body = r.postDataJSON();
      if (body.password !== 'giusta') return json({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      return json({ access_token: 'x.eyJleHAiOjk5OTk5OTk5OTl9.y', token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user });
    }
    const asRow = e => ({ ...e, hours: String(e.hours), created_at: 'now' });
    if (u.pathname === '/rest/v1/entries' && r.method() === 'GET') return json(inserted.map(asRow));
    if (u.pathname === '/rest/v1/projects') return json([{ id: 'shueco', name: 'Shüco', color: 'c1', archived_at: null, created_at: '2026-01-01T00:00:00Z' }]);
    if (u.pathname === '/rest/v1/task_hours') return json(inserted.map(e => ({ who: e.who, code: e.code, done_at: null, hours: String(e.hours), last_day: e.day })));
    if (u.pathname === '/rest/v1/entries' && r.method() === 'POST') {
      const body = r.postDataJSON(), rows = Array.isArray(body) ? body : [body];
      if (rows.some(x => inserted.some(e => e.id === x.id))) return json({ code: '23505', message: 'duplicate key value' }, 409);
      inserted.push(...rows);
      const single = /vnd\.pgrst\.object/.test(r.headers()['accept'] || '');
      return json(single ? asRow(rows[0]) : rows.map(asRow), 201);
    }
    if (u.pathname === '/rest/v1/reminder_settings') return r.method() === 'GET' ? json({ times: ['13:00'] }) : json(null, 201);
    return json({}, 404);
  });
  await p.goto('http://localhost:4302/');
  await p.waitForSelector('#login-form');
  await p.fill('#email', 'a@b.it'); await p.fill('#password', 'errata'); await p.click('#login');
  await p.waitForSelector('.err');
  await p.fill('#email', 'a@b.it'); await p.fill('#password', 'giusta'); await p.click('#login');
  await p.waitForSelector('#entry-form');
  assert.match(await p.textContent('#notif-toggle'), /13:00/);
  await p.fill('#f-code', 'TASK0048231'); await p.fill('#f-hours', '2,5'); await p.click('#save');
  await p.waitForSelector('.entry');
  assert.equal(await p.locator('input[name=task]:checked').inputValue(), 'TASK0048231');
  assert.equal(inserted.length, 1);
  const { id: firstId, ...first } = inserted[0];
  assert.match(firstId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(first, { day: '2026-11-04', who: 'shueco', hours: 2.5, code: 'TASK0048231', description: '' });
  assert.match(await p.textContent('.hrs'), /2,5 h/);
  await p.reload();
  await p.waitForSelector('#entry-form');
  assert.equal(await p.locator('#login-form').count(), 0);
  assert.equal(await p.locator('#sync').isHidden(), true);

  // Senza rete: le ore restano sul dispositivo e partono quando torna la connessione
  down = true;
  writes.length = 0;
  const state = () => p.textContent('.state');
  await p.fill('#f-hours', '3'); await p.click('#save');
  await p.waitForFunction(() => /5,5 di 8 h/.test(document.querySelector('.state').textContent));
  assert.match(await p.textContent('#toast'), /appena torna la connessione/);
  assert.match(await p.textContent('#sync'), /1 modifica da inviare/);
  await p.click('[id^=edit-] >> nth=-1');
  await p.fill('#f-hours', '4'); await p.click('#save');
  await p.waitForFunction(() => /6,5 di 8 h/.test(document.querySelector('.state').textContent));
  await p.fill('#f-hours', '1'); await p.click('#save');
  // Aspetta la lista aggiornata, non solo l'indicatore: la coda si aggiorna un attimo prima.
  await p.waitForFunction(() => /7,5 di 8 h/.test(document.querySelector('.state').textContent));
  assert.match(await p.textContent('#sync'), /2 modifiche da inviare/);
  await p.screenshot({ path: `${OUT}/offline.png`, fullPage: true });
  await p.click('[id^=remove-] >> nth=-1');
  await p.waitForFunction(() => /6,5 di 8 h/.test(document.querySelector('.state').textContent));
  assert.match(await p.textContent('#sync'), /1 modifica da inviare/);

  // Riaperta senza rete mostra la copia locale più le modifiche in coda
  await p.reload();
  await p.waitForSelector('.entry');
  assert.equal(await p.locator('.entry').count(), 2);
  assert.match(await state(), /6,5 di 8 h/);
  assert.match(await p.textContent('#sync'), /1 modifica da inviare/);
  assert.equal(inserted.length, 1);

  // Torna la rete: parte una sola voce, già con le correzioni fatte offline
  down = false;
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForFunction(() => document.getElementById('sync').hidden);
  assert.equal(inserted.length, 2);
  assert.deepEqual({ ...inserted[1], id: 'x' }, { id: 'x', day: '2026-11-04', who: 'shueco', hours: 4, code: 'TASK0048231', description: '' });
  assert.deepEqual(writes, ['POST']);
  await p.reload();
  await p.waitForSelector('.entry');
  assert.match(await state(), /6,5 di 8 h/);

  // Backup dal server: tutte le voci, comprese quelle inviate dopo essere state offline
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
  const remote = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  assert.deepEqual(remote.entries.map(e => e.hours).sort(), [2.5, 4]);
  assert.deepEqual(remote.settings.times, ['13:00']);
}
{
  // Recupero password: richiesta del link, arrivo dal link con nuova password, link scaduto
  const [p, c] = await page('', { viewport: { width: 420, height: 800 } });
  const user = { id: '00000000-0000-0000-0000-000000000002', aud: 'authenticated', role: 'authenticated', email: 'a@b.it' };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const calls = [];
  await c.route('https://fake.supabase.co/**', route => {
    const r = route.request(), u = new URL(r.url());
    const json = (body, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/auth/v1/recover') { calls.push(['recover', r.postDataJSON().email, u.searchParams.get('redirect_to')]); return json({}); }
    if (u.pathname === '/auth/v1/user' && r.method() === 'GET') return json(user);
    if (u.pathname === '/auth/v1/user' && r.method() === 'PUT') { calls.push(['password', r.postDataJSON().password]); return json(user); }
    if (u.pathname === '/rest/v1/reminder_settings') return json({ times: [] });
    if (u.pathname.startsWith('/rest/v1/')) return json([]);
    return json({}, 404);
  });
  await p.goto('http://localhost:4302/');
  await p.click('#forgot');
  await p.click('#send-reset');
  assert.match(await p.textContent('.err'), /indirizzo email/);
  await p.fill('#reset-email', 'a@b.it'); await p.click('#send-reset');
  await p.waitForSelector('#reset-sent');
  assert.deepEqual(calls.shift(), ['recover', 'a@b.it', 'http://localhost:4302/']);
  await p.click('#back-to-login');
  await p.waitForSelector('#login-form');

  // Il link della mail apre una pagina nuova: cambiare solo il # non ricaricherebbe l'app.
  await p.goto('about:blank');
  await p.goto('http://localhost:4302/#access_token=x.eyJleHAiOjk5OTk5OTk5OTl9.y&expires_at=9999999999&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery');
  await p.waitForSelector('#password-form');
  await p.fill('#new-password', 'corta'); await p.fill('#new-password-2', 'corta'); await p.click('#save-password');
  assert.match(await p.textContent('.err'), /almeno 8/);
  await p.fill('#new-password', 'nuova-password'); await p.fill('#new-password-2', 'diversa-password'); await p.click('#save-password');
  assert.match(await p.textContent('.err'), /non coincidono/);
  await p.fill('#new-password', 'nuova-password'); await p.fill('#new-password-2', 'nuova-password'); await p.click('#save-password');
  await p.waitForSelector('#entry-form, #app');
  await p.waitForFunction(() => /Password aggiornata/.test(document.getElementById('toast').textContent));
  assert.deepEqual(calls.shift(), ['password', 'nuova-password']);
  assert.equal(new URL(p.url()).hash, '');

  await p.evaluate(() => localStorage.clear());
  // Il link della mail apre una pagina nuova: cambiare solo il # non ricaricherebbe l'app.
  await p.goto('about:blank');
  await p.goto('http://localhost:4302/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await p.waitForSelector('#login-form');
  assert.match(await p.textContent('.err'), /non è più valido/);
  assert.equal(new URL(p.url()).hash, '');
  await p.screenshot({ path: `${OUT}/login.png` });
}
process.kill(-s2.pid);
await b.close();
assert.deepEqual(errs, []);
console.log('E2E ok');
