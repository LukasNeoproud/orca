---
id: TASK-7
title: Předat výsledek odbočky do původní konverzace
status: To Do
assignee: []
created_date: '2026-09-17 12:38'
labels: []
dependencies:
  - TASK-5
references:
  - 'https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed'
type: feature
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Vyčleněná práce potřebuje cestu zpět, aby uživatel nemusel ručně kopírovat závěry a rodič nepokračoval s neaktuálními informacemi. Předání výsledku je informační operace; merge, cherry-pick a integrační ověření jsou mimo rozsah.

Společné požadavky: navázat na existující strukturovaný chat a runtime Orcy; podporovat SSH execution host i folder workspace bez Gitu, zachovat kompatibilitu různých verzí klienta a hostitele a respektovat docs/STYLEGUIDE.md. Konkrétní dostupnost agentních API ověřit při implementaci; tvrzení ze zdrojové diskuse nejsou ověřeným kontraktem instalované verze.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Z odvozeného vlákna lze připravit stručný výsledek pro rodiče zahrnující závěr, rozhodnutí, relevantní artefakty, stav ověření a otevřené body.
- [ ] #2 Uživatel před odesláním vidí cílové vlákno a může předávaný obsah upravit; celý transcript se neposílá automaticky.
- [ ] #3 Po předání je dohledatelný zdroj a přesný obsah v obou vláknech; rodič dostane informaci prostřednictvím běžného mechanismu doručení do konverzace.
- [ ] #4 Předání nerozšiřuje oprávnění, nezačleňuje kód a neoznačí úkol automaticky za dokončený; stav začlenění je odlišen od hlášeného výsledku.
- [ ] #5 Nedostupný nebo právě pracující příjemce má explicitní stav doručení a bezpečné opakování bez duplicitní zprávy.
- [ ] #6 Testy ověřují náhled versus doručený obsah, obnovení stavu a opakované odeslání.

<!-- AC:END -->
