---
id: TASK-147
title: 'Editor: kontextové menu ve vzhledu ostatních menu Orky'
status: Done
assignee: []
created_date: '2026-11-20T09:14:00Z'
updated_date: '2026-11-20T10:25:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
priority: low
type: bug
ordinal: 40
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připomínka uživatele z akceptace M1 (2026-11-20): kontextové menu editoru vypadá jinak než kontextová menu Orky.

### Rozsah

- Nejdřív zjisti, jestli jde menu editoru sladit styly přes tokeny z src/renderer/src/assets/main.css. Když by to znamenalo nahradit menu editoru vlastním, nedělej to, zapiš odhad a vrať tiket jako otázku.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Kontextové menu editoru (včetně položek Annotate, Show History for Selection a Open in) má vzhled kontextových menu Orky podle docs/STYLEGUIDE.md ve světlém i tmavém motivu
- [x] #2 Položky, zkratky a chování menu editoru zůstávají; diff editor a markdown editor se chovají stejně
- [x] #3 Ověřeno ve skrytém okně se snímkem obou menu vedle sebe
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker): Monaco kreslí kontextové menu ve vlastním shadow root (.shadow-root-host v DOM editoru), kam main.css nedosáhne. Řešení bez náhrady menu: list stylů s tokeny (popover, border, accent-foreground, shadow-floating, radius, text-xs) adoptovaný do toho shadow root přes adoptedStyleSheets; instalace jednou v monaco-setup (onDidCreateEditor + MutationObserver na DOM editoru), takže pokryje editor, diff i markdown zdroj. E2E ve skrytém okně porovná obě menu ve světlém i tmavém motivu a uloží snímky do ~/.cache/orca-review-ide/task-147.

Stav (hotovo): src/renderer/src/lib/monaco-context-menu-look.{ts,css} adoptuje list stylů s tokeny do shadow root menu Monaca (registrace v monaco-setup.ts). Barvy přes proměnné --vscode-menu-* napojené na --popover, --popover-foreground, --border, --accent-foreground; zvýraznění 8 % / 14 % barvy textu jako primitiva; písmo var(--font-sans) a --text-xs, řádek 25 px, radius --radius-lg / --radius-md, stín --shadow-floating. Rozdíl proti primitivu: povrch je neprůhledný --popover bez rozmazání (primitivum má surové rgba hodnoty mimo tokeny). E2E tests/e2e/editor-context-menu-look.spec.ts (editor, diff, markdown source, oba motivy), jednotkové testy, tc, oxlint, brána změněných řádků, anti-slop a ratchety prochází. Snímky ~/.cache/orca-review-ide/task-147.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Kontextové menu editoru má vzhled menu Orky: písmo, velikost, výška řádku, zaoblení, stín, barvy a zvýraznění položky z tokenů, ve světlém i tmavém motivu; platí pro editor souborů, diff, Markdown source i notebooky. Menu zůstává Monaca, styl se vkládá do jeho shadow root. Povrch je neprůhledný --popover; průsvitné pozadí s rozmazáním z menu Orky se nepřebírá, protože není v tokenech. Položky a chování se nezměnily. Ověřeno: tc, testy, brána změněných řádků, anti-slop, e2e ve skrytém okně se snímky obou menu vedle sebe.
<!-- SECTION:FINAL_SUMMARY:END -->
