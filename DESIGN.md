---
name: Monte Ore
description: Il cartellino delle ore di un consulente, da compilare in pochi secondi dal telefono.
colors:
  ink: "#15212C"
  muted: "#566673"
  paper: "#F1F4F6"
  surface: "#FFFFFF"
  soft: "#E6EBEF"
  line: "#D5DDE3"
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
  night-paper: "#10171D"
  night-surface: "#18222A"
  night-ink: "#E8EEF2"
typography:
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
  figure:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    fontFeature: "tnum"
  code:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 500
rounded:
  control: "12px"
  card: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "9px 22px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
    height: "44px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  chip-selected:
    backgroundColor: "{colors.soft}"
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
---

# Design System: Monte Ore

## Overview

**Creative North Star: "Il cartellino"**

Monte Ore è il cartellino delle ore di una persona sola: si compila a fine giornata, dal telefono, spesso con una mano, e a fine mese deve tornare al minuto. Lo stile serve quella scena. Ogni schermata risponde prima di tutto a "quanto manca?", poi a "dove registro?", e il resto resta in secondo piano.

È un'interfaccia da strumento ("Operate"): familiare, ordinata, densa quanto basta. Il carattere sta nei dettagli: i numeri sempre allineati, la striscia della settimana che dice lo stato a colpo d'occhio, i riquadri morbidi in leggero rilievo che rendono l'app accogliente senza farla sembrare un gioco. Il colore compare solo quando porta un'informazione: il progetto, lo stato del giorno, un errore.

**Key Characteristics:**
- Colore come informazione, mai come decorazione.
- Cifre tabulari ovunque: le ore si leggono in colonna.
- Riquadri morbidi senza bordo, controlli arrotondati, una sola azione a pillola per schermata.
- Aree di tocco da 44 px sul telefono, compatte sul computer.
- Tema chiaro e scuro equivalenti.

## Colors

Palette fredda e sobria su carta grigio-azzurra; i colori pieni sono riservati ai progetti e agli stati.

### Primary
- **Inchiostro** (#15212C): testo principale, pulsante principale, giorno selezionato, barra del giorno mentre si riempie. Nel tema scuro diventa **Gesso** (#E8EEF2).

### Neutral
- **Carta** (#F1F4F6): sfondo della pagina. Scuro: #10171D.
- **Superficie** (#FFFFFF): riquadri, modulo, liste. Scuro: #18222A.
- **Nebbia** (#E6EBEF): seconda superficie: schede, segmenti, weekend e festivi, chip selezionati.
- **Linea** (#D5DDE3): bordi dei controlli e separatori.
- **Ardesia** (#566673): testo secondario, link, etichette di supporto.

### Stati
- **Completo** (#1A6E45): giorno o mese completo.
- **Mancano** (#9A5B00): ore mancanti o in più, giorni incompleti, offline.
- **Errore** (#B3261E): solo errori dei campi.
- **Assenza** (#7C8995): Ferie, Permesso, Altro.

### Progetti
Otto colori, scelti dall'utente per ogni progetto (c1…c8 nel database): blu #2353BD, verde acqua #0B7F6E, rosso #B23F2B, viola #6B46C1, arancio #A15C00, magenta #A8327A, verde #4A7A1C, azzurro #1F6F99. Nel tema scuro hanno varianti chiare dedicate in `src/style.css`.

### Named Rules
**La regola del quadratino.** Il colore di un progetto vive solo nel suo quadratino (9 px) e nelle barre del monte ore. Non colora mai selezioni, sfondi o testi: un progetto rosso non deve sembrare un errore.

**La regola dello stato.** Verde e ambra dicono soltanto "completo" e "manca o eccede". Non si usano per altro.

## Typography

**Display Font:** Familjen Grotesk (con Segoe UI, system-ui)
**Body Font:** IBM Plex Sans (con Segoe UI, system-ui)
**Code Font:** IBM Plex Mono, solo per i codici delle task ServiceNow

**Character:** una grottesca compatta per i titoli e una sans tecnica e leggibile per tutto il resto, con cifre tabulari. Il monospaziato non è un costume "tecnico": si usa solo dove ogni carattere conta, cioè nei codici delle task.

### Hierarchy
- **Headline** (700, 22px, 1.2): giorno selezionato e mese ("Mercoledì 4 novembre", "Novembre 2026").
- **Brand** (700, 20px, 1.1): "Monte Ore" nell'intestazione.
- **Title** (700, 16px): titoli di pannelli e moduli.
- **Body** (400, 16px, 1.45): testo, campi, pulsanti. Paragrafi entro 56ch.
- **Label** (600, 14px): etichette dei campi e legende.
- **Figure** (600, 17px, cifre tabulari): ore nella striscia, nelle voci e nel calendario; 26px per il totale del mese.
- **Code** (Plex Mono 500, 14–15px): codici delle task.

### Named Rules
**La regola delle due voci.** Una famiglia per i titoli, una per tutto il resto. Il monospaziato resta confinato ai codici.

## Layout

Una colonna sola, larga al massimo 620px, con margini laterali di 16px (e la safe area del telefono). Ritmo verticale di 20px tra i blocchi principali e di 12–14px dentro i riquadri; i gruppi correlati restano stretti (6–8px). La settimana e il calendario sono griglie a 7 colonne; sul telefono le etichette si riducono, mai le aree di tocco. Nessuno scorrimento orizzontale fino a 320px.

## Elevation & Depth

Sistema ibrido: i contenitori (lista delle voci, modulo, monte ore, pannelli) sono riquadri senza bordo in leggero rilievo; i controlli (pulsanti, campi, chip) restano piatti con un bordo sottile. Ciò che galleggia (messaggi e avviso di nuova versione) ha un'ombra più marcata. Nel tema scuro la profondità viene soprattutto dalla superficie più chiara dello sfondo.

### Shadow Vocabulary
- **Riquadro** (`0 1px 2px rgb(15 30 45 / .06), 0 6px 18px rgb(15 30 45 / .07)`): liste, modulo, monte ore, pannelli.
- **Chip** (`0 1px 2px rgb(15 30 45 / .08)`): giorni della striscia e riga di sincronizzazione.
- **Galleggiante** (`0 6px 20px rgb(0 0 0 / .28)` e `0 10px 30px rgb(0 0 0 / .25)`): messaggio in basso e avviso in alto.

### Named Rules
**La regola del rilievo unico.** Un elemento ha un bordo oppure un'ombra, mai entrambi.

## Shapes

Angoli morbidi a tre misure: 16px per i riquadri, 12px per controlli, chip e celle del calendario, pillola per l'azione principale di ogni riquadro ("Salva ore", "Accedi"). Le barre di avanzamento sono pillole sottili (6–8px). I quadratini dei progetti restano quadrati (raggio 2px): sono un segno, non un controllo.

## Components

### Buttons
- **Shape:** 12px; il pulsante principale è una pillola.
- **Primary:** inchiostro pieno con testo chiaro, 600, padding 9px 22px, alto 44px. Uno solo per riquadro.
- **Secondary:** trasparente con bordo Linea, 500; al passaggio il bordo diventa Ardesia.
- **Link:** testo Ardesia sottolineato a metà intensità; per azioni leggere (Modifica, Elimina, Termina, Backup).
- **Icon:** frecce e chiusura come icone disegnate a tratto 2px, mai caratteri Unicode.

### Chips
- **Style:** bordo Linea, 12px, alti 40px (44px sul telefono).
- **Selected:** bordo Inchiostro da 2px, sfondo Nebbia e segno di spunta. Il colore del progetto resta nel quadratino.
- **Nuova task:** bordo tratteggiato con icona "+".

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Superficie.
- **Shadow Strategy:** Riquadro (vedi sopra), senza bordo.
- **Internal Padding:** 14–16px.

### Inputs / Fields
- **Style:** bordo Linea, 12px, alti 44px, testo 16px (niente zoom automatico su iPhone).
- **Focus:** contorno blu di 2px a 2px di distanza, su tutti gli elementi.
- **Error:** bordo e messaggio Errore sotto il campo, collegato con `aria-describedby`.

### Navigation
Schede Giorno, Task e Mese in un segmento Nebbia: quella attiva è una superficie in rilievo. Si usano anche da tastiera (frecce, Home, Fine).

### Striscia della settimana
Sette giorni con le ore sotto la data: verde se completo, ambra se manca o eccede, grigio pieno per weekend e festivi, un punto per oggi. Il giorno selezionato è pieno di Inchiostro.

### Barra del giorno
Sotto il titolo del giorno: Inchiostro mentre si riempie, verde a giornata completa, ambra oltre le ore previste.

## Do's and Don'ts

### Do:
- **Do** usare cifre tabulari (`font-variant-numeric: tabular-nums`) per ogni numero.
- **Do** tenere ogni controllo toccabile ad almeno 44px sul telefono.
- **Do** dare a ogni pulsante con un nome abbreviato un nome completo per i lettori vocali che contenga il testo visibile.
- **Do** verificare ogni modifica in tema chiaro e scuro, a 320px e a 390px.
- **Do** lasciare vuoti i giorni futuri e liberi nel calendario: risaltano solo quelli incompleti.

### Don't:
- **Don't** colorare selezioni, sfondi o barre di stato con il colore di un progetto.
- **Don't** usare il monospaziato fuori dai codici delle task.
- **Don't** usare caratteri Unicode o emoji al posto delle icone.
- **Don't** mettere più di un pulsante principale nello stesso riquadro.
- **Don't** combinare bordo e ombra sullo stesso elemento.
