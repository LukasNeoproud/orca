---
id: TASK-165
title: 'Brány kvality: odebrání brány v návrhu v nastavení repozitáře'
status: To Do
assignee: []
created_date: '2026-11-24T07:49:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies:
  - TASK-164
  - TASK-149
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 207950
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Agent smí navrhnout odebrání brány (decision-14, TASK-164). Uživatel ho má v nastavení repozitáře vidět stejně zřetelně jako změnu, protože odebráním se kontrola práce agenta oslabuje.

### Rozsah

- Blok návrhu z TASK-149: `RepositoryQualityGateProposal.tsx`, `QualityGateProposalItemCard.tsx`, `quality-gate-proposal-view.ts` v `src/renderer/src/components/quality-gates/`.

### Mimo rozsah

- Model, protokol a CLI: TASK-164. Tento tiket nemění, co si vyměňují klient a hostitel.

### Omezení

- Vzhled podle docs/STYLEGUIDE.md, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Návrh v nastavení repozitáře ukazuje odebranou bránu zřetelně odlišenou od nové a změněné, s jejím dosavadním příkazem a zdůvodněním agenta
- [ ] #2 Položku odebrání jde přijmout nebo zahodit samostatně; Accept all ji zahrne a text tlačítka nebo potvrzení řekne, kolik bran se odebere
- [ ] #3 U hostitele bez schopnosti odebrání se nic z toho neukazuje; SSH i folder workspace fungují
- [ ] #4 Komponenty mají testy; průchod návrh s odebráním, přijetí a zahození je ověřený ve skrytém okně se snímkem
<!-- AC:END -->
