---
id: TASK-46
title: 'Respektovat vlastníka vzdálených přechodů kontextu'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - src/renderer/src/components/agent-session-continuation/use-agent-context-owner-capability.ts
priority: medium
type: bug
ordinal: 46000
---

## Description

Spárovaný klient s lokálním nastavením off nepřevezme požadavek schválený hostem s nastavením all.

## Acceptance Criteria

- [x] Opravit scénář a ověřit regresním testem.

## Implementation Notes

Spárované panely používají existující cachovanou capability vlastníka runtime; povolení konkrétní akce dál kontroluje host. Bez nových RPC a bez opakovaných settings.get. Testy pokrývají host s podporou a klient off, host bez podpory a klient on i lokální nastavení. Cílené testy a tc:web prošly.
