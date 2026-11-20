---
id: TASK-162
title: 'Nálezy AI s důkazem: jednorázový příkaz na kartě draftu'
status: To Do
assignee: []
created_date: '2026-11-20T16:20:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies:
  - TASK-161
  - TASK-159
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 208150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Recenzent má u nálezu doloženého jednorázovým příkazem od agenta (TASK-161) vidět přesně, co agent spustil, protože takový příkaz si agent mohl napsat tak, aby selhal.

### Rozsah

- Karta draftu (`src/renderer/src/components/azure-devops-review/AzureDevOpsReviewDraftCard.tsx`) nad zobrazením důkazu z TASK-159.

### Mimo rozsah

- Model, ověření a protokol: TASK-161. Tento tiket nemění, co si vyměňují klient a hostitel.

### Omezení

- Vzhled podle docs/STYLEGUIDE.md, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Karta draftu u důkazu z jednorázového příkazu ukazuje příkaz celý a nezkrácený a říká, že ho zadal agent a že dává nejvýš jistotu pravděpodobné
- [ ] #2 Výstup se v rozhraní ukazuje jako data a jde otevřít celý
- [ ] #3 Komponenta má testy; průchod je ověřený ve skrytém okně na smyšleném repozitáři se snímkem
<!-- AC:END -->
