---
id: TASK-39
title: 'Najít starší navázanou konverzaci Backlogu'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/src/backlog/mobile-backlog-task-continue.ts
priority: medium
type: bug
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Pokračování v navázané konverzaci po zavření tabu hledá pouze mezi posledními 500 historickými relacemi. Starší stále existující relaci pak chybně označí za nedostupnou. Hledání musí pokrýt celou historii v rámci cílového workspace.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Host načte úplnou historii omezenou cestou cílového workspace.
- [x] #2 Test kontroluje parametry dotazu.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Opraveno v pracovním stromu po review změn za posledních 48 hodin; cílené regresní testy a typové kontroly prošly.
<!-- SECTION:NOTES:END -->
