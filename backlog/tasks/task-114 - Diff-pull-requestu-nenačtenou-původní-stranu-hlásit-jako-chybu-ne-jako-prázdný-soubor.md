---
id: TASK-114
title: >-
  Diff pull requestu: nenačtenou původní stranu hlásit jako chybu, ne jako
  prázdný soubor
status: Done
assignee: []
created_date: '2026-11-18T23:05:00Z'
updated_date: '2026-11-18T23:17:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-review.md
priority: medium
type: bug
ordinal: 228500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Při ověřování proti skutečné organizaci (TASK-67) byly u změněného souboru v inline zobrazení odebrané řádky červený pruh bez textu. TASK-78 to nad smyšlenými daty nereprodukoval a našel pravděpodobnou příčinu: když se původní strana souboru nenačte, bere se jako prázdný obsah a diff vypadá jako přidání celého souboru nad prázdným odebraným pruhem. Reviewer tak vidí zavádějící diff bez varování.

### Rozsah

- Načtení stran souboru: `src/main/azure-devops/review/` (klient a služba, hledej `missing` u strany souboru) a typ `AzureDevOpsReviewFileSide` ve `src/shared/azure-devops-review-types.ts`.
- Zobrazení: `src/renderer/src/components/azure-devops-review/AzureDevOpsReviewFileDiffPane.tsx`, `azure-devops-review-diff-sections.ts`, `AzureDevOpsReviewAllChanges.tsx`; chybový stav sekce už sdílený diff umí (`onRetrySection`).
- Nejdřív zjisti a zapiš, kdy dnes strana skončí jako `missing`: 404, chyba sítě, příliš velký soubor, binární obsah.

### Mimo rozsah

- Fantomový odebraný řádek u přidaného souboru v diffu workspace a v pull requestech GitHubu a GitLabu (čeká na rozhodnutí uživatele, viz poznámky TASK-78).

### Omezení

- K Azure DevOps se nepřipojuj; reprodukce jen nad podvrženými odpověďmi.
- Když oprava mění typ, který si vyměňuje hostitel s klienty, jen nepovinným polem; starší klient musí dostat platná data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Když se u změněného nebo smazaného souboru nepodaří načíst původní stranu, diff ukáže chybu s možností zkusit to znovu a neukáže odebrané řádky jako prázdné
- [x] #2 Přidaný soubor a soubor, který má původní stranu opravdu prázdnou, se dál zobrazují jako dnes
- [x] #3 Test nad podvrženou odpovědí (původní strana vrátí 404 nebo chybu) před opravou selže a po ní projde; totéž pro pohled všech změn i jednoho souboru
- [x] #4 AI review a drafty nad takovým souborem nedostanou prázdnou původní stranu jako skutečný obsah, nebo je zapsané, proč se jich to netýká
- [x] #5 Jiní poskytovatelé než Azure DevOps se chovají jako dosud
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: 1) Zjistit, kdy strana skončí jako missing (klient: jen HTTP 404 a chybějící baseCommit; ostatní chyby hází a renderer už ukáže chybu s Opakovat). 2) e2e s podvrženými odpověďmi podle tests/e2e/pull-request-inline-diff.spec.ts: změněný soubor, jehož původní strana vrátí 404 / 500, v pohledu všech změn i jednoho souboru; nejdřív ukázat dnešní chování. 3) Oprava bez změny kontraktu v rendereru: loader porovná missing s typem změny (edit/rename/delete bez původní strany, add/edit/rename bez nové) a odmítne s lokalizovanou chybou; chybu necachuje, Opakovat načte znovu. 4) Unit testy predikátu a loaderu, AC #4 zapsat (AI review čte git diff ve worktree, drafty kotví vpravo).

Zjištění (před opravou): strana je missing jen při HTTP 404 z items API (getAzureDevOpsReviewItemAtCommit / ...BytesAtCommit) a když iterace nemá baseCommit ani targetCommit. Chyba sítě, timeout, 401/403/429/5xx a nečitelná odpověď hodí AzureDevOpsRequestError a celý fileDiff selže; renderer pak už dnes ukáže chybu s Opakovat (sekce i jeden soubor). Příliš velký text (>2M znaků) = tooLarge, binární = binary, obrázek > 10 MB = too-large; obojí má vlastní hlášku. Podezření platí pro 404: e2e tests/e2e/pull-request-unloaded-original-side.spec.ts před opravou selhal; upravený soubor s 404 původní strany se kreslí jako přidaný celý (+3), smazaný s 404 jako prázdný diff, 500 už končí chybou. Snímek ~/.cache/orca-review-ide/task-114/before. Zbývá: oprava v loaderu rendereru, unit testy, lokalizace.

Hotovo: oprava v loaderu rendereru (use-azure-devops-review-file-diff.ts) se sdíleným predikátem src/shared/azure-devops-review-unloaded-side.ts; chyba se necachuje, Opakovat načte znovu. Lokalizace 2 klíčů v 6 jazycích. Unit testy (predikát, loader – 4 z 5 bez opravy selžou) a e2e (před opravou selhal, po ní prochází; snímky ~/.cache/orca-review-ide/task-114/after). Společný fake ADO pro e2e v tests/e2e/helpers/fake-azure-devops-pull-request.ts, použitý i v pull-request-inline-diff.spec.ts. Zbývá: brány (tc, oxlint, code-quality, ratchety).

AC #4: AI review čte změnu přes git diff <base>...HEAD v review worktree (src/shared/azure-devops-review-prompt.ts), ne přes azureDevOpsReview.fileDiff; MCP nástroje ani CLI fileDiff nevystavují. Drafty kotví na pravou stranu (side: 'right') a obsah strany nenesou; při chybě se diff nevykreslí, takže na zavádějící prázdný originál nejde draft přidat. AC #5: změna je jen v loaderu Azure DevOps v rendereru; GitHub/GitLab a diff workspace nedotčeny; e2e pull-request-inline-diff a snapshot-diff-pull-request dál prochází. Brány: pnpm tc, oxlint, check:code-quality:changed, verify:localization-* prochází; ratchety hlásí jen cizí soubory. Zbývající riziko: odpověď 200 bez pole content se dál bere jako prázdný text (nelze ověřit bez připojení). Mobilní aplikace má stejnou slabinu ve vlastním loaderu (navazující tiket). Pole documentation tiketu odkazuje na neexistující docs/review-ide/05-review.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Podezření z TASK-78 se potvrdilo: když Azure DevOps na původní stranu souboru odpověděl HTTP 404, upravený soubor se kreslil jako celý přidaný a smazaný jako prázdný diff. Diff teď v takovém případě ukáže chybu s možností zkusit to znovu, v pohledu všech změn i jednoho souboru; totéž platí pro chybějící novou stranu přidaného nebo upraveného souboru. Rozhoduje sdílený predikát podle typu změny, kontrakt s klienty ani RPC se nezměnily a výsledek s chybou se neukládá do keše. Ostatní selhání (síť, 401, 403, 429, 5xx) končila chybou už dřív. Přidaný soubor a soubor s opravdu prázdnou stranou se zobrazují jako dosud. AI review čte změnu z gitu v review worktree, ne z tohoto diffu, takže se ho vada netýkala. Ověřeno testy, které před opravou selhaly, a e2e ve skrytém okně s podvrženým serverem. Mobilní aplikace má stejnou vadu ve vlastním loaderu (TASK-115). Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
