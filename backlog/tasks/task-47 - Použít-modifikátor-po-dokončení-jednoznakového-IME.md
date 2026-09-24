---
id: TASK-47
title: 'Použít modifikátor po dokončení jednoznakového IME'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/src/terminal/use-terminal-live-input-commit.ts
priority: medium
type: bug
ordinal: 47000
---

## Description

Při dokončení kompozice se stejným textem se porovnával vstup s preedit místo již odeslaného prefixu. Alt+c se proto odeslal jako obyčejné c. Regresní test chybu reprodukoval.

## Acceptance Criteria

- [x] Opravit scénář a ověřit regresním testem.

## Implementation Notes

Nový regresní test před opravou selhal (obyčejné c místo Alt+c). Po opravě prochází s prázdným i již odeslaným prefixem. Mobilní hook/config sada: 40 testů prošlo.
