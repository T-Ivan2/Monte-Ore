---
name: Monte Ore
description: Il cartellino delle ore di un consulente, da compilare in pochi secondi dal telefono.
colors:
  ink: "#10202A"
  muted: "#52636D"
  paper: "#EDF1F2"
  surface: "#FFFFFF"
  soft: "#E2E9EC"
  line: "#D2DBDF"
  accent: "#0B6477"
  on-accent: "#FFFFFF"
  hero: "#0B2E3A"
  hero-ink: "#FFFFFF"
  hero-muted: "#B9D7DE"
  ok: "#1A6E45"
  warn: "#9A5B00"
  error: "#B3261E"
  absence: "#7C8995"
  project-blue: "#2353BD"
  project-teal: "#0B7F6E"
  project-red: "#B23F2B"
  project-violet: "#6B46C1"
  project-orange: "#A15C00"
  project-magenta: "#A8327A"
  project-green: "#4A7A1C"
  project-azure: "#1F6F99"
  night-paper: "#0C1418"
  night-surface: "#152128"
  night-ink: "#E6EEF1"
  night-accent: "#62C6D8"
  night-hero: "#0F3C4B"
typography:
  figure-hero:
    fontFamily: "Familjen Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "46px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Familjen Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  brand:
    fontFamily: "Familjen Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "Familjen Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
  title:
    fontFamily: "Familjen Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
  body:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  code:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 500
rounded:
  control: "12px"
  card: "18px"
  hero: "22px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.pill}"
    padding: "9px 24px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
    height: "44px"
  button-mini:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  chip-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px"
  hero:
    backgroundColor: "{colors.hero}"
    textColor: "{colors.hero-ink}"
    rounded: "{rounded.hero}"
    padding: "18px"
---

# Design System: Monte Ore

## Overview

**Creative North Star: "Il cartellino"**

Monte Ore è il cartellino delle ore di una persona sola: si compila a fine giornata, dal telefono, spesso con una mano, e a fine mese deve tornare al minuto. Ogni schermata risponde prima a "quanto manca?", poi a "dove registro?".

Due segni rendono l'app riconoscibile. Il primo è il **riquadro in evidenza**: una superficie petrolio scuro con le ore in grande, lo stato in un'etichetta e una barra con i colori dei progetti. Il secondo sono i **giorni a riempimento**: nella settimana e nel calendario ogni giorno si riempie dal basso in proporzione alle ore registrate, come un monte ore che cresce. Il resto è volutamente quieto: riquadri bianchi morbidi, un solo colore d'accento, colore pieno solo dove porta un'informazione.

**Key Characteristics:**
- Un riquadro scuro per schermata dice lo stato; tutto il resto è chiaro e quieto.
- I giorni si riempiono: verde quando completi, ambra quando manca o eccede.
- Sul telefono la navigazione è in basso, a portata di pollice.
- Cifre tabulari ovunque; i numeri importanti nel carattere dei titoli.
- Tema chiaro e scuro equivalenti.

## Colors

Palette "Petrolio": grigi freddi, un accento verde petrolio e colori pieni riservati a progetti e stati.

### Primary
- **Petrolio** (#0B6477; scuro #62C6D8): azione principale, selezione (bordo e spunta), scheda attiva, anello del giorno selezionato e di oggi, focus.
- **Petrolio notte** (#0B2E3A; scuro #0F3C4B): fondo del riquadro in evidenza, dell'icona e del marchio. Sopra si usano bianco, Brina (#B9D7DE) per il testo secondario e le varianti chiare dei colori dei progetti.

### Neutral
- **Inchiostro** (#10202A): testo. **Ardesia** (#52636D): testo secondario.
- **Carta** (#EDF1F2): sfondo. **Superficie** (#FFFFFF): riquadri. **Nebbia** (#E2E9EC): seconda superficie (schede, segmenti, weekend, azioni nelle righe). **Linea** (#D2DBDF): bordi dei controlli.

### Stati
- **Completo** (#1A6E45) e **Mancano** (#9A5B00): riempimento dei giorni e messaggi. Nel riquadro in evidenza diventano #9BE8BC e #FFD08A.
- **Errore** (#B3261E): errori dei campi e "Elimina".

### Progetti
Otto colori scelti dall'utente (c1…c8 nel database), con varianti chiare per tema scuro e riquadro in evidenza.

### Named Rules
**La regola del colore del progetto.** Il colore di un progetto vive in tre posti: il quadratino, il riquadro delle ore (in tinta al 17%) e le barre. Non colora mai selezioni o testi: un progetto rosso non deve sembrare un errore.

**La regola dello stato.** Verde e ambra dicono soltanto "completo" e "manca o eccede". Sui giorni sono un riempimento tenue con il numero in inchiostro, mai testo colorato su fondo colorato.

**La regola dell'accento.** Il petrolio segna ciò che è attivo o selezionato e l'azione principale. Non decora.

## Typography

**Display Font:** Familjen Grotesk. **Body Font:** IBM Plex Sans. **Code Font:** IBM Plex Mono, solo per i codici delle task.

### Hierarchy
- **Figure hero** (700, 46px; 42px sul telefono): le ore del giorno e del mese nel riquadro in evidenza.
- **Headline** (700, 22px): titoli di sezione e mese.
- **Brand** (700, 20px): "Monte Ore".
- **Figure** (700, 18px): ore nei giorni e nei riquadri delle righe.
- **Title** (700, 16px): titoli di moduli e pannelli.
- **Body** (400, 16px, 1.45): testo e campi. Paragrafi entro 56ch.
- **Label** (600, 14px): etichette, legende, azioni nelle righe (13px).
- **Code** (Plex Mono 500–600, 13–15px): codici delle task.

### Named Rules
**La regola delle due voci.** Una famiglia per titoli e numeri importanti, una per tutto il resto. Il monospaziato resta confinato ai codici.

## Layout

Una colonna, larga al massimo 640px, margini di 16px più la safe area. Ritmo di 18px tra i blocchi, 12–14px dentro i riquadri. Sotto i 720px le schede diventano una barra fissa in basso con icona ed etichetta; sopra, un segmento in alto. Il messaggio di conferma si sposta sopra la barra. Nessuno scorrimento orizzontale fino a 320px.

## Elevation & Depth

I contenitori sono riquadri senza bordo in leggero rilievo; i controlli sono piatti con bordo sottile; il riquadro in evidenza si stacca per colore. Nel tema scuro la profondità viene dalla superficie più chiara dello sfondo.

### Shadow Vocabulary
- **Riquadro** (`0 1px 2px rgb(15 30 45 / .06), 0 8px 22px rgb(15 30 45 / .07)`): liste, modulo, pannelli, riquadro in evidenza.
- **Chip** (`0 1px 2px rgb(15 30 45 / .09)`): giorni, pulsanti dell'intestazione, scheda attiva.
- **Galleggiante** (`0 6px 20px rgb(0 0 0 / .28)`): messaggio di conferma e avviso di nuova versione.

### Named Rules
**La regola del rilievo unico.** Un elemento ha un bordo oppure un'ombra, mai entrambi.

## Shapes

Angoli morbidi a quattro misure: 22px per il riquadro in evidenza, 18px per i riquadri, 12px per controlli e giorni, pillola per azione principale, etichette di stato e azioni nelle righe. Barre a pillola alte 10px.

## Components

### Riquadro in evidenza
Fondo Petrolio notte. In alto la data (o il mese), poi il numero in grande con "di N h" accanto e, a destra, l'etichetta di stato. Sotto, la barra: un tratto per voce nel colore del progetto. Uno solo per schermata.

### Giorni a riempimento
Settimana (alti 66px) e calendario (60px). Il fondo si riempie dal basso: tinta d'accento se il giorno è futuro e parziale, verde se completo, ambra se manca o eccede. Weekend e festivi su Nebbia. Il giorno selezionato e oggi hanno un anello d'accento da 2px; oggi anche un punto.

### Righe
Riquadro delle ore a sinistra (tinta del progetto), poi codice in primo piano con titolo e progetto sotto. Le voci del giorno sono pulsanti a tutta riga che aprono la modifica, con una freccia a destra; "Elimina" sta nel modulo di modifica. Nelle schede Task e Progetti le azioni sono pillole Nebbia sotto il testo.

### Buttons
- **Primary:** pillola d'accento, 44px; a tutta larghezza sul telefono. Uno per riquadro.
- **Secondary:** bordo Linea, 12px.
- **Wide:** superficie a tutta larghezza per "Aggiungi ore" e "Aggiungi progetto".
- **Mini:** pillola Nebbia per le azioni nelle righe.
- **Danger:** testo e bordo Errore, solo per "Elimina".

### Chips
Bordo Linea, 12px. Selezionato: bordo d'accento da 2px, velo d'accento e spunta. Le task sono un elenco a tutta larghezza con titolo in primo piano e codice sotto.

### Inputs / Fields
Bordo Linea, 12px, 44px, testo 16px. Il campo delle ore è grande (52px, 22px nel carattere dei titoli) tra due pulsanti Nebbia. Errore: bordo e messaggio collegato al campo.

### Navigation
Giorno, Task, Mese con icona. Sul telefono barra in basso: l'attiva ha icona su pillola d'accento tenue ed etichetta d'accento. Si usa anche da tastiera (frecce, Home, Fine).

## Do's and Don'ts

### Do:
- **Do** usare un solo riquadro in evidenza per schermata.
- **Do** tenere il numero dei giorni in inchiostro sopra il riempimento.
- **Do** tenere ogni controllo toccabile ad almeno 44px sul telefono.
- **Do** verificare ogni modifica in tema chiaro e scuro, a 320px e a 390px.
- **Do** mettere nel codice il testo prima delle ore nelle righe: i lettori vocali leggono prima che cosa, poi quanto.

### Don't:
- **Don't** usare il colore di un progetto per selezioni o testi.
- **Don't** usare l'accento come decorazione.
- **Don't** usare il monospaziato fuori dai codici delle task.
- **Don't** usare caratteri Unicode o emoji al posto delle icone.
- **Don't** combinare bordo e ombra sullo stesso elemento.
