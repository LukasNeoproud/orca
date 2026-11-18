---
id: TASK-57
title: 'Pokus: agenti ve složce se symbolickými odkazy na worktrees'
status: To Do
assignee: []
created_date: '2026-11-18T12:42:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-0
dependencies: []
documentation:
  - docs/review-ide/04-projekty-a-funkce.md
  - docs/review-ide/README.md
priority: medium
type: spike
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Rozhodnout, jak agent uvidí vlastní platformu i reference ostatních platforem v jedné Funkci: přes složku se symbolickými odkazy (`android/`, `ios/`, `api/`), nebo přes seznam cest předaný v kontextu.

### Postup

- Vytvoř mimo repozitář tři malé smyšlené git repozitáře, ke každému worktree, a složku s odkazy na ně. Firemní kód není potřeba.
- V té složce spusť agenty s krátkým zadáním: přečíst soubor v jednom odkazu, upravit soubor v druhém, najít řetězec napříč všemi, zjistit stav gitu. Zadání drž krátká, běží na předplatném uživatele.
- Zápisy sleduj i přes hooky Orky: výchozí bod `src/shared/agent-hook-listener` a `src/main/agent-hooks`.
- Variantu se seznamem cest vyzkoušej přes přidané adresáře agenta (u Claude Code `--add-dir`).

### Mimo rozsah

- Implementace Funkcí a referencí.

### Omezení

- Pravidlo z AGENTS.md o obrazovkách agentů: co agent vypsal, dokládej zachyceným přepisem, ne zpaměti.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Záznam rozhodnutí uvádí pro Claude Code a Codex, zda přes symbolický odkaz funguje čtení a úprava souborů, hledání, git status a commit ve správném repozitáři
- [ ] #2 Záznam uvádí, jakou cestu hlásí hooky agenta při zápisu přes odkaz a zda Orca zápis přiřadí správnému worktree
- [ ] #3 Záznam porovnává variantu se složkou odkazů s variantou, kdy agent dostane seznam cest referencí, včetně chování na Windows
- [ ] #4 Záznam končí volbou varianty pro Funkce a seznamem úprav, které Orca kvůli ní potřebuje
- [ ] #5 Otevřená otázka v docs/review-ide/README.md je odškrtnutá s odkazem na záznam
<!-- AC:END -->
