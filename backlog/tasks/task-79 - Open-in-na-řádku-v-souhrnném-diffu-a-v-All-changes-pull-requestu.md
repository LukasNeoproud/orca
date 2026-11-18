---
id: TASK-79
title: Open in na řádku v souhrnném diffu a v All changes pull requestu
status: To Do
assignee: []
created_date: '2026-11-18T14:40:00Z'
labels:
  - review-ide
  - effort-medium
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
- [ ] #1 Pravé tlačítko na čísle řádku upravené strany v souhrnném diffu workspace nabídne Open in a otevře soubor na tomto řádku
- [ ] #2 Totéž funguje v pohledu All changes pull requestu Azure DevOps, když je v review worktree právě tento pull request
- [ ] #3 Když akce v diffu pull requestu dostupná není, rozhraní řekne proč (pull request není otevřený v review worktree, soubor je smazaný)
- [ ] #4 Souhrnný diff pull requestu jiného poskytovatele (GitHub, GitLab) se chová jako dosud nebo akci nabízí stejným způsobem; SSH worktree nabídne jen VS Code přes Remote-SSH
- [ ] #5 Testy komponent pokrývají předání souboru a řádku; jeden průchod ve skrytém okně je doložen snímkem
<!-- AC:END -->
