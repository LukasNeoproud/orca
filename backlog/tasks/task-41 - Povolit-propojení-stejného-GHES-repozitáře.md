---
id: TASK-41
title: 'Povolit propojení stejného GHES repozitáře'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - src/main/project-host-setup-link.ts
priority: medium
type: bug
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Kontrola cizího repozitáře odmítá i shodný Git remote na vlastní GHES doméně, kterou heuristika nerozpozná jako GitHub.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Opravit potvrzený scénář a ověřit cílenou regresní kontrolou.

<!-- AC:END -->

## Implementation Notes

Oprava ověřena testem shodné vlastní GHES domény a odmítnutím cizí identity. Hostové testy a tc:node prošly.
