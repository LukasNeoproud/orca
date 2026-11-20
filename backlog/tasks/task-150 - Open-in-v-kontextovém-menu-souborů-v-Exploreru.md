---
id: TASK-150
title: Open in v kontextovém menu souborů v Exploreru
status: To Do
assignee: []
created_date: '2026-11-20T11:26:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
priority: high
type: bug
ordinal: 50
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připomínka uživatele z akceptace M1 (2026-11-20): v kontextovém menu souborů v sidebaru v panelu Explorer chybí Open in.

### Rozsah

- Kontextové menu položek stromu Exploreru. Vzor je menu Source Control po TASK-144 (listing/entry-context-menu.tsx): kořen worktree se bere z toho, co řádek už má, ne novým čtením ze store.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Kontextové menu souboru v panelu Explorer nabízí Open in se stejnou nabídkou aplikací jako Source Control a editor; soubor se otevře v okně svého worktree nebo folder workspace
- [ ] #2 Složka v Exploreru se otevře jako složka; SSH soubory a workspace vzdáleného hostitele se chovají jako Open in jinde (bez kořene, nebo vypnuto s důvodem)
- [ ] #3 Znovu použit stávající Open in (WorktreeOpenInMenu, external-editor-file-open), žádná druhá implementace; tabulka míst v 02-editor.md je doplněná
- [ ] #4 Test menu Exploreru; celé složky dotčené oblasti prochází; ověřeno ve skrytém okně se snímkem
<!-- AC:END -->
