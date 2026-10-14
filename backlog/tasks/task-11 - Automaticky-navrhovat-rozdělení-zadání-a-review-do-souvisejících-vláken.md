---
id: TASK-11
title: Automaticky navrhovat rozdělení zadání a review do souvisejících vláken
status: To Do
assignee: []
created_date: '2026-09-17 12:39'
labels: []
dependencies:
  - TASK-5
  - TASK-6
  - TASK-7
references:
  - 'https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed'
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

- [ ] #1 U vícetématového zadání nebo dokončeného review může Orca nabídnout rozdělení; dostupné je také ruční vyvolání a vypnutí automatických návrhů bez blokování běžného odesílání promptů.
- [ ] #2 Návrh seskupuje body podle samostatně ověřitelného výsledku; související vrstvy jedné změny nerozděluje pouze podle souborů či odrážek.
- [ ] #3 Review nálezy se společnou příčinou lze seskupit a nepotvrzený nález je zadán k ověření, nikoliv prezentován jako prokázaná chyba.
- [ ] #4 Před vytvořením uživatel upraví názvy, rozsah, závislosti, pracovní prostředí a cílený kontext, může části spojit, odmítnout nebo připojit k existujícímu souvisejícímu vláknu.
- [ ] #5 Potvrzení vytvoří asociovaná připravená vlákna s dohledatelnými zdrojovými pasážemi; spuštění práce je oddělená explicitní akce a původní agent obdrží informaci o vyčleněném rozsahu.
- [ ] #6 Opakované potvrzení, restart nebo částečné selhání nevytvoří duplicitní vlákna; UI ukáže skutečný výsledek každé položky.
- [ ] #7 Analýza má omezenou spotřebu a nezmění bez souhlasu poskytovatele; testy či hodnoticí scénáře zahrnují nezávislé úkoly, jednu provázanou změnu, duplicitní review nálezy a navázání na existující vlákno.

<!-- AC:END -->
