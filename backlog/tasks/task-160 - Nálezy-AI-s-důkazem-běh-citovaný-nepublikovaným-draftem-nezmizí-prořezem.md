---
id: TASK-160
title: 'Nálezy AI s důkazem: běh citovaný nepublikovaným draftem nezmizí prořezem'
status: To Do
assignee: []
created_date: '2026-11-20T16:19:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-2
dependencies:
  - TASK-88
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: bug
ordinal: 208200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Úložiště běhů bran drží pět dokončených běhů na bránu a worktree. Když agent nebo uživatel po vytvoření nálezu bránu pustí vícekrát, záznam citovaný důkazem z TASK-88 se vytlačí a nález ztratí jistotu „ověřeno důkazem“, i když se nic nezměnilo.

### Rozsah

- Prořez v úložišti běhů (`src/main/quality-gates`) a odkazy z draftů review (`src/main/azure-devops/review/azure-devops-review-gate-run-evidence.ts`).

### Mimo rozsah

- Změny toho, co si vyměňují klient a hostitel.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Běh brány, na který odkazuje důkaz nepublikovaného draftu, úložiště běhů neprořeže, dokud draft existuje; nález kvůli pozdějším běhům nespadne na nejisté s důvodem run-not-found
- [ ] #2 Počet takto držených běhů je omezený a po publikaci nebo smazání draftu se běh prořeže běžně
- [ ] #3 Testy pokrývají držení, uvolnění a strop; formát souboru běhů čte i starší sestavení
<!-- AC:END -->
