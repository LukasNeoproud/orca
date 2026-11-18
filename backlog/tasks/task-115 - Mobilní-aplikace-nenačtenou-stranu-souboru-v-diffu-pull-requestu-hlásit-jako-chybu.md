---
id: TASK-115
title: >-
  Mobilní aplikace: nenačtenou stranu souboru v diffu pull requestu hlásit jako
  chybu
status: Done
assignee: []
created_date: '2026-11-18T23:17:00Z'
updated_date: '2026-11-18T23:22:00Z'
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
- [x] #1 Když hostitel u změněného, přejmenovaného nebo smazaného souboru ohlásí chybějící původní stranu (nebo u přidaného a změněného chybějící novou), mobilní diff ukáže chybu a neukáže soubor jako přidaný nebo prázdný
- [x] #2 Rozhodnutí dělá sdílený predikát ze src/shared/azure-devops-review-unloaded-side.ts; logika není napsaná podruhé
- [x] #3 Přidaný soubor a soubor s opravdu prázdnou stranou se zobrazují jako dosud
- [x] #4 Test loaderu mobilní aplikace před opravou selže a po ní projde; typecheck a lint mobilní aplikace prochází
- [x] #5 Starší hostitel, který pole missing neposílá, se chová jako dosud
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: mobilní loader (azure-devops-review-file-diff-loader.ts) dostane changeType a po načtení zavolá sdílený azureDevOpsReviewUnloadedSide; nenačtená strana = odmítnutí s anglickou hláškou jako na desktopu (mobil nemá i18n katalogy), chyba se necachuje, existující chybový stav s Retry ji ukáže. Nový test loaderu s mockem azureDevOpsReviewRequest: edit/rename/delete bez původní, add/edit bez nové, add a prázdná strana beze změny, starší hostitel bez missing, retry po chybě. Ověřit, že test před opravou selže.

Hotovo: mobilní loader (mobile/src/azure-devops-review/azure-devops-review-file-diff-loader.ts) bere changeType a po načtení volá sdílený azureDevOpsReviewUnloadedSide; nenačtená strana odmítne promise anglickou hláškou shodnou s desktopem (mobil nemá i18n katalogy, ostatní texty diffu jsou také anglicky). Chyba se necachuje; AzureDevOpsReviewFileDiff.tsx ji ukáže ve stávajícím chybovém stavu s Retry. Nový test loaderu (11 případů): před opravou 6 selhalo, po ní vše prochází. Starší hostitel bez missing = undefined = beze změny (test). Brány: mobile pnpm typecheck, check:tests-typecheck, lint OK; mobile pnpm test 4 cizí selhání (mock-server-key-pair, mobile-agent-launch-architecture, mobile-structured-composer-command), padají i izolovaně a s loaderem nesouvisí. Kořen: pnpm tc, oxlint, check:code-quality:changed OK.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Mobilní diff pull requestu už neukáže upravený soubor jako celý přidaný ani smazaný jako prázdný, když hostitel ohlásí, že stranu souboru nenašel: ukáže chybu se stejným textem jako desktop a tlačítkem Retry, chyba se neukládá do keše. Rozhoduje sdílený predikát z TASK-114. Přidaný soubor, opravdu prázdná strana i starší hostitel bez pole missing se chovají jako dosud. Ověřeno novým testem loaderu (6 z 11 případů před opravou selhalo), typecheckem a lintem mobilní aplikace; aplikace neběžela na zařízení a zobrazení chyby v komponentě je doložené jen čtením kódu. Celé pnpm test mobilní aplikace má 4 selhání v jiných funkcích, která padají i bez této změny (zapsáno k TASK-112). Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
