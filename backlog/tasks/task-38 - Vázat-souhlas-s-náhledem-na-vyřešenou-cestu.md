---
id: TASK-38
title: 'Vázat souhlas s náhledem na vyřešenou cestu'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/src/files/use-mobile-contextual-file-preview.ts
priority: medium
type: bug
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Souhlas s náhledem souboru mimo workspace je uložen podle původního textu odkazu. Pokud se odkaz po Reload vyřeší na jiný soubor, načte se bez nového souhlasu. Souhlas musí platit pro konkrétní vyřešenou cestu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Změna vyřešené externí cesty znovu vyžádá souhlas.
- [x] #2 Znovunačtení téže externí cesty souhlas zachová.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Opraveno v pracovním stromu po review změn za posledních 48 hodin; cílené regresní testy a typové kontroly prošly.
<!-- SECTION:NOTES:END -->
