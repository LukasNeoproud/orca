---
id: TASK-98
title: 'Change review: strojové ověření tvrzení AI o celcích'
status: To Do
assignee: []
created_date: '2026-11-18T15:20:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-96
  - TASK-97
documentation:
  - docs/review-ide/06-ai-a-review.md
  - docs/review-ide/05-funkce.md
priority: medium
type: feature
ordinal: 220000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Komentář AI k celku je tvrzení, ne důkaz. Orca ho má porovnat s tím, co o změně ví strojově, a rozpor ukázat dřív, než mu recenzent uvěří. Je to stejný princip jako u nálezů s důkazem, použitý na celky.

### Rozsah

- Ověřovač bez AI v `src/main/change-review/`: vstupem jsou celky s druhem tvrzení (TASK-95), druhy hunků z manifestu (TASK-91, TASK-94) a rizikové příznaky (TASK-97); výstupem úroveň důvěry celku `verified`, `claimed` nebo `contradicted` a seznam hunků, které tvrzení vyvracejí.
- Úroveň důvěry je odvozená hodnota, do úložiště celků se neukládá.
- Rozhraní v `src/renderer/src/components/change-review/`: odznak důvěry u celku, vysvětlení rozporu s odkazem na hunk, řazení fronty.

### Mimo rozsah

- Ověření pokrytí testy (až bude zdroj pokrytí) a ověření přes language server (M3).
- Druhý, oponentní běh AI.
- Ověření důkazů u nálezů review: tikety Nálezy AI s důkazem.

### Omezení

- Názvy úrovní důvěry a jejich význam drž shodné s modelem nálezu z TASK-84: ověřeno smí být jen to, co potvrdil stroj.
- Rozpor nic neblokuje; jen řadí a upozorňuje.
- Texty odznaků v šesti jazycích; barvy ze stávajících stavových tokenů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Celek s tvrzením jen přesun, jehož všechny hunky jsou přesuny, přejmenování nebo generovaný kód, je ověřený; obsahuje-li jiný hunk, je vyvrácený a pohled ukáže, který hunk tvrzení vyvrací
- [ ] #2 Celek s tvrzením beze změny chování je vyvrácený, když obsahuje oslabený test nebo hunk druhu semantic mimo testy; tvrzení jen testy je vyvrácené, když obsahuje soubor mimo testy
- [ ] #3 Celek se změnou chování bez testového hunku je označený jako nepodložený testem
- [ ] #4 Tvrzení, které Orca neumí strojově posoudit, zůstává jako tvrzení AI a je tak označené
- [ ] #5 Pohled řadí vyvrácené celky první, pak nevysvětlené hunky, pak podle rizika
- [ ] #6 Ověření je deterministické, neběží přes AI a přepočítá se po novém commitu; pravidla mají jednotkový test pro každý druh tvrzení
- [ ] #7 Uměle vložený nesouvisející hunk skončí jako nevysvětlený a uměle oslabený test vyvrátí tvrzení beze změny chování; obojí je ověřené ve skrytém okně na smyšleném repozitáři
<!-- AC:END -->
