---
id: TASK-146
title: >-
  Brány kvality: odkaz Set up gates odskroluje na oddíl Quality gates v
  nastavení
status: To Do
assignee: []
created_date: '2026-11-20T09:14:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: bug
ordinal: 30
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připomínka uživatele z akceptace M1 (2026-11-20): Set up gates otevře nastavení ve správné sekci, ale neodskroluje na část s Quality gates.

### Rozsah

- Odkaz z oddílu Local gates (src/renderer/src/components/quality-gates/) a cílový oddíl v nastavení repozitáře.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Klik na Set up gates v oddílu Local gates otevře nastavení repozitáře odskrolované na oddíl Quality gates, i když je nastavení už otevřené na jiném místě
- [ ] #2 Znovu použit stávající mechanismus odkazu na oddíl nastavení, pokud existuje; test a ověření ve skrytém okně
<!-- AC:END -->
