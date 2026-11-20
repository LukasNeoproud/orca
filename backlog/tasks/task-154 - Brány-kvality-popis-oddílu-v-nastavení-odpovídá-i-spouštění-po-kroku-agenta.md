---
id: TASK-154
title: 'Brány kvality: popis oddílu v nastavení odpovídá i spouštění po kroku agenta'
status: To Do
assignee: []
created_date: '2026-11-20T14:17:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies:
  - TASK-138
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: low
type: bug
ordinal: 215500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Popis oddílu Quality Gates v nastavení repozitáře říká, že Orca brány spouští „when you ask“. Se zapnutou smyčkou zpětné vazby (TASK-138) se povinné brány spouštějí i po kroku agenta, takže text uživatele mate.

### Rozsah

- Text popisu v `src/renderer/src/components/quality-gates/RepositoryQualityGatesSection.tsx` a jeho klíč v katalozích `src/renderer/src/i18n/locales/`.

### Mimo rozsah

- Chování bran a smyčky.

### Omezení

- Texty v šesti jazycích; z katalogů měň jen dotčený klíč.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Popis oddílu Quality Gates v nastavení repozitáře neříká, že se brány spouštějí jen na pokyn; platí s vypnutou i zapnutou smyčkou zpětné vazby
- [ ] #2 Text je ve všech šesti jazycích a test komponenty ho pokrývá
<!-- AC:END -->
