---
id: TASK-155
title: 'Brány kvality: nastavení bran ve webovém klientovi se neukládá potichu'
status: To Do
assignee: []
created_date: '2026-11-20T14:48:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-2
dependencies:
  - TASK-151
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: bug
ordinal: 215600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Worker TASK-151 podle čtení kódu zjistil, že webový klient zapisuje nastavení repozitáře přes `repo.update`, který pole bran zahazuje, a oddíl Quality Gates se přitom tváří jako editovatelný. Uživatel by tak nastavil bránu, která se neuloží. Za běhu to ověřené není.

### Rozsah

- Nejdřív zjištění ověř: kudy webový klient píše nastavení repozitáře a co vrací `useRepositoryQualityGateSettingsWriter` (`src/renderer/src/components/quality-gates/use-repository-quality-gate-settings-writer.ts`) pro jeho hostitele.
- Když se potvrdí, veď zápis metodou `qualityGates.setRepositorySettings` z TASK-151, nebo oddíl ukaž jen ke čtení.

### Mimo rozsah

- Nové metody a změny toho, koho hostitel k zápisu pustí (decision-11, oddíl Zápis na dálku).

### Omezení

- Když se zjištění nepotvrdí, tiket končí záznamem v poznámkách a testem, který současné chování drží.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Ve webovém klientovi se brány a smyčka repozitáře buď uloží na hostitele cestou z TASK-151, nebo je oddíl jen ke čtení; nikdy se netváří jako uložené, když je hostitel zahodil
- [ ] #2 Chování je ověřené za běhu webového klienta nebo testem nad jeho cestou zápisu a zapsané v decision-11
<!-- AC:END -->
