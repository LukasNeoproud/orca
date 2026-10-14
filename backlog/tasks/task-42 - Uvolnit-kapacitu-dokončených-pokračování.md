---
id: TASK-42
title: 'Uvolnit kapacitu dokončených pokračování'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - src/main/codex/codex-continuation-store.ts
priority: medium
type: bug
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Trvalý limit 512 záznamů zahrnuje dokončené a zastaralé kandidáty. Po jeho dosažení již nejde vytvořit další pokračování ani po restartu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Opravit potvrzený scénář a ověřit cílenou regresní kontrolou.

<!-- AC:END -->

## Implementation Notes

Po ověření novějšího checkpointu se starší dokončené záznamy odstraní; rozběhnutá příprava zůstane. Staré stale záznamy se odstraní i při načtení formátu v1. Testy pokrývají 513 postupných checkpointů, migraci plného starého úložiště a zachování aktuální idempotence. Limit 512 aktuálních nebo nevyřešených kandidátů zůstává jako kapacitní ochrana. Cílených 11 testů a tc:node prošlo.
