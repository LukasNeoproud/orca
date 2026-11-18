---
id: TASK-72
title: Rozepsat tikety milníku M5 Pohledy nad modelem
status: To Do
assignee: []
created_date: '2026-11-18T12:45:00Z'
updated_date: '2026-11-18T18:46:00Z'
labels:
  - review-ide
  - planovani
  - effort-xhigh
  - ceka-na-uzivatele
milestone: m-5
dependencies:
  - TASK-71
documentation:
  - docs/review-ide/05-funkce.md
priority: medium
type: task
ordinal: 500000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připravit tikety pro navigační graf, Funkce napříč platformami a Zdraví kódu.

### Podklady

- `docs/review-ide/05-funkce.md`, oddíly 8, 12 a 15; `docs/review-ide/07-funkce-z-ide.md`, bod 11.
- Model kódu tak, jak ho M4 skutečně dodal. Plánuj až ve chvíli, kdy je M4 z větší části hotový.

### Poznámky k rozsahu

- Funkce napříč platformami potřebují reference z M7; navrhni, co jde dřív nad jedním repozitářem.

Tikety piš podle pravidel ve skillu `review-ide` (soubor `tikety.md`). Výchozí body v kódu ověř v aktuálním stromu, dokumentace vznikla nad starším commitem.

### Čeká na uživatele

Zařazení milníku do další vlny. Pořadí milníků po první vlně (M0 až M2) určuje uživatel podle výsledků pokusů; koordinátor mu ho předloží s doporučením.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Každá funkce milníku z dokumentace má tiket, nebo je výslovně odložená s důvodem v poznámkách tohoto tiketu
- [ ] #2 Každý tiket má odkaz na oddíl dokumentace, cíl, rozsah, mimo rozsah, výchozí body v kódu ověřené v aktuálním stromu, omezení, pozorovatelná akceptační kritéria a štítek effort
- [ ] #3 Každý tiket zvládne jeden worker v jednom běhu; větší celky jsou rozdělené na svislé řezy, které jdou samostatně ověřit
- [ ] #4 Závislosti jsou jen tam, kde je skutečné pořadí, a netvoří cyklus
- [ ] #5 Otázky pro uživatele k rozsahu, placeným službám a chování navenek jsou v poznámkách tiketu, každá s možnostmi a doporučením
- [ ] #6 Popis milníku v backlog/milestones odpovídá naplánovanému rozsahu
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Zbytek po TASK-64 (2026-11-18) pro plán M5: snapshoty na stránce pull requestu GitHubu a GitLabu (stránka musí nejdřív vracet obsah obrázků); nastavitelná cesta snapshotů (Roborazzi s vlastní výstupní cestou se nepozná, vzor src/screenshots může zachytit i běžné screenshoty); očekávané a nečekané změny, počet nezměněných, vazba oblasti na celek, příčina podle AI, Přijmout jako nový základ.
<!-- SECTION:NOTES:END -->
