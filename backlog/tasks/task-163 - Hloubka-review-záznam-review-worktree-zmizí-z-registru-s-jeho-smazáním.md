---
id: TASK-163
title: 'Hloubka review: záznam review worktree zmizí z registru s jeho smazáním'
status: To Do
assignee: []
created_date: '2026-11-20T16:34:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-2
dependencies:
  - TASK-122
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: bug
ordinal: 208300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Záznam review worktree dnes z registru zmizí až při dalším otevření review v repozitáři. Od TASK-122 podle něj hostitel odmítá spouštět brány, takže běžný worktree vytvořený mezitím na stejné cestě by se choval jako statické review a brány by v něm nešly spustit.

### Rozsah

- Nejdřív zjištění ověř v `src/main/azure-devops/review/azure-devops-review-worktree-registry.ts` a `azure-devops-review-worktree-execution.ts`: podle čeho se záznam hledá a jestli ho může trefit jiný worktree.

### Mimo rozsah

- Změny toho, co si vyměňují klient a hostitel.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Po smazání review worktree jeho záznam v registru nezůstane; běžný worktree vytvořený potom na stejné cestě spouští brány bez omezení hloubkou review
- [ ] #2 Test pokrývá smazání přes Orku i worktree smazaný mimo ni; SSH review worktree řeší hostitel, který ho vlastní
<!-- AC:END -->
