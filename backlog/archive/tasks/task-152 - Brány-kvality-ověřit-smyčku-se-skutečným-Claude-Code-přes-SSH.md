---
id: TASK-152
title: 'Brány kvality: ověřit smyčku se skutečným Claude Code přes SSH'
status: To Do
assignee: []
created_date: '2026-11-20T13:05:00Z'
updated_date: '2026-11-20T13:43:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-151
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: task
ordinal: 207660
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Zbytek TASK-139: kritérium SSH.

### Čeká na uživatele

Token pro Claude Code v kontejneru: uživatel spustí `claude setup-token` a token předá pro běh zkoušky.

### Omezení

- Codex nespouštět. Krátká spuštění, levný model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Skutečný Claude Code v SSH worktree na hostiteli v kontejneru dostane zprávu o selhané bráně a po opravě smyčka skončí stavem prošlo; stav vlastní vzdálený hostitel; průběh je zapsaný
- [ ] #2 Přihlašovací token je předán jen za běhu, není v obrazu ani v souborech; kontejner a obraz jsou po zkoušce odstraněné
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20: uživatel rozhodl zkoušku se skutečným Claude Code přes SSH přeskočit. Neprovádí se; token není potřeba.
<!-- SECTION:NOTES:END -->
