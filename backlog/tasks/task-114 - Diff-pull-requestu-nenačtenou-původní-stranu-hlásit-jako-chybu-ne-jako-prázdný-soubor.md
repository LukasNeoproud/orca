---
id: TASK-114
title: >-
  Diff pull requestu: nenačtenou původní stranu hlásit jako chybu, ne jako
  prázdný soubor
status: To Do
assignee: []
created_date: '2026-11-18T23:05:00Z'
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
- [ ] #1 Když se u změněného nebo smazaného souboru nepodaří načíst původní stranu, diff ukáže chybu s možností zkusit to znovu a neukáže odebrané řádky jako prázdné
- [ ] #2 Přidaný soubor a soubor, který má původní stranu opravdu prázdnou, se dál zobrazují jako dnes
- [ ] #3 Test nad podvrženou odpovědí (původní strana vrátí 404 nebo chybu) před opravou selže a po ní projde; totéž pro pohled všech změn i jednoho souboru
- [ ] #4 AI review a drafty nad takovým souborem nedostanou prázdnou původní stranu jako skutečný obsah, nebo je zapsané, proč se jich to netýká
- [ ] #5 Jiní poskytovatelé než Azure DevOps se chovají jako dosud
<!-- AC:END -->
