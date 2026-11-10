# Monte Ore

App da telefono per registrare ogni giorno le ore sui tuoi progetti, per task ServiceNow, oppure le assenze. Invia promemoria agli orari scelti ed esporta il mese in Excel.

- **App:** PWA con Vite, ospitata su Netlify
- **Dati e login:** Supabase
- **Notifiche:** Web Push, inviate da una funzione pianificata di Netlify

## Provarla in locale

```bash
npm install
npm run dev
```

Senza variabili Supabase l'app gira in modalità locale: i dati restano nel browser e le notifiche sono spente.

## Metterla online

### 1. Supabase

1. Crea un progetto.
2. In **Authentication > Users** crea il tuo utente con email e password. Conferma l'email se richiesto.
3. Apri **SQL Editor** ed esegui, uno alla volta e in ordine, i file in `supabase/migrations/`. Il tuo utente riceve i progetti di partenza, che poi puoi cambiare dall'app.
4. In **Authentication > Sign In / Providers** disattiva **Allow new users to sign up**, così solo tu puoi accedere.
5. Copia URL del progetto, chiave `anon` e chiave `service_role` da **Project Settings > API**.
6. In **Authentication > URL Configuration** imposta **Site URL** con l'indirizzo del sito Netlify (per esempio `https://monte-ore.netlify.app`) e aggiungilo anche in **Redirect URLs**. Serve al link di **Password dimenticata?**: senza, la mail porta alla pagina sbagliata. Il servizio mail incluso in Supabase invia poche mail all'ora, sufficienti per un uso personale.

### 2. Chiavi delle notifiche

```bash
npx web-push generate-vapid-keys
```

### 3. Netlify

1. Carica il codice su un repository GitHub privato e collegalo a un nuovo sito Netlify.
2. In **Site configuration > Environment variables** imposta:

| Variabile | Valore |
| --- | --- |
| `VITE_SUPABASE_URL` | URL del progetto Supabase |
| `VITE_SUPABASE_ANON_KEY` | chiave `anon` |
| `VITE_VAPID_PUBLIC_KEY` | chiave pubblica generata |
| `SUPABASE_SERVICE_ROLE_KEY` | chiave `service_role`, segreta |
| `VAPID_PRIVATE_KEY` | chiave privata generata, segreta |
| `VAPID_SUBJECT` | `mailto:` seguito dalla tua email |

3. Avvia un nuovo deploy. La funzione pianificata gira solo sul deploy di produzione.

Il sito invia header di sicurezza, tra cui una Content-Security-Policy, definiti in `netlify.toml`. La policy permette le connessioni solo verso `*.supabase.co`: se usi un dominio personalizzato per Supabase, aggiungilo in `connect-src`.

### Aggiornare il database

Le modifiche al database sono file numerati in `supabase/migrations/`. Quando ne arriva uno nuovo, eseguilo una sola volta nello SQL Editor, prima di pubblicare il codice che lo usa. Per vedere quali hai già applicato:

```sql
select * from schema_migrations order by version;
```

Se riesegui per errore una migrazione già applicata si ferma con un messaggio e non cambia nulla. Solo la `0001` si può rieseguire.

### 4. Attivare le notifiche

- **iPhone:** apri il sito in Safari, poi Condividi > Aggiungi alla schermata Home. Apri l'app dall'icona, accedi, tocca la campanella e **Attiva su questo dispositivo**. Serve iOS 16.4 o successivo.
- **Android:** apri il sito in Chrome, installa l'app quando viene proposto, accedi, tocca la campanella e **Attiva su questo dispositivo**.

Usa **Prova notifica** per controllare che l'invio funzioni, poi verifica che arrivi un promemoria a un orario impostato.

### Backup

In fondo alla pagina, **Scarica backup** crea un file JSON con tutte le ore di sempre, i progetti, le task (anche terminate) e le impostazioni. Sul telefono si apre il menu di condivisione: salvalo su File, su un cloud o mandalo per mail.

**Ripristina backup** aggiunge ciò che manca e non modifica né elimina i dati che ci sono già. Prima di procedere mostra cosa farà e chiede conferma.

- Ripristinare lo stesso file due volte non crea doppioni: ogni voce ha un identificativo.
- Le task terminate nel backup tornano terminate.
- Un progetto con lo stesso nome di uno già presente viene aggiunto come "Nome (backup)".
- Le voci non valide vengono saltate e conteggiate.
- Le impostazioni (orari e ore previste) sono nel file come riferimento, ma il ripristino non le applica.
- Backup e ripristino richiedono la connessione. In modalità locale il backup è l'unico modo per portare i dati su un altro browser.

### Senza connessione

L'app si apre anche offline, con l'ultima copia dei dati salvata sul dispositivo.

- **Ore**: puoi registrarle, modificarle, copiarle ed eliminarle. Le modifiche restano in coda sul dispositivo e partono da sole appena torna la connessione, nell'ordine in cui le hai fatte. Una riga sotto le schede mostra quante ne mancano.
- **Il resto** (progetti, task, impostazioni, notifiche) richiede la connessione.
- Più modifiche alla stessa voce partono come una sola. Una voce aggiunta e poi eliminata offline non arriva mai al server.
- Se una modifica non è più valida quando arriva al server, per esempio perché nel frattempo hai eliminato il progetto da un altro dispositivo, viene scartata e l'app te lo segnala.
- Uscendo dall'account le modifiche non ancora inviate si perdono: l'app chiede conferma.

### Contatore sull'icona

L'icona dell'app mostra quanti giorni del mese in corso sono incompleti, oggi compreso: lo stesso numero della scheda Mese. Si aggiorna quando usi l'app, a ogni promemoria e quando premi un pulsante su una notifica.

- **iPhone:** serve l'app aggiunta alla schermata Home con le notifiche attive (iOS 16.4 o successivo). Il numero si vede se in **Impostazioni > Notifiche > Monte Ore** è attivo **Badge**.
- **Computer:** Chrome ed Edge con l'app installata.
- **Android:** Chrome non supporta il numero sull'icona. Il launcher mostra solo un pallino quando c'è una notifica.

### Pulsanti sui promemoria

Su Android e sul computer (Chrome, Edge) il promemoria ha fino a due pulsanti, che registrano le ore senza aprire l'app:

- **Copia da…**: se oggi non hai ancora registrato nulla, ripete le voci dell'ultimo giorno compilato, come il pulsante Copia nell'app.
- **+N h su TASK…**: registra le ore mancanti sull'ultima task usata, se è ancora aperta e il suo progetto è attivo.

Una seconda notifica conferma cosa è stato registrato. I pulsanti valgono 12 ore e il server ricontrolla tutto quando li premi: toccarli due volte, o da due dispositivi, non duplica le ore. Su iPhone le notifiche web non mostrano pulsanti: il tocco apre l'app come sempre.

Ogni pulsante porta un token firmato con una chiave ricavata da `VAPID_PRIVATE_KEY`: se cambi quella chiave, i pulsanti dei promemoria già inviati smettono di funzionare.

## Regole da conoscere

- **Progetti**: si gestiscono nella scheda Task: aggiungi, rinomina, cambia colore, archivia o elimina. Un progetto archiviato non si propone più quando registri le ore ma resta nei totali, nell'export e nelle task. Si può eliminare solo un progetto senza task.
- **Ore previste**: l'icona con l'orologio, in alto, imposta le ore da registrare da lunedì a venerdì (predefinite 8). Metti 0 nei giorni in cui non lavori.
- Sabato, domenica e festivi non prevedono ore e non risultano mai incompleti, ma puoi registrarci ore con **Aggiungi ore**: contano nel totale del mese e nell'export.
- I promemoria partono dal lunedì al venerdì, esclusi i festivi nazionali e i giorni a 0 ore, e solo se nella giornata mancano ore rispetto a quelle previste.
- La funzione dei promemoria gira ogni 5 minuti: un promemoria arriva entro qualche minuto dall'orario scelto. Se l'invio fallisce per un errore temporaneo viene ritentato al giro successivo, fino a 10 minuti dopo l'orario.
- Il santo patrono locale non è un festivo automatico: registralo come assenza **Altro**.
- Il codice ServiceNow è obbligatorio sui progetti, in qualsiasi formato. Una task si crea alla prima registrazione, resta selezionabile finché è aperta e, una volta terminata, resta nell'archivio con le sue ore. Registrare ore sul suo codice la riapre.
- Ogni task può avere un **titolo** (facoltativo, al massimo 80 caratteri), che resta uguale in tutte le ore registrate su di essa; la descrizione invece è il commento della singola voce. Il titolo si scrive creando la task o, in qualsiasi momento, dalla scheda Task con **Aggiungi titolo** / **Cambia titolo**. Quando registri le ore vedi il titolo in grande e il codice sotto; nel giorno e nella scheda Task il codice in grande e il titolo sotto. Compare anche nell'Excel, nel backup e nei pulsanti delle notifiche.
- Su un giorno vuoto, **Copia da…** ripete le voci dell'ultimo giorno compilato nella settimana precedente. Le voci su task terminate non vengono copiate.
- Quando pubblichi una nuova versione, l'app aperta mostra **Nuova versione disponibile**: toccalo per ricaricare.
- Nel weekend l'app si apre sul venerdì se è incompleto, altrimenti sul lunedì successivo.
- **Esporta in Excel**, nella tab Mese, crea un file con il dettaglio delle voci e il riepilogo per progetto e task.

## Struttura del codice

| File | Contenuto |
| --- | --- |
| `src/logic.js` | Regole pure condivise con il server: calendario, festivi, validazioni |
| `src/store.js` | Accesso ai dati: Supabase oppure il browser in modalità locale |
| `src/state.js` | Stato dell'app e calcoli che ne derivano |
| `src/outbox.js`, `src/sync.js` | Coda delle modifiche fatte offline e invio quando torna la rete |
| `src/backup.js` | Backup in JSON: preparazione, controlli e piano di ripristino |
| `src/render.js`, `src/ui.js` | Struttura della pagina, messaggi ed elementi comuni |
| `src/views/` | Una vista per file: giorno, task e progetti, mese, pannelli in alto |
| `src/main.js` | Avvio e collegamento degli eventi alle azioni delle viste |
| `netlify/` | Funzioni server: promemoria pianificati con pulsanti, azioni rapide (`/api/quick-log`) e notifica di prova |
| `supabase/migrations/` | Schema del database, una migrazione per file |
| `PRODUCT.md`, `DESIGN.md` | A chi serve l'app e con quali principi; sistema visivo (colori, caratteri, forme, componenti) da rispettare nelle modifiche future |

Ogni vista esporta `actions`: il nome dell'azione corrisponde all'attributo `data-act` dei pulsanti.

## Test

```bash
npm run lint      # controllo del codice con ESLint
npm test          # regole, promemoria, vincoli e sicurezza del database
npm i --no-save playwright && npx playwright install chromium
npm run test:e2e  # flussi completi nel browser
```

Gli stessi test girano su GitHub Actions a ogni push e pull request (`.github/workflows/ci.yml`).
