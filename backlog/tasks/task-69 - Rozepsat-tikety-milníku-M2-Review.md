---
id: TASK-69
title: Rozepsat tikety milníku M2 Review
status: To Do
assignee: []
created_date: '2026-11-18T12:44:00Z'
labels:
  - review-ide
  - planovani
  - effort-xhigh
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: task
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připravit tikety pro milník Review tak, aby na ně šlo navázat hned po M1.

### Podklady

- `docs/review-ide/05-funkce.md`, oddíly 5 až 7; `docs/review-ide/06-ai-a-review.md`, body 3, 7 a 8 jako první, pak 5 a 6.
- Stav TASK-51 a výsledek TASK-67.
- TASK-52 (revize změn s ověřenými tvrzeními) řeší stejný problém jako Diff po celcích a Nálezy s důkazem. Navrhni jedno řešení: co z TASK-52 se převezme (klíč hunku, manifest, úrovně důvěry) a zda TASK-52 zůstane, rozdělí se, nebo zanikne.
- Kód: `src/renderer/src/components/azure-devops-review`, `src/main/azure-devops/review`, `src/renderer/src/components/editor/combined-diff`, `src/shared/agent-hook-listener`.

### Poznámky k rozsahu

- Druhy důkazu a brány kvality, které potřebují language servery nebo analytické jádro, odlož do M3 a M4; v M2 jen to, co jde bez nich (lint, build, testy, výstup příkazu).
- Hlasování při publikaci: nejdřív ověř, co už stránka pull requestu umí.

Tikety piš podle pravidel ve skillu `review-ide` (soubor `tikety.md`). Výchozí body v kódu ověř v aktuálním stromu, dokumentace vznikla nad starším commitem.
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
