---
id: TASK-139
title: >-
  Brány kvality: ověřit smyčku zpětné vazby se skutečným Claude Code lokálně a
  přes SSH
status: To Do
assignee: []
created_date: '2026-11-19T22:05:00Z'
labels:
  - review-ide
  - effort-high
  - ceka-na-uzivatele
milestone: m-2
dependencies:
  - TASK-87
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: task
ordinal: 207600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Smyčka z TASK-87 je ověřená jen se smyšleným agentem a nad náhradou běhového prostředí. Než ji uživatel zapne u skutečné práce, má projít se skutečným agentem.

### Rozsah

- Krátká zkušební spuštění Claude Code nad smyšleným repozitářem s bránou, která selže, lokálně a přes SSH.
- Opravy doručení podle zjištění; nová pravidla nad obrazovkou jen proti zachycenému přepisu.

### Čeká na uživatele

Povolení ke krátkým zkušebním spuštěním skutečného Claude Code se zapnutou smyčkou (dosavadní povolení platí jen pro TASK-57) a dostupný SSH hostitel pro zkoušku.

### Omezení

- Codex nespouštět.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Skutečný terminálový Claude Code se zapnutou smyčkou dostane po dokončeném kroku zprávu o selhané bráně a po opravě smyčka skončí stavem prošlo; průběh je zapsaný
- [ ] #2 Totéž v SSH worktree; stav vlastní vzdálený hostitel
- [ ] #3 Strukturovaný chat lokálně dostane zprávu jako kartu od Quality gates
- [ ] #4 Rozepsaný vstup uživatele v terminálu zprávu zadrží; chování po hookovém done na skutečném terminálu odpovídá pravidlu tui-idle
- [ ] #5 Codex je posouzený jen podle dokumentace a je to zapsané
<!-- AC:END -->
