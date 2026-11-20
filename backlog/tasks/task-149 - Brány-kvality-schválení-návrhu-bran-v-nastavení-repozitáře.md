---
id: TASK-149
title: 'Brány kvality: schválení návrhu bran v nastavení repozitáře'
status: To Do
assignee: []
created_date: '2026-11-20T09:41:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-2
dependencies:
  - TASK-148
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 207900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Návrh bran od agenta z TASK-148 má uživatel vidět a vyřídit v nastavení repozitáře.

### Rozsah

- Zobrazení a vyřízení návrhu u definic bran v nastavení repozitáře; upozornění v oddílu Local gates.

### Mimo rozsah

- Model, úložiště a protokol návrhu: TASK-148. Tento tiket nemění, co si vyměňují klient a hostitel.

### Omezení

- Vzhled podle docs/STYLEGUIDE.md, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nastavení repozitáře ukazuje čekající návrh bran jako rozdíl proti platným branám: nové, změněné a odebrané brány s příkazem a zdůvodněním agenta
- [ ] #2 Uživatel návrh přijme celý, po položkách, nebo zahodí; přijatou položku jde před přijetím upravit
- [ ] #3 Oddíl Local gates v panelu Checks upozorní, že čeká návrh, a odkáže na něj
- [ ] #4 U hostitele bez schopnosti návrhů se nic z toho neukazuje; SSH i folder workspace fungují
- [ ] #5 Komponenty mají testy; průchod návrh, přijetí části a zahození je ověřený ve skrytém okně se snímkem
<!-- AC:END -->
