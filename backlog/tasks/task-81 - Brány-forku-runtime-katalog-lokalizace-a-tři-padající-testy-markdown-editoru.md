---
id: TASK-81
title: 'Brány forku: runtime katalog lokalizace a tři padající testy markdown editoru'
status: To Do
assignee: []
created_date: '2026-11-18T14:40:00Z'
labels:
  - review-ide
  - effort-medium
  - ceka-na-uzivatele
milestone: m-1
dependencies: []
priority: medium
type: bug
ordinal: 15700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Akceptace milníku spouští celé brány (`pnpm tc`, `pnpm test`, `pnpm lint`). Dvě z nich padají už na commitu před Review IDE, takže by akceptaci M1 zablokovaly nebo by se jejich selhání začala přehlížet.

### Rozsah

- `src/renderer/src/i18n/en-runtime-required.json` nepokrývá `en.json`: chybí 43 klíčů `components.right-sidebar.gitGraph.*` ze seznamu větví a úklidu sloučených větví. Oprava: `pnpm run sync:localization-runtime-catalog`. Worker TASK-61 hlásí i selhání `verify:localization-catalog`, `-coverage` a `-extraction` na klíčích `azureDevOpsReview.*` a `gitGraph.*`; zjistit příčinu u každého.
- `src/renderer/src/components/editor/`: `markdown-preview-table-chunks.test.ts`, `rich-markdown-details-keyboard.test.ts`, `rich-markdown-escape-fidelity.test.ts` padají samostatně (například podtržítko mezi znaky mimo základní rovinu Unicode se escapuje). Soubory jsou z upstreamu a Review IDE je neměnilo; zjistit, jestli jde o chybu forku, upstreamu, nebo běhového prostředí testů.

### Čeká na uživatele

Oprava je mimo zadání v `docs/review-ide`, týká se dřívější práce ve forku. Doporučení: opravit teď (odhadem jeden krátký běh), jinak akceptace M1 poběží s červenými branami.

### Omezení

- Katalogy nepřepisovat hromadně; po úpravě zkontrolovat `git diff`.
- Testy z upstreamu neupravovat tak, aby jen prošly; když je chyba v upstreamu, zapsat to a test nechat.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm run verify:localization-catalogs prochází
- [ ] #2 Testy markdown-preview-table-chunks, rich-markdown-details-keyboard a rich-markdown-escape-fidelity prochází, nebo je doloženo, že padají i na upstreamu, a je zapsané proč
- [ ] #3 Změna se netýká textů ani chování mimo chybějící klíče a opravené testy; git diff katalogů obsahuje jen doplněné klíče
<!-- AC:END -->
