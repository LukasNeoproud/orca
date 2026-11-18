---
id: TASK-61
title: Otevřít soubor v externím IDE na konkrétním řádku
status: To Do
assignee: []
created_date: '2026-11-18T12:43:00Z'
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
- [ ] #1 Akce Open in v editoru, v diffu souboru a v diffu pull requestu otevře soubor ve zvolené aplikaci na řádku, kde byla vyvolána
- [ ] #2 VS Code a jeho odvozeniny dostanou soubor s řádkem a sloupcem, IDE od JetBrains včetně Android Studia řádek přes svůj přepínač, Xcode přes xed; neznámý příkaz otevře soubor bez řádku
- [ ] #3 Nabízené aplikace jsou stejné jako v nabídce Open in u worktree a naposledy zvolená je pro daný repozitář výchozí
- [ ] #4 Otevírá se vždy cesta ve worktree, ve kterém je soubor zobrazený, včetně review worktree pull requestu
- [ ] #5 U SSH worktree akce nabídne jen aplikace, které vzdálené otevření umí, a u ostatních řekne proč nejsou dostupné
- [ ] #6 Sestavení příkazu pro každou rodinu editorů a každou platformu pokrývají testy v external-editor-launch.test.ts
- [ ] #7 Test ve skrytém okně ověří, že akce z kontextového menu editoru odešle požadavek se souborem a řádkem
<!-- AC:END -->
