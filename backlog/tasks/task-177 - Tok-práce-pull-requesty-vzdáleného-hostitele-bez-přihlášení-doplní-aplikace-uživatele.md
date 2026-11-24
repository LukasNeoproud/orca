---
id: TASK-177
title: >-
  Tok práce: pull requesty vzdáleného hostitele bez přihlášení doplní aplikace
  uživatele
status: To Do
assignee: []
created_date: '2026-11-24T10:38:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-9
dependencies:
  - TASK-171
documentation:
  - docs/review-ide/10-tok-prace.md
priority: low
type: feature
ordinal: 161000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Repozitář na vzdáleném stroji, kde není připojený poskytovatel pull requestů, má dnes fázi neznámou. Uživatel rozhodl (decision-18), že aplikace, u které sedí, smí taková fakta doplnit vlastním přihlášením.

### Rozsah

- Při spojování seznamů (TASK-171) doplnit fakta o pull requestu jednotkám s důvodem `not-connected` z vlastní obnovy faktů (TASK-167).
- Výjimku zapsat k pravidlu `credential` v `src/shared/host-operation-ownership.ts` a do dokumentace.

### Mimo rozsah

- Jakýkoli zápis navenek. Přihlášení se na vzdálený stroj neposílá.

### Omezení

- Token neopouští počítač uživatele; vzdálený hostitel dostane nejvýš výsledek, ne přihlášení.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Jednotka z hostitele, který hlásí pull request jako not-connected, dostane fakta o pull requestu z přihlášení aplikace uživatele a má fázi
- [ ] #2 Hostitel s vlastním přihlášením se nedoplňuje; test
- [ ] #3 Přehled u doplněné jednotky říká, čím přihlášením byla fakta přečtena
- [ ] #4 Test kompatibility se starším hostitelem a starším klientem
<!-- AC:END -->
