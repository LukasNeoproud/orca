---
id: TASK-35
title: 'Srovnat live input po modifikované extra klávese'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/src/terminal/use-terminal-live-accessory-input-commit.ts
  - mobile/src/session/MobileTerminalAccessoryRows.tsx
priority: medium
type: bug
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Modifikovaný Backspace/Delete odesílá řídicí bajty mimo běžnou úpravu zachycovacího pole. Jeho starý text pak může dál řídit zrcadlení a následné editace. Před odesláním modifikované extra klávesy je třeba dokončit předchozí text a začít nové zachycení.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Po napsaném textu se modifikovaná klávesa odešle ve správném pořadí a zachycovací pole se vyprázdní.
- [x] #2 Další znak se odešle jako nový vstup bez oprav starého textu.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Opraveno v pracovním stromu po review změn za posledních 48 hodin; cílené regresní testy a typové kontroly prošly.
<!-- SECTION:NOTES:END -->
