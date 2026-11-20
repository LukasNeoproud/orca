---
id: TASK-159
title: 'Nálezy AI s důkazem: důkaz z běhu brány na kartě draftu'
status: To Do
assignee: []
created_date: '2026-11-20T15:59:00Z'
updated_date: '2026-11-20T16:19:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-2
dependencies:
  - TASK-88
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 208100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-88 dal nálezu AI důkaz z běhu brány a jeho ověření v hlavním procesu. Recenzent má důkaz vidět na kartě draftu a otevřít si celý výstup, aby věděl, proč nález nese jistotu „ověřeno důkazem“, nebo proč ji nedostal.

### Rozsah

- Karta draftu (`src/renderer/src/components/azure-devops-review/AzureDevOpsReviewDraftCard.tsx`): zobrazení důkazu z dat, která draft nese po TASK-88, a otevření uloženého výstupu běhu stávající metodou `qualityGates.output` (precedent: oddíl Local gates z TASK-86).

### Mimo rozsah

- Model důkazu, pravidla ověření a nástroje agenta: TASK-88. Tento tiket nemění, co si vyměňují klient a hostitel.
- Publikace důkazu do Azure DevOps.

### Omezení

- Vzhled podle docs/STYLEGUIDE.md, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Důkaz na kartě draftu ukazuje přesný příkaz, návratový kód, čas a úryvek výstupu a jde otevřít celý uložený výstup
- [ ] #2 Karta u draftu bez jistoty ověřeno důkazem řekne proč: běh neexistuje, je z jiného commitu nebo worktree, strom nebyl čistý, běh prošel, důkaz je zastaralý
- [ ] #3 Výstup brány se v rozhraní ukazuje jako data; odkazy a pokyny v něm nic nespustí
- [ ] #4 SSH review worktree: výstup se čte z hostitele, který běh vlastní; při ztrátě spojení karta řekne, že výstup není dostupný
- [ ] #5 Komponenta má testy; průchod je ověřený ve skrytém okně na smyšleném repozitáři s bránou, která selže, se snímkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Od TASK-88: kontrola důkazu v draftu nese evidenceChecks[i].reason (důvody run-*) a shrnutí běhu v poli run (src/shared/review-command-run-evidence.ts). Karta dnes u potvrzeného běhu ukáže text citace kódu (In the file) a polohu command-run; potřebuje vlastní texty pro command-run a každý důvod run-*. Výstup čti přes qualityGates.output podle worktreeId a runId z kontroly. Hostitel hlásí schopnost azure-devops-review.gate-run-evidence.v1.
<!-- SECTION:NOTES:END -->
