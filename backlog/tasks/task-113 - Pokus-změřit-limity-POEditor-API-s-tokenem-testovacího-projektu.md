---
id: TASK-113
title: 'Pokus: změřit limity POEditor API s tokenem testovacího projektu'
status: Done
assignee: []
created_date: '2026-11-18T22:50:00Z'
updated_date: '2026-11-19T11:41:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-6
dependencies: []
documentation:
  - docs/review-ide/README.md
priority: medium
type: spike
ordinal: 600100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-58 navrhl synchronizaci s POEditorem jen podle dokumentace, která neuvádí strop dávky a v limitech si odporuje. Měření proti živému API zpřesní velikost dávky, rozestup a detekci zastaralé lokální kopie před rozepsáním M6.

### Postup

- Projdi měření sepsaná v decision-6, oddíl „Co by ověřila část B“.
- Pracuj jen s testovacím projektem a tokenem od uživatele; token čti z prostředí nebo ze souboru mimo repozitář.
- Smyšlené klíče a překlady po měření smaž.

### Mimo rozsah

- Integrace do Orky.

### Omezení

- Žádný požadavek na jiný projekt účtu. Před prvním zápisem ověř čtením, že token vidí jen očekávaný projekt, nebo že identifikátor projektu sedí.
- Nepřekračuj limity úmyslně víc než jednou na měřený limit; účet může být sdílený s týmem.

### Čeká na uživatele

1. Token testovacího projektu POEditoru a jeho identifikátor. Bez něj se M6 navrhne s opatrnými výchozími hodnotami (100 položek v dávce, jeden požadavek za sekundu) a smazání na serveru se bude zjišťovat úplným porovnáním seznamů.
2. Jaký tarif POEditoru tým má. Na Free platí návrh beze změny; na placeném se vyšší limit využije až po tomto měření.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Každé z měření v oddílu „Co by ověřila část B“ záznamu decision-6 má výsledek, nebo důvod, proč nešlo provést
- [ ] #2 decision-6 je doplněný o naměřené hodnoty a návrh velikosti dávky a rozestupu odpovídá měření
- [ ] #3 Měření zapisovalo jen do testovacího projektu určeného uživatelem a po sobě uklidilo; žádný jiný projekt účtu se nezměnil
- [ ] #4 Token není v repozitáři, v záznamu ani ve zprávě
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Odpověď uživatele 2026-11-19 (decision-12): token nebude, M6 se plánuje podle dokumentace. Tým má placený tarif Plus.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Zrušeno rozhodnutím uživatele (decision-12): bez tokenu testovacího projektu se neměří. decision-6 platí pro tarif Plus s limity podle dokumentace.
<!-- SECTION:FINAL_SUMMARY:END -->
