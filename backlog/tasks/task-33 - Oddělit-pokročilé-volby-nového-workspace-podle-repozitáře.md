---
id: TASK-33
title: 'Oddělit pokročilé volby nového workspace podle repozitáře'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/src/components/use-new-workspace-advanced-options.ts
priority: medium
type: bug
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Při přepnutí projektu ve formuláři nového workspace zůstává `baseRef` a zobrazovaný název z předchozího repozitáře. Vytvoření workspace pak může selhat nebo použít jinou větev se stejným názvem. Hodnoty musí být svázané s vybraným repozitářem.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Přepnutí repozitáře nepřenese `baseRef` ani zobrazovaný název do jiného repozitáře.
- [x] #2 Test pokryje přepnutí po zadání obou polí.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Opraveno v pracovním stromu po review změn za posledních 48 hodin; cílené regresní testy a typové kontroly prošly.
<!-- SECTION:NOTES:END -->
