---
id: TASK-71
title: Rozepsat tikety milníku M4 Analytické jádro
status: To Do
assignee: []
created_date: '2026-11-18T12:45:00Z'
labels:
  - review-ide
  - planovani
  - effort-xhigh
  - ceka-na-uzivatele
milestone: m-4
dependencies:
  - TASK-60
documentation:
  - docs/review-ide/01-integrace.md
  - docs/review-ide/05-funkce.md
priority: medium
type: task
ordinal: 400000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připravit tikety pro model kódu, extraktory, cache a první dva pohledy nad modelem.

### Podklady

- `docs/review-ide/01-integrace.md`, Analytické jádro a tabulka funkcí; `docs/review-ide/05-funkce.md`, oddíly 9 a 11.
- Záznam rozhodnutí a návrh schématu z TASK-60, včetně rozhodnutí uživatele o distribuci extraktorů.

### Poznámky k rozsahu

- Nový typ tabu `code-view`, proces na pozadí přes process host, cache podle repozitáře a SHA, jedno API pro renderer i agenty.
- Pohledy Moduly a vrstvy a Controllery a akce.

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
