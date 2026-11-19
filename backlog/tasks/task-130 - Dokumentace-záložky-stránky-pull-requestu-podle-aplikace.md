---
id: TASK-130
title: 'Dokumentace: záložky stránky pull requestu podle aplikace'
status: To Do
assignee: []
created_date: '2026-11-19T11:45:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
type: task
ordinal: 229600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Dokumentace popisuje na stránce pull requestu tři záložky (Popis a komentáře, Změny, AI review), aplikace má čtyři (Overview, Files, Threads, Drafts). Uživatel rozhodl (decision-12) nechat čtyři a opravit dokumentaci.

### Rozsah

- Soubory v `docs/review-ide/`, které záložky stránky pull requestu zmiňují; najdi je hledáním.
- Popis každé záložky podle skutečného stavu v `src/renderer/src/components/azure-devops-review/AzureDevOpsPullRequestPage.tsx`.

### Mimo rozsah

- Změny kódu.

### Omezení

- Jen dokumentace; texty nesmí slibovat nic, co aplikace nedělá.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dokumentace v docs/review-ide popisuje čtyři záložky stránky pull requestu tak, jak jsou v aplikaci, a nikde nezmiňuje původní tři
- [ ] #2 Každá záložka má jednu až dvě věty o tom, co ukazuje; odkazy na tikety a rozhodnutí sedí
<!-- AC:END -->
