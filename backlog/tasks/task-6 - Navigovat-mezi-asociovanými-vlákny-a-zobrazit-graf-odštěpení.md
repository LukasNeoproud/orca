---
id: TASK-6
title: Navigovat mezi asociovanými vlákny a zobrazit graf odštěpení
status: In Progress
assignee: []
created_date: 2026-09-17 12:38
updated_date: '2026-11-09T20:51:00Z'
labels: []
dependencies:
  - TASK-4
references:
  - https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed
type: feature
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Po rozdělení diskuse musí být snadné najít hlavní vlákno, související odbočky i místo jejich vzniku. Dodat skupinu konverzací s rychlým přepínáním a kompaktním grafem. Graf zachycuje původ diskuse, nikoli automaticky závislosti úkolů nebo Git větví.

Společné požadavky: navázat na existující strukturovaný chat a runtime Orcy; podporovat SSH execution host i folder workspace bez Gitu, zachovat kompatibilitu různých verzí klienta a hostitele a respektovat docs/STYLEGUIDE.md. Konkrétní dostupnost agentních API ověřit při implementaci; tvrzení ze zdrojové diskuse nejsou ověřeným kontraktem instalované verze.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Skupina nabízí přechod na rodiče, sourozence a potomky a návrat na přesný zdrojový bod konverzace.
- [ ] #2 Vazby rozlišují vedlejší diskusi, dílčí úkol a alternativní řešení; odložená alternativa není automaticky nedokončeným úkolem.
- [x] #3 Kompaktní graf zobrazuje konkrétní body odštěpení i opakované větvení v jednom vlákně; kliknutí otevře bod nebo cílovou konverzaci.
- [ ] #4 Přepínání zachovává scroll a rozepsaný prompt každého vlákna i relevantní otevřený detail; dostupná je klávesnicová navigace podle platformy.
- [x] #5 Vztahy a skupiny se obnoví po restartu; chybějící nebo nedostupný vzdálený zdroj je zobrazen bez záměny identit či falešného ukončení práce.
- [ ] #6 Testy pokrývají více úrovní větvení, více odštěpení z jednoho rodiče, obnovu a zachování stavu při přepnutí.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementace: commity 532b087c24 (hostitel), 140f22f09f až 8b937d340d (chat), eeb61b4e46 (terminál), 907f175bfa (Android); návrh v docs/reference/conversation-branching.md.
Hotové: drobečková navigace „Zpět na rozcestí“ se skokem na tah (desktop chat), čip „N větví“ v bodě rozvětvení a panel rodiny (strom kořen → body → větve) v chatu, terminálu i na Androidu; vazby přežijí restart (úložiště na hostiteli). Chybí druhy vazeb (#2), klávesnicová navigace (#4) a testy zachování stavu při přepnutí (#6); mobil bod rozvětvení neposouvá do zorného pole.
<!-- SECTION:NOTES:END -->
