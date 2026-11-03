# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Un solo utente: il proprietario dell'app, consulente che lavora in contemporanea per più clienti (oggi Shüco, Inpeco e Poltrona Frau) su task ServiceNow. Nessun altro usa l'app e non sono previsti altri utenti.

## Product Purpose

Registrare ogni giorno le ore lavorate per cliente e task ServiceNow, oppure le assenze, senza dimenticare nulla, e produrre a fine mese un Excel affidabile con il dettaglio e i totali. Successo: nessun giorno lavorativo resta incompleto e il report mensile è corretto senza ritocchi.

## Positioning

È costruita attorno a una persona sola e al suo calendario: sa quali sono i suoi giorni lavorativi, le sue ore previste, i festivi italiani e le task aperte, e lo ricorda con promemoria che permettono di registrare direttamente dalla notifica.

## Operating Context

- Si usa soprattutto dal **telefono, a fine giornata** o quando arriva il promemoria: poche decine di secondi, spesso con una mano sola.
- PWA installata sulla schermata Home (iPhone e Android); su computer si usa dal browser.
- I promemoria arrivano dal lunedì al venerdì agli orari scelti, solo se mancano ore.
- L'Excel mensile è un documento che conta quanto la registrazione veloce: deve essere preciso e leggibile.
- Deve funzionare anche senza rete (treno, cantiere): le modifiche alle ore partono quando torna la connessione.

## Capabilities and Constraints

- Ore a blocchi di mezz'ora, massimo 24 per giorno; codice ServiceNow obbligatorio sui progetti, in qualsiasi formato.
- Assenze fisse: Ferie, Permesso, Altro.
- Ore previste configurabili da lunedì a venerdì; weekend e festivi nazionali senza ore previste ma registrabili.
- Progetti gestiti dall'app (nome, colore da una palette di 8, archivio).
- Lingua: solo italiano.
- Stack: Vite senza framework, Supabase, Netlify; nessuna risorsa esterna (font serviti dal sito, CSP restrittiva).

## Brand Commitments

Nome: Monte Ore. Nessun logo oltre all'icona dell'app. Tono dei testi: italiano semplice, diretto, in seconda persona, senza gergo tecnico.

## Evidence on Hand

Nessuna testimonianza, cliente o dato esterno: è uno strumento personale. Non inventare numeri, utenti o affermazioni.

## Product Principles

1. **Registrare deve richiedere pochi tocchi.** Il caso tipico è una giornata uguale a ieri, fatta dal telefono in pochi secondi.
2. **Mai perdere un'ora.** Offline, errori di rete e doppi tocchi non devono mai perdere o duplicare dati.
3. **Il mese deve tornare.** Totali, giorni incompleti e report devono essere esatti e coerenti tra app ed Excel.
4. **Lo stato del giorno si capisce a colpo d'occhio:** quanto manca, cosa è completo, cosa è fuori orario.

## Accessibility & Inclusion

Nessun requisito specifico dichiarato. Obiettivo: WCAG 2.1 AA, uso a una mano su telefono, tema chiaro e scuro.
