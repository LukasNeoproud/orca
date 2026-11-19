---
id: TASK-130
title: 'Dokumentace: záložky stránky pull requestu podle aplikace'
status: Done
assignee: []
created_date: '2026-11-19T11:45:00Z'
updated_date: '2026-11-19T11:59:00Z'
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
- [x] #1 Dokumentace v docs/review-ide popisuje čtyři záložky stránky pull requestu tak, jak jsou v aplikaci, a nikde nezmiňuje původní tři
- [x] #2 Každá záložka má jednu až dvě věty o tom, co ukazuje; odkazy na tikety a rozhodnutí sedí
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: jediný výskyt tří záložek je docs/review-ide/05-funkce.md, oddíl 5 (ř. 127-130). Přepsat na Overview, Files, Threads, Drafts podle AzureDevOpsPullRequestPage.tsx; zmínit podmíněnou záložku Snapshots (oddíl 10) a výchozí záložku. Kód neměnit.

Hotovo: 05-funkce.md, oddíl 5 popisuje Overview, Files, Threads, Drafts podle AzureDevOpsPullRequestPage.tsx, výchozí záložku a podmíněnou záložku Snapshots; odkazy decision-12 a TASK-126. Jinde v docs/review-ide se tři záložky nezmiňovaly. Mimo rozsah zůstaly nepřesnosti hlavičky a akcí karty draftu (navazující tiket).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
docs/review-ide/05-funkce.md, oddíl 5, popisuje čtyři záložky stránky pull requestu podle aplikace (Overview, Files, Threads, Drafts), výchozí záložku a podmíněnou záložku Snapshots. Zmínky o hlavičce se stavem kontrol a revieweři a o odpovědi AI u nálezu zůstávají jako cíl: dodají je TASK-99 a TASK-107.
<!-- SECTION:FINAL_SUMMARY:END -->
