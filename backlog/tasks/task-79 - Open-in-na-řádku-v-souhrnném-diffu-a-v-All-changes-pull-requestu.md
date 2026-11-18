---
id: TASK-79
title: Open in na řádku v souhrnném diffu a v All changes pull requestu
status: Done
assignee: []
created_date: '2026-11-18T14:40:00Z'
updated_date: '2026-11-18T22:10:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
priority: medium
type: feature
ordinal: 15500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-61 přidal akci Open in na řádku do editoru, diffu jednoho souboru a diffu souboru pull requestu. Souhrnné diffy ji nemají, takže recenzent, který čte všechny změny najednou, musí soubor nejdřív otevřít zvlášť.

### Rozsah

- Znovu použít `src/renderer/src/components/external-editor-file-open/` (`ExternalEditorFileGutterMenu`, `useExternalEditorFileTarget`); novou logiku nepsat.
- Souhrnný diff workspace: `src/renderer/src/components/editor/combined-diff/` (položka sekce, `diff-section-item-props.ts`).
- All changes pull requestu: `src/renderer/src/components/azure-devops-review/AzureDevOpsReviewAllChanges.tsx`; cestu v review worktree dává `azure-devops-review-external-editor-file.ts`.
- Vysvětlení nedostupnosti v diffu pull requestu: dnes se menu jen neobjeví.

### Mimo rozsah

- Otevírání worktree jako projektu a ověření na skutečných IDE: vlastní tiket, čeká na uživatele.
- Levá (původní) strana diffu.
- Sjednocení odsazení ikon ve starších položkách menu editoru.

### Omezení

- Do sdílených souborů diffu jen registrace; fork se slučuje s upstreamem.
- Externí IDE při ověřování nespouštět; příkaz doložit náhradním spouštěčem jako v `tests/e2e/open-file-in-external-editor.spec.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pravé tlačítko na čísle řádku upravené strany v souhrnném diffu workspace nabídne Open in a otevře soubor na tomto řádku
- [x] #2 Totéž funguje v pohledu All changes pull requestu Azure DevOps, když je v review worktree právě tento pull request
- [x] #3 Když akce v diffu pull requestu dostupná není, rozhraní řekne proč (pull request není otevřený v review worktree, soubor je smazaný)
- [x] #4 Souhrnný diff pull requestu jiného poskytovatele (GitHub, GitLab) se chová jako dosud nebo akci nabízí stejným způsobem; SSH worktree nabídne jen VS Code přes Remote-SSH
- [x] #5 Testy komponent pokrývají předání souboru a řádku; jeden průchod ve skrytém okně je doložen snímkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker): (1) external-editor-file-open: ExternalEditorFileGutterMenu umí i nedostupnost s důvodem (vypnutá položka Open in + vysvětlení); nový typ dostupnosti souboru (soubor | důvod) a malý obal pro sekci diffu, který z něj udělá cíl. (2) DiffSectionItem a diff-section-item-props jen registrace nepovinné funkce sekce -> dostupnost. (3) Souhrnný diff workspace: cesta = joinPath(worktree, section.path), smazané soubory bez akce; registrace v combined-diff-section-list. (4) Azure DevOps: azure-devops-review-external-editor-file vrátí i důvod nedostupnosti (není review worktree / jiný PR / smazaný soubor); registrace v AzureDevOpsReviewAllChanges a v diffu jednoho souboru (DiffViewer dostane důvod). GitHub/GitLab beze změny. (5) i18n důvodů v šesti jazycích, testy komponent, e2e ve skrytém okně pro souhrnný diff.

Hotovo: dostupnost souboru (external-editor-file-availability.ts), gutter menu umí vysvětlení (ExternalEditorFileUnavailableMenuItems), obal sekce ExternalEditorDiffSectionGutterMenu, registrace v DiffSectionItem/diff-section-item-props, combined-diff-section-list, AzureDevOpsReviewAllChanges a diffu souboru PR (DiffViewer.externalEditorUnavailableReason); i18n 3 klíče v šesti jazycích; testy komponent prochází. Zbývá: tc, lint, kontrola kvality, e2e ve skrytém okně se snímkem, dokumentace.

Hotovo: pnpm tc, oxlint a check:code-quality:changed prochází; dokumentace 02-editor.md doplněna; e2e (2 nové testy v tests/e2e/open-file-in-external-editor.spec.ts) běží. Zbývá: výsledek e2e a snímky v ~/.cache/orca-review-ide/task-79.

Hotovo: e2e 5/5 ve skrytém okně (izolovaný HOME, náhradní spouštěč), snímky ~/.cache/orca-review-ide/task-79/combined-diff-gutter-open-in.png a combined-diff-deleted-open-in.png. Nezbývá nic; čeká na ověření koordinátorem.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Open in na řádku funguje i v souhrnném diffu workspace a v All changes pull requestu Azure DevOps: pravé tlačítko na okraji řádku nabídne stejné IDE jako u jednoho souboru a otevře soubor na tom řádku. Kde otevřít nejde, menu ukáže vypnuté Open in s důvodem (soubor je smazaný, review worktree neexistuje, review worktree má jiný pull request); totéž vysvětlení dostal i diff jednoho souboru pull requestu. Znovu použita logika z TASK-61, do sdílených komponent diffu přibyla jen nepovinná prop; stránky pull requestů GitHubu a GitLabu ji nepředávají a chovají se jako dosud. Ověřeno testy komponent nad smyšlenými daty a e2e ve skrytém okně s náhradním spouštěčem (souhrnný diff: otevření na řádku a smazaný soubor); All changes Azure DevOps je doložené jen testy komponent. Známé omezení z TASK-61 trvá: v režimu commitu a porovnání větví se otevírá aktuální soubor ve workspace, čísla řádků se nemusí shodovat se zobrazenou verzí (zapsáno k TASK-80). Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
