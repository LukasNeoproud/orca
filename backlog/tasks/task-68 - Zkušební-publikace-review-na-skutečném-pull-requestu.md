---
id: TASK-68
title: Zkušební publikace review na skutečném pull requestu
status: To Do
assignee: []
created_date: '2026-11-18T12:44:00Z'
updated_date: '2026-11-18T13:22:00Z'
labels:
  - review-ide
  - ceka-na-uzivatele
  - effort-high
milestone: m-1
dependencies:
  - TASK-67
documentation:
  - docs/review-ide/01-integrace.md
priority: medium
type: task
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Doložit, že publikace z Orky do Azure DevOps funguje proti skutečné organizaci. Publikuje vždy uživatel.

### Postup

- Agent připraví v Orca Dev drafty a napíše uživateli přesný postup po krocích.
- Uživatel publikuje a potvrdí výsledek; agent ho ověří čtením.

### Čeká na uživatele

Určit pull request, na kterém smí proběhnout zkušební publikace, a provést ji.

### Omezení

- Do tiketu, kódu ani dokumentace nepiš názvy organizací, repozitářů, čísla ani texty pull requestů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Uživatel publikoval z Orca Dev draft komentáře, odpověď ve vlákně a hlas na pull requestu, který sám určil
- [ ] #2 Publikované položky v Azure DevOps odpovídají draftům: text, soubor, řádek a vlákno
- [ ] #3 Zbylá akceptační kritéria TASK-51 mají stav ověřeno, selhalo nebo neověřeno s důvodem
- [ ] #4 Každá nalezená chyba má vlastní tiket
- [ ] #5 Agent do Azure DevOps nic nezapsal
<!-- AC:END -->
