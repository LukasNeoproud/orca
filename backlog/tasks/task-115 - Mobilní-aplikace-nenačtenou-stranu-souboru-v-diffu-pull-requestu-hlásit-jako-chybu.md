---
id: TASK-115
title: >-
  Mobilní aplikace: nenačtenou stranu souboru v diffu pull requestu hlásit jako
  chybu
status: To Do
assignee: []
created_date: '2026-11-18T23:17:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
priority: low
type: bug
ordinal: 228600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-114 opravil desktop: strana souboru, kterou Azure DevOps nenašel (HTTP 404), se už nekreslí jako prázdná. Mobilní aplikace má vlastní loader a stejnou vadu: upravený soubor s nenačtenou původní stranou ukáže jako celý přidaný.

### Rozsah

- `mobile/src/azure-devops-review/azure-devops-review-file-diff-loader.ts` a jeho test.
- Sdílený predikát `azureDevOpsReviewUnloadedSide` ze `src/shared/azure-devops-review-unloaded-side.ts`; vzor použití je `src/renderer/src/components/azure-devops-review/use-azure-devops-review-file-diff.ts`.
- Text chyby: použij existující chybový stav mobilního diffu; nový text jen pokud žádný vhodný není.

### Mimo rozsah

- Změna toho, co hostitel posílá.

### Omezení

- Mobilní aplikace má vlastní pravidla lintu (`mobile/.oxlintrc.json`); `max-lines` nikdy nezvyšuj.
- Aplikaci nespouštěj na zařízení ani v simulátoru; stačí testy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Když hostitel u změněného, přejmenovaného nebo smazaného souboru ohlásí chybějící původní stranu (nebo u přidaného a změněného chybějící novou), mobilní diff ukáže chybu a neukáže soubor jako přidaný nebo prázdný
- [ ] #2 Rozhodnutí dělá sdílený predikát ze src/shared/azure-devops-review-unloaded-side.ts; logika není napsaná podruhé
- [ ] #3 Přidaný soubor a soubor s opravdu prázdnou stranou se zobrazují jako dosud
- [ ] #4 Test loaderu mobilní aplikace před opravou selže a po ní projde; typecheck a lint mobilní aplikace prochází
- [ ] #5 Starší hostitel, který pole missing neposílá, se chová jako dosud
<!-- AC:END -->
