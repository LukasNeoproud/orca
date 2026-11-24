---
id: TASK-178
title: 'Tok práce: autor a revieweři pull requestu na GitHubu a GitLabu'
status: To Do
assignee: []
created_date: '2026-11-24T10:38:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-9
dependencies:
  - TASK-171
documentation:
  - docs/review-ide/10-tok-prace.md
priority: low
type: feature
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Mimo Azure DevOps dnes fakta neříkají, jestli pull request založil uživatel, ani kdo je reviewer (TASK-167). Checkout cizí větve s pull requestem se tak může počítat jako práce uživatele.

### Rozsah

- Doplnit do `HostedReviewInfo` autora vůči přihlášenému uživateli a, kde to stávající dotaz dává levně, reviewery; převod v `src/shared/work-flow/hosted-review-work-facts.ts`.

### Omezení

- Žádné nové dotazy na pull request navíc; šetři limit `gh`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pull request cizího autora na GitHubu a GitLabu jednotku práce nezakládá; test
- [ ] #2 Co poskytovatel nedává, zůstává neznámé; test
- [ ] #3 Starší klient i hostitel: nová pole jsou nepovinná; test kompatibility
<!-- AC:END -->
