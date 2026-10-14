---
id: TASK-44
title: 'Dokončit převzetí terminálu po zrušení efektu'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - src/renderer/src/components/terminal-pane/use-agent-context-transition.ts
priority: medium
type: bug
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Zrušení efektu během claim RPC zahodí úspěšně převzatou nabídku. Host čeká na dokončení a přejde do unconfirmed, přestože restart nezačal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Opravit potvrzený scénář a ověřit cílenou regresní kontrolou.

<!-- AC:END -->

## Implementation Notes

Test ruší efekt během čekajícího claim RPC. Host dostane failed completion a restart se nespustí. Test a tc:web prošly.
