---
id: TASK-34
title: 'Zabránit dvojímu Enter ze softwarové klávesnice'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/src/terminal/use-terminal-live-key-press.ts
priority: medium
type: bug
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Softwarový Enter může vyvolat `onKeyPress` i `onSubmitEditing`. Při čekajícím modifikátoru první obsluha odešle kombinaci a spotřebuje modifikátor, druhá pak může odeslat další Enter. Enter musí mít jediného vlastníka v obsluze odeslání.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 `onKeyPress` Enter neodesílá žádné bajty ani nespotřebuje modifikátor.
- [x] #2 `onSubmitEditing` odešle jednu správnou sekvenci.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Opraveno v pracovním stromu po review změn za posledních 48 hodin; cílené regresní testy a typové kontroly prošly.
<!-- SECTION:NOTES:END -->
