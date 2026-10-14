---
id: TASK-16
title: 'Android: Bezpečně otevírat historii a strukturované relace'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 12:22'
labels: []
dependencies: []
references:
  - mobile/src/session/ai-vault-resume-launch.ts
  - mobile/src/agent-history/use-mobile-agent-history-state.ts
  - src/shared/ai-vault-types.ts
priority: high
type: bug
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Mobilní historie dnes obnovuje záznam spuštěním nového terminálu. U živé strukturované relace tím může vzniknout druhý zapisující proces. Android musí respektovat vlastnictví a stav relace před každým obnovením.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Živá strukturovaná relace se otevře v existující záložce bez nového terminálu a bez druhého zápisu do stejné provider relace.
- [x] #2 Ukončenou podporovanou relaci lze obnovit zvoleným dostupným způsobem; neověřitelné vlastnictví, odpojený SSH host a starší host nevyvolají náhradní spuštění.
- [x] #3 Po restartu, opakovaném klepnutí a přerušení spojení nevznikne duplicitní relace; cílené testy pokryjí všechny tři stavy.

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Rozlišit živou, ukončenou a neověřitelnou relaci podle hostem publikované identity. 2. Pro živou relaci použít bezpečné reveal, pro ukončenou podporovanou relaci nabídnout řízené obnovení. 3. Ověřit restart, opakované otevření a odpojení bez dvojitého zapisujícího procesu.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

History open-plan and operation tests passed (31 focused tests), including live reveal, unverifiable ownership, reconnect and duplicate-tap behavior; mobile typecheck passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Opened live structured sessions by reveal and resumed ended sessions safely without duplicate writers; verified by focused history tests and mobile typecheck.
<!-- SECTION:FINAL_SUMMARY:END -->
