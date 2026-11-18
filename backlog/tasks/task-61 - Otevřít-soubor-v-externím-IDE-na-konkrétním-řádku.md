---
id: TASK-61
title: Otevřít soubor v externím IDE na konkrétním řádku
status: Done
assignee: []
created_date: '2026-11-18T12:43:00Z'
updated_date: '2026-11-18T14:39:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
  - docs/review-ide/05-funkce.md
priority: high
type: feature
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Z každého místa, kde Orca ukazuje kód, jít jedním krokem do nativního IDE na stejný řádek. Ladění, build a náhledy zůstávají v nativních IDE, takže tohle je hlavní most mezi Orcou a jimi.

### Rozsah

- `src/main/external-editor-launch.ts` dnes otevírá jen složku. Doplň cíl se souborem, řádkem a sloupcem a rozpoznání rodiny editoru z příkazu.
- Požadavek `openInExternalEditor` (`src/main/ipc/shell.ts`, preload `shell-api.ts` a `shell-bridge.ts`, webový protějšek `web-shell-api.ts`) rozšiř o nepovinný soubor, řádek a sloupec.
- Akce přidej do kontextového menu okraje editoru (`MonacoGutterContextMenu.tsx`), k cestě v hlavičce editoru (`EditorPanelHeaderPath.tsx`), do diffu souboru a do diffu pull requestu (`AzureDevOpsReviewFileDiffPane.tsx`).
- Seznam aplikací a jejich popisky převezmi z `src/renderer/src/components/sidebar/WorktreeOpenInMenu.tsx`.

### Mimo rozsah

- Výchozí IDE podle role repozitáře (Android, iOS, backend); přijde s Funkcemi v M7.
- Akce v grafech a nálezech, které zatím neexistují.

### Omezení

- macOS, Linux i Windows: cesty a argumenty skládej stávajícími funkcemi souboru, žádné nové ruční escapování; `xed` jen na macOS.
- Stávající vzdálené otevření VS Code přes SSH musí fungovat dál a umět řádek.
- Folder workspaces bez gitu se chovají stejně jako worktrees.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Akce Open in v editoru, v diffu souboru a v diffu pull requestu otevře soubor ve zvolené aplikaci na řádku, kde byla vyvolána
- [x] #2 VS Code a jeho odvozeniny dostanou soubor s řádkem a sloupcem, IDE od JetBrains včetně Android Studia řádek přes svůj přepínač, Xcode přes xed; neznámý příkaz otevře soubor bez řádku
- [x] #3 Nabízené aplikace jsou stejné jako v nabídce Open in u worktree a naposledy zvolená je pro daný repozitář výchozí
- [x] #4 Otevírá se vždy cesta ve worktree, ve kterém je soubor zobrazený, včetně review worktree pull requestu
- [x] #5 U SSH worktree akce nabídne jen aplikace, které vzdálené otevření umí, a u ostatních řekne proč nejsou dostupné
- [x] #6 Sestavení příkazu pro každou rodinu editorů a každou platformu pokrývají testy v external-editor-launch.test.ts
- [x] #7 Test ve skrytém okně ověří, že akce z kontextového menu editoru odešle požadavek se souborem a řádkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker): (1) main: nový src/main/external-editor-file-location.ts (rodina editoru z příkazu: vscode/jetbrains/xcode/zed/unknown + argumenty pro řádek a sloupec), external-editor-launch.ts a ipc/shell.ts jen předají location; požadavek dostane nepovinné line a column, soubor jde v existujícím poli path (tak už ho posílá Source Control). (2) renderer: nový adresář components/external-editor-file-open (cíl souboru z worktree, poslední aplikace na repozitář v localStorage, položky menu, gutter menu pro diff); registrace v MonacoGutterContextMenu, EditorPanelHeaderPath, DiffViewer (+ hostitelé) a AzureDevOpsReviewFileDiffPane. (3) testy: external-editor-launch.test.ts, shell.test.ts, jednotkové testy rendereru, e2e spec ve skrytém okně. (4) i18n: components.openInExternalEditor v šesti jazycích.

Hotovo (main): external-editor-file-location.ts, předání location v external-editor-launch.ts a ipc/shell.ts, line/column v ShellOpenExternalEditorRequest, testy external-editor-launch.test.ts a ipc/shell-open-file-at-line.test.ts prochází. Zbývá: renderer (menu, cíl, poslední aplikace), i18n, e2e, tc a kontrola kvality.

Hotovo (renderer, i18n, testy): adresář components/external-editor-file-open, registrace v MonacoGutterContextMenu, EditorPanelHeaderPath, DiffViewer (+ EditorDiffFileSurface, ChangesModeView) a AzureDevOpsReviewFileDiffPane; klíče components.openInExternalEditor v šesti jazycích; tests/e2e/open-file-in-external-editor.spec.ts (3 testy ve skrytém okně) prochází; pnpm tc a check:code-quality:changed prochází; docs/review-ide/02-editor.md doplněn. Snímky: ~/.cache/orca-review-ide/task-61/. Nezbývá nic; čeká na ověření koordinátorem.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Akce Open in otevře soubor v externím IDE na řádku: pravé tlačítko na čísle řádku v editoru, v diffu souboru a v diffu pull requestu a kontextové menu cesty v hlavičce editoru. VS Code a odvozeniny dostanou --goto soubor:řádek:sloupec, JetBrains včetně Android Studia --line, Xcode xed -l (jen macOS), Zed soubor:řádek:sloupec, neznámý příkaz jen soubor. Nabídka aplikací je stejná jako Open in u worktree, naposledy zvolená je výchozí pro repozitář (uloženo v localStorage). U SSH worktree jde jen VS Code přes Remote-SSH. Diff pull requestu akci nabízí, jen když je v review worktree právě tento pull request. Ověřeno testy a třemi e2e ve skrytém okně s náhradním spouštěčem; skutečná IDE spuštěna nebyla a diff pull requestu je doložen jen testem komponenty. JetBrains dostává jen řádek, sloupec čeká na ověření na IDE.
<!-- SECTION:FINAL_SUMMARY:END -->
