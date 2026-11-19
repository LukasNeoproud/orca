---
id: TASK-126
title: 'Nálezy AI: řazení podle priority, filtry a publikace podle filtru'
status: To Do
assignee: []
created_date: '2026-11-19T09:38:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-2
dependencies:
  - TASK-84
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 222900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Po AI review většího pull requestu je draftů desítky a recenzent je prochází v pořadí, v jakém vznikly. Nálezy mají být seřazené podle priority ze závažnosti a jistoty a publikovat má jít podle filtru, například jen chyby a varování s jistotou ověřeno.

### Rozsah

- Jen rozhraní nad poli, která draft už má: závažnost a jistota z TASK-84 (`severity`, `certainty` v `src/shared/azure-devops-review-draft-finding-types.ts`, hodnoty v `src/shared/review-finding.ts`, čtení přes `draftSeverity` a `draftCertainty` v `src/renderer/src/components/azure-devops-review/azure-devops-review-finding-labels.ts`), autor (`author`) a soubor (`filePath`). Žádné nové pole draftu ani parametr RPC.
- Priorita jako odvozená hodnota ze závažnosti a jistoty, čistá sdílená funkce ve `src/shared/`. Navrhni ji tak, aby šel přidat další faktor; četnost a ruční přepsání přidá TASK-103.
- Rozhraní: `src/renderer/src/components/azure-devops-review/AzureDevOpsReviewDrafts.tsx` (řazení, filtry, výběr podle filtru) a `AzureDevOpsReviewDraftCard.tsx`; publikace výběru stávajícím dialogem `AzureDevOpsReviewPublishDialog.tsx`.

### Mimo rozsah

- Klíč problému, seskupení opakovaných nálezů, četnost v prioritě, ruční přepsání priority a sloučení skupiny: TASK-103.
- Dopad nálezu: rozsah na úrovni modulu a platformy potřebuje analytické jádro (M4).
- Nálezy z lintu a kontrol IDE ve stejném seznamu (M3, M5).
- Hlas při publikaci (TASK-83).

### Omezení

- Publikuje vždy uživatel; filtr jen předvybírá a potvrzení ukazuje, co odejde.
- Jistotu nesou jen nepublikované nálezy agenta; draft bez jistoty nebo závažnosti se řadí a filtruje předvídatelně.
- Texty v šesti jazycích, vzhled podle `docs/STYLEGUIDE.md`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Záložka draftů řadí nálezy podle priority odvozené ze závažnosti a jistoty; řazení jde přepnout na pořadí podle souboru
- [ ] #2 Filtry podle závažnosti, jistoty, autora a souboru zužují seznam; Vybrat podle filtru zaškrtne k publikaci právě zobrazené nálezy a potvrzení publikace uvede jejich počet
- [ ] #3 Ručně psané drafty bez závažnosti filtr nikdy neskryje bez viditelného upozornění, kolik draftů je skrytých
- [ ] #4 Odvození priority, řazení a filtrování jsou čisté sdílené funkce s testy; tiket nemění typy draftu ani parametry RPC, takže starší hostitel a starší mobilní klient se nedotknou
- [ ] #5 Seznam je ověřený ve skrytém okně na smyšleném pull requestu se snímkem
<!-- AC:END -->
