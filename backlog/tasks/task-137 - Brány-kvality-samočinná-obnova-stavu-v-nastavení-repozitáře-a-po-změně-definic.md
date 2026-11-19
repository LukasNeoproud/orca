---
id: TASK-137
title: >-
  Brány kvality: samočinná obnova stavu v nastavení repozitáře a po změně
  definic
status: To Do
assignee: []
created_date: '2026-11-19T21:12:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies:
  - TASK-86
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: low
type: feature
ordinal: 801000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Oddíl Local gates se po TASK-86 obnovuje sám, ale stav v nastavení repozitáře ne a změna definic bran se do otevřeného panelu nepromítne.

### Rozsah

- V nastavení repozitáře zapnout odběr v hooku use-quality-gate-status (volba watch).
- Po uložení definic bran oznámit změnu odběratelům přes stávající signál changed; žádný nový rámec proudu.

### Mimo rozsah

- Brány pro folder workspace skupiny projektů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Stav bran v nastavení repozitáře se po commitu a po doběhnutí brány obnoví sám přes odběr z TASK-86
- [ ] #2 Úprava definic bran se promítne do otevřeného oddílu Local gates bez ruční obnovy, i u vzdáleného repozitáře
- [ ] #3 Starší hostitel bez odběru se dál dotazuje v intervalu; test to dokládá
<!-- AC:END -->
