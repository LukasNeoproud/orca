---
id: TASK-7
title: Předat výsledek odbočky do původní konverzace
status: In Progress
assignee: []
created_date: 2026-09-17 12:38
updated_date: '2026-11-09T20:51:00Z'
labels: []
dependencies:
  - TASK-5
references:
  - https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed
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
- [x] #2 Uživatel před odesláním vidí cílové vlákno a může předávaný obsah upravit; celý transcript se neposílá automaticky.
- [ ] #3 Po předání je dohledatelný zdroj a přesný obsah v obou vláknech; rodič dostane informaci prostřednictvím běžného mechanismu doručení do konverzace.
- [x] #4 Předání nerozšiřuje oprávnění, nezačleňuje kód a neoznačí úkol automaticky za dokončený; stav začlenění je odlišen od hlášeného výsledku.
- [ ] #5 Nedostupný nebo právě pracující příjemce má explicitní stav doručení a bezpečné opakování bez duplicitní zprávy.
- [ ] #6 Testy ověřují náhled versus doručený obsah, obnovení stavu a opakované odeslání.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementace: commity 532b087c24 (hostitel), 140f22f09f až 8b937d340d (chat), eeb61b4e46 (terminál), 907f175bfa (Android); návrh v docs/reference/conversation-branching.md.
„Vrátit výsledek do rozcestí“: upravitelný dialog předvyplněný poslední odpovědí větve; rodič ho dostane jako neodeslaný koncept (chat: composer, terminál: vstupní řádek, zavřený rodič: obnovení s konceptem), hostitel uloží kopii (recordReturn). Odchylka: nic se rodiči automaticky neposílá, aby se nemíchaly změny. Chybí generované shrnutí (#1), stav doručení (#5) a zbývající testy (#6).
<!-- SECTION:NOTES:END -->
