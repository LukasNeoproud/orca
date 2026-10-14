---
id: TASK-37
title: 'Respektovat odmítnutí otevření strukturované konverzace'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/src/backlog/mobile-backlog-task-launch.ts
  - mobile/src/backlog/mobile-backlog-task-continue.ts
priority: medium
type: bug
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Backlog považuje jakoukoliv úspěšnou RPC obálku `agentSession.reveal` za otevření konverzace. Host ale může vrátit úspěšnou obálku s výsledkem `{ok:false, refusal}`. Pokračování pak falešně hlásí otevřenou konverzaci.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Otevření se hlásí jen při potvrzeném výsledku metody.
- [x] #2 Test pokryje odmítnutí uvnitř úspěšné RPC odpovědi.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Opraveno v pracovním stromu po review změn za posledních 48 hodin; cílené regresní testy a typové kontroly prošly.
<!-- SECTION:NOTES:END -->
