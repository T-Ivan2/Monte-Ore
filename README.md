# Monte Ore

App da telefono per registrare ogni giorno le ore su Shüco, Inpeco e Poltrona Frau, per task ServiceNow, oppure le assenze. Invia promemoria agli orari scelti ed esporta il mese in Excel.

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
2. Apri **SQL Editor** ed esegui `supabase/schema.sql`.
3. In **Authentication > Users** crea il tuo utente con email e password. Conferma l'email se richiesto.
4. In **Authentication > Sign In / Providers** disattiva **Allow new users to sign up**, così solo tu puoi accedere.
5. Copia URL del progetto, chiave `anon` e chiave `service_role` da **Project Settings > API**.

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

### 4. Attivare le notifiche

- **iPhone:** apri il sito in Safari, poi Condividi > Aggiungi alla schermata Home. Apri l'app dall'icona, accedi, tocca la campanella e **Attiva su questo dispositivo**. Serve iOS 16.4 o successivo.
- **Android:** apri il sito in Chrome, installa l'app quando viene proposto, accedi, tocca la campanella e **Attiva su questo dispositivo**.

Usa **Prova notifica** per controllare che l'invio funzioni, poi verifica che arrivi un promemoria a un orario impostato.

## Regole da conoscere

- I promemoria partono dal lunedì al venerdì, esclusi i festivi nazionali, e solo se nella giornata mancano ore.
- Il santo patrono locale non è un festivo automatico: registralo come assenza **Altro**.
- Il codice ServiceNow è obbligatorio sui progetti, in qualsiasi formato. Una task si crea alla prima registrazione, resta selezionabile finché è aperta e, una volta terminata, resta nell'archivio con le sue ore. Registrare ore sul suo codice la riapre.
- **Esporta in Excel**, nella tab Mese, crea un file con il dettaglio delle voci e il riepilogo per progetto e task.

## Test

```bash
npm test          # regole, promemoria, vincoli e sicurezza del database
npm i --no-save playwright && npx playwright install chromium
npm run test:e2e  # flussi completi nel browser
```
