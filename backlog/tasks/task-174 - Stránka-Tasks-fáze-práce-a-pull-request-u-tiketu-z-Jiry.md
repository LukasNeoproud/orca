---
id: TASK-174
title: 'Stránka Tasks: fáze práce a pull request u tiketu z Jiry'
status: To Do
assignee: []
created_date: '2026-11-24T09:05:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-9
dependencies:
  - TASK-171
documentation:
  - docs/review-ide/10-tok-prace.md
priority: medium
type: feature
ordinal: 158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Uživatel chce u tiketu z Jiry vidět, jak daleko je práce na něm a který pull request k němu patří, bez přepínání do přehledu.

### Rozsah

- Řádek a detail tiketu z Jiry na stránce Tasks (`src/renderer/src/components/task-page/`, soubory `task-page-jira-*`, `JiraIssueWorkspace.tsx`): fáze práce z jednotky, odkaz na pull request a workspace, stav vydání.

### Mimo rozsah

- Ostatní zdroje úkolů (GitHub, GitLab, Linear) a zápis do Jiry.
- Data: TASK-171. Tento tiket nemění, co si vyměňují klient a hostitel.

### Omezení

- Vzhled podle docs/STYLEGUIDE.md, texty v šesti jazycích.
- Stránka Tasks je kód upstreamu; zásah drž malý a v samostatných souborech.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tiket z Jiry, ke kterému existuje jednotka práce, ukazuje na stránce Tasks její fázi, odkaz na pull request a workspace a stav vydání
- [ ] #2 Tiket bez jednotky práce vypadá jako dnes; více pull requestů k jednomu tiketu se ukáže všechny
- [ ] #3 Hostitel bez schopnosti toku práce neukazuje nic navíc
- [ ] #4 Komponenty mají testy; zobrazení je ověřené ve skrytém okně se smyšlenými tikety, se snímkem
<!-- AC:END -->
