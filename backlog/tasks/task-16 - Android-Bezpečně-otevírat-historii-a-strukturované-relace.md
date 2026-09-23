---
id: TASK-16
title: 'Android: Bezpečně otevírat historii a strukturované relace'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 11:49'
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
- [ ] #1 Živá strukturovaná relace se otevře v existující záložce bez nového terminálu a bez druhého zápisu do stejné provider relace.
- [ ] #2 Ukončenou podporovanou relaci lze obnovit zvoleným dostupným způsobem; neověřitelné vlastnictví, odpojený SSH host a starší host nevyvolají náhradní spuštění.
- [ ] #3 Po restartu, opakovaném klepnutí a přerušení spojení nevznikne duplicitní relace; cílené testy pokryjí všechny tři stavy.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rozlišit živou, ukončenou a neověřitelnou relaci podle hostem publikované identity. 2. Pro živou relaci použít bezpečné reveal, pro ukončenou podporovanou relaci nabídnout řízené obnovení. 3. Ověřit restart, opakované otevření a odpojení bez dvojitého zapisujícího procesu.
<!-- SECTION:PLAN:END -->
