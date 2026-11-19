---
id: TASK-136
title: >-
  Testy terminal-link: chybějící revealInExplorer v mocku shazuje běh
  terminal-pane
status: To Do
assignee: []
created_date: '2026-11-19T16:51:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
type: bug
ordinal: 16030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Vitest nad `src/renderer/src/components/terminal-pane` projde všech 5146 testů, ale končí kódem 1 kvůli třem unhandled rejection `store.revealInExplorer is not a function` v testech `terminal-link-*`. Padají i samostatně a pochází z commitu c5f3897e4c (zjištěno v TASK-135). Akceptace M1 pouští celé `pnpm test`.

### Rozsah

- Mocky store v testech `terminal-link-*`; když chyba ukazuje na skutečnou chybu v kódu, oprav kód a doplň test.

### Omezení

- Žádné potlačení unhandled rejection v konfiguraci vitestu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Vitest nad src/renderer/src/components/terminal-pane končí kódem 0 bez unhandled rejection
- [ ] #2 Poznámky říkají, zda šlo jen o mock, nebo o chybu v kódu
<!-- AC:END -->
