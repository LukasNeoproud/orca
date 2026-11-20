---
id: TASK-150
title: Open in v kontextovém menu souborů v Exploreru
status: Done
assignee: []
created_date: '2026-11-20T11:26:00Z'
updated_date: '2026-11-20T11:38:00Z'
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
- [x] #1 Kontextové menu souboru v panelu Explorer nabízí Open in se stejnou nabídkou aplikací jako Source Control a editor; soubor se otevře v okně svého worktree nebo folder workspace
- [x] #2 Složka v Exploreru se otevře jako složka; SSH soubory a workspace vzdáleného hostitele se chovají jako Open in jinde (bez kořene, nebo vypnuto s důvodem)
- [x] #3 Znovu použit stávající Open in (WorktreeOpenInMenu, external-editor-file-open), žádná druhá implementace; tabulka míst v 02-editor.md je doplněná
- [x] #4 Test menu Exploreru; celé složky dotčené oblasti prochází; ověřeno ve skrytém okně se snímkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: Open in submenu ze Source Control vyjmout do sdílené ExternalEditorPathContextSubMenu (external-editor-file-open) a použít ji v SC i v menu řádku Exploreru; kořen worktree přichází prop worktreePath z FileExplorerFilesTreePane přes VirtualRows a Row (bez nového čtení ze store); složka bez kořene. Testy menu Exploreru, celé složky right-sidebar a sidebar, e2e se zaznamenávajícím editorem, tabulka v 02-editor.md.

Hotovo (worker 2026-11-20): sdílené podmenu ExternalEditorPathContextSubMenu (SC i Explorer), worktreePath z FileExplorerFilesTreePane přes VirtualRows a Row, složka bez kořene; testy menu Exploreru (6 nových), složky right-sidebar+sidebar+external-editor-file-open 678 souborů / 5670 testů zeleně v čistém prostředí, e2e open-file-in-external-editor 10/10 ve skrytém okně (snímky ~/.cache/orca-review-ide/task-150/e2e-output), tc, oxlint, oxfmt, brána změněných řádků, anti-slop a ratchety bez nálezů; 02-editor.md doplněná. Čeká na koordinátora.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Kontextové menu souboru i složky v panelu Explorer nabízí Open in se stejnou nabídkou aplikací jako Source Control; soubor se otevře v okně svého worktree nebo folder workspace, složka jako složka. SSH a vzdálený runtime se chovají jako Open in jinde. Blok Open in je jedno sdílené podmenu pro Explorer i Source Control. Dodáno po přijetí M1 (přijatý commit 2f37ea38b7 ho neobsahuje). Ověřeno: tc, 320 souborů testů right-sidebar a external-editor-file-open, brána změněných řádků, anti-slop, e2e ve skrytém okně se snímky. Skutečná IDE nespuštěna.
<!-- SECTION:FINAL_SUMMARY:END -->
