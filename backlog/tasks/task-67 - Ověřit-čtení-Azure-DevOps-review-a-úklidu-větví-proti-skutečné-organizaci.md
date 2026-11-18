---
id: TASK-67
title: Ověřit čtení Azure DevOps review a úklidu větví proti skutečné organizaci
status: To Do
assignee: []
created_date: '2026-11-18T12:43:00Z'
updated_date: '2026-11-18T12:44:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/01-integrace.md
priority: high
type: task
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Review z TASK-51 a dohledání dokončených pull requestů pro úklid větví jsou ověřené jen testy. Než na nich začne stavět M2, musí být vidět, že čtení funguje proti skutečné organizaci. Zkušební publikaci řeší navazující tiket.

### Postup

- Jen čtením: projdi v Orca Dev seznam, detail, vlákna, diff a review worktree na existujícím pull requestu a dotaz v `src/main/azure-devops/completed-pull-request-heads.ts`.
- Orca Dev ovládej ve skrytém okně podle AGENTS.md; okno uživatele neber.

### Mimo rozsah

- Publikace draftů, odpovědí a hlasů.

### Omezení

- Do tiketu, kódu ani dokumentace nepiš názvy organizací, repozitářů, čísla ani texty pull requestů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Každé akceptační kritérium TASK-51, které jde ověřit čtením, má stav ověřeno, selhalo nebo neověřeno s důvodem
- [ ] #2 Seznam, detail, vlákna, diff souboru a review worktree jsou ověřené proti skutečnému pull requestu
- [ ] #3 Dohledání dokončených pull requestů pro úklid sloučených větví je ověřené proti skutečnému repozitáři
- [ ] #4 Každá nalezená chyba je opravená v tomto tiketu, nebo má vlastní tiket
- [ ] #5 Agent do Azure DevOps nic nezapsal
<!-- AC:END -->
