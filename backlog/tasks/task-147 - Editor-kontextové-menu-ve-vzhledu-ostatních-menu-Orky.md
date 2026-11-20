---
id: TASK-147
title: 'Editor: kontextové menu ve vzhledu ostatních menu Orky'
status: To Do
assignee: []
created_date: '2026-11-20T09:14:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
priority: low
type: bug
ordinal: 40
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připomínka uživatele z akceptace M1 (2026-11-20): kontextové menu editoru vypadá jinak než kontextová menu Orky.

### Rozsah

- Nejdřív zjisti, jestli jde menu editoru sladit styly přes tokeny z src/renderer/src/assets/main.css. Když by to znamenalo nahradit menu editoru vlastním, nedělej to, zapiš odhad a vrať tiket jako otázku.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Kontextové menu editoru (včetně položek Annotate, Show History for Selection a Open in) má vzhled kontextových menu Orky podle docs/STYLEGUIDE.md ve světlém i tmavém motivu
- [ ] #2 Položky, zkratky a chování menu editoru zůstávají; diff editor a markdown editor se chovají stejně
- [ ] #3 Ověřeno ve skrytém okně se snímkem obou menu vedle sebe
<!-- AC:END -->
