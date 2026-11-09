---
id: TASK-11
title: Automaticky navrhovat rozdělení zadání a review do souvisejících vláken
status: In Progress
assignee: []
created_date: 2026-09-17 12:39
updated_date: '2026-11-09T20:51:00Z'
labels: []
dependencies:
  - TASK-5
  - TASK-6
  - TASK-7
references:
  - https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed
type: feature
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Více nezávislých požadavků v jednom promptu nebo více nálezů v review zahlcuje jedno vlákno. Orca má nabídnout smysluplné rozdělení na samostatně zadatelné a ověřitelné části a připravit jejich cílený kontext. Automatická je analýza a nabídka, nikoliv založení či spuštění agentů bez volby uživatele. První verze nevyžaduje tematický index celé historie. Koordinované spouštění, limity souběhu a automatické slučování kódu jsou mimo rozsah.

Společné požadavky: navázat na existující strukturovaný chat a runtime Orcy; podporovat SSH execution host i folder workspace bez Gitu, zachovat kompatibilitu různých verzí klienta a hostitele a respektovat docs/STYLEGUIDE.md. Konkrétní dostupnost agentních API ověřit při implementaci; tvrzení ze zdrojové diskuse nejsou ověřeným kontraktem instalované verze.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 U vícetématového zadání nebo dokončeného review může Orca nabídnout rozdělení; dostupné je také ruční vyvolání a vypnutí automatických návrhů bez blokování běžného odesílání promptů.
- [ ] #2 Návrh seskupuje body podle samostatně ověřitelného výsledku; související vrstvy jedné změny nerozděluje pouze podle souborů či odrážek.
- [ ] #3 Review nálezy se společnou příčinou lze seskupit a nepotvrzený nález je zadán k ověření, nikoliv prezentován jako prokázaná chyba.
- [ ] #4 Před vytvořením uživatel upraví názvy, rozsah, závislosti, pracovní prostředí a cílený kontext, může části spojit, odmítnout nebo připojit k existujícímu souvisejícímu vláknu.
- [ ] #5 Potvrzení vytvoří asociovaná připravená vlákna s dohledatelnými zdrojovými pasážemi; spuštění práce je oddělená explicitní akce a původní agent obdrží informaci o vyčleněném rozsahu.
- [x] #6 Opakované potvrzení, restart nebo částečné selhání nevytvoří duplicitní vlákna; UI ukáže skutečný výsledek každé položky.
- [ ] #7 Analýza má omezenou spotřebu a nezmění bez souhlasu poskytovatele; testy či hodnoticí scénáře zahrnují nezávislé úkoly, jednu provázanou změnu, duplicitní review nálezy a navázání na existující vlákno.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementace: commity 532b087c24 (hostitel), 140f22f09f až 8b937d340d (chat), eeb61b4e46 (terminál), 907f175bfa (Android); návrh v docs/reference/conversation-branching.md.
„Rozvětvit po nálezech“ u odpovědi s ≥2 nálezy (číslované nadpisy nebo nejdelší seznam): u každého nálezu název, prompt a výběr, společný režim kontextu; větve se připraví postupně na pozadí, opakování se stejným requestId nevytvoří duplicitu a každá položka ukazuje svůj výsledek. Nic se nespouští. Chybí sémantické seskupení (#2, #3), spojování a závislosti (#4), informování původního agenta (#5, záměrně vynecháno) a hodnoticí scénáře (#7).
<!-- SECTION:NOTES:END -->
