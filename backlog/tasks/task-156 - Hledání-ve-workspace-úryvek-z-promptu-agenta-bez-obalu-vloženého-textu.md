---
id: TASK-156
title: 'Hledání ve workspace: úryvek z promptu agenta bez obalu vloženého textu'
status: To Do
assignee: []
created_date: '2026-11-20T15:01:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies:
  - TASK-153
priority: low
type: bug
ordinal: 215700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-153 vyčistil prompt agenta od obalu vloženého textu u řádku agenta, Activity a názvu tabu. Hledání ve workspace dál pracuje se syrovým promptem a obal ukazuje v nabízených úryvcích.

### Rozsah

- Čtenář hledání (`workspace-tab-agent-metadata.ts`; cestu ověř přes `rg`) zobrazuje úryvek přes `agentStatusPromptDisplayText`. Co se prohledává, se nemění.

### Mimo rozsah

- Úložiště stavu agenta a to, co si vyměňují klient a hostitel.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Úryvky z promptu agenta, které nabízí hledání ve workspace, neukazují značky <pasted_content …>; používají pravidlo ze src/shared/agent-status-prompt-display.ts
- [ ] #2 Test nad src/renderer čtenářem hledání
<!-- AC:END -->
