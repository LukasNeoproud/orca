---
id: TASK-158
title: 'Brány kvality: e2e nastavení bran padá na kroku Out of date: another commit'
status: To Do
assignee: []
created_date: '2026-11-20T15:37:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: bug
ordinal: 215900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Worker TASK-148 spustil `tests/e2e/quality-gates-settings.spec.ts` a dvakrát selhal na kroku po commitu: brána dál ukazuje „Out of date: files changed“ místo „another commit“. Od TASK-128 ten spec nikdo nespouštěl. Buď je to chyba testu, nebo uživatel po ručním obnovení vidí starý stav.

### Rozsah

- Podezřelé je sdílené čtení stavu stromu z TASK-141 (jedno čtení pro všechny tazatele během čtení a 250 ms po něm) v `src/main/quality-gates`; ověř, než cokoli změníš.

### Mimo rozsah

- Změny toho, co si vyměňují klient a hostitel.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Zjištěno a zapsáno, jestli tests/e2e/quality-gates-settings.spec.ts padá na čistém HEAD a od kterého commitu
- [ ] #2 Po commitu ve worktree ukáže ruční Read the results again u brány Out of date: another commit; spec prochází
- [ ] #3 Když je příčinou sdílené čtení stavu stromu, ruční obnovení ho obchází a má test
<!-- AC:END -->
