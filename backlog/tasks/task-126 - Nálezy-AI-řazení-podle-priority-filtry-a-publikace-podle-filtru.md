---
id: TASK-126
title: 'Nálezy AI: řazení podle priority, filtry a publikace podle filtru'
status: Done
assignee: []
created_date: '2026-11-19T09:38:00Z'
updated_date: '2026-11-19T10:09:00Z'
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
- [x] #1 Záložka draftů řadí nálezy podle priority odvozené ze závažnosti a jistoty; řazení jde přepnout na pořadí podle souboru
- [x] #2 Filtry podle závažnosti, jistoty, autora a souboru zužují seznam; Vybrat podle filtru zaškrtne k publikaci právě zobrazené nálezy a potvrzení publikace uvede jejich počet
- [x] #3 Ručně psané drafty bez závažnosti filtr nikdy neskryje bez viditelného upozornění, kolik draftů je skrytých
- [x] #4 Odvození priority, řazení a filtrování jsou čisté sdílené funkce s testy; tiket nemění typy draftu ani parametry RPC, takže starší hostitel a starší mobilní klient se nedotknou
- [x] #5 Seznam je ověřený ve skrytém okně na smyšleném pull requestu se snímkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker): 1) src/shared/review-finding-priority.ts – priorita jako součet bodů za závažnost a jistotu (rozšiřitelné o další sčítance), test. 2) src/shared/review-finding-list-view.ts – řazení (priorita / soubor) a filtr (závažnost, jistota, autor, soubor) nad obecnou položkou, počty skrytých, test. 3) Renderer: nové soubory v azure-devops-review (filtrovací lišta s DropdownMenu podle AutomationListFilterMenu, upozornění na skryté drafty, řazení přes Select se zapamatováním v localStorage jako režim zobrazení Files), AzureDevOpsReviewDrafts jen zapojení; Vybrat podle filtru nahradí výběr zobrazenými; publikace stávajícím dialogem. 4) Lokalizace 6 jazyků, decision-10 jedna věta, docs 06 bod 6 stav. 5) E2E spec ve skrytém okně se záznamem požadavků.

Hotovo: sdílené funkce (review-finding-priority.ts, review-finding-list-view.ts) s testy; renderer (azure-devops-review-draft-list.ts, use-azure-devops-review-draft-list.ts, AzureDevOpsReviewDraftFilterMenu.tsx, AzureDevOpsReviewDraftListBar.tsx, zapojení v AzureDevOpsReviewDrafts.tsx); 16 klíčů v 6 jazycích. Zbývá: tc, lint, test komponenty, decision-10 věta, docs 06, e2e spec + snímky.

Hotovo navíc: test komponenty AzureDevOpsReviewDrafts.filter.test.tsx; decision-10 věta o prioritě; docs 06 bod 6 stav po TASK-126; e2e spec tests/e2e/pull-request-draft-priority-filter.spec.ts napsaný. tc, oxlint, code-quality:changed, ratchety (bez mých souborů) prochází. Zbývá: běh e2e (nový + ostatní pull-request-*.spec.ts) a snímky.

Ověřeno: e2e pull-request-draft-priority-filter.spec.ts (skryté okno, electron-headless, 1 worker, izolovaný HOME) prošel, snímky ~/.cache/orca-review-ide/task-126/01–07; všech 11 testů tests/e2e/pull-request-*.spec.ts prošlo. Všechna AC odškrtnutá. Tiket hotový, čeká na koordinátora.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Drafty pull requestu jde řadit podle priority nebo podle souboru a řádku a filtrovat podle závažnosti, jistoty, autora a souboru. Priorita je čistá funkce ve src/shared (body za závažnost plus za jistotu; vyvrácené nálezy jdou na konec, drafty bez závažnosti za drobnosti). Při aktivním filtru Select all vybere jen zobrazené drafty a upozornění řekne, kolik draftů filtr skrývá a kolik skrytých je vybraných. Publikace jde beze změny stávajícím dialogem včetně hlasu; e2e dokládá, že odejdou jen vybrané drafty. Řazení si stránka pamatuje v localStorage, filtr ne. Typy draftu ani parametry RPC se nezměnily. Ověřeno testy sdílených funkcí a komponenty a e2e ve skrytém okně; všech 11 specy pull requestu prošlo. Pořadí draftů bez závažnosti rozhodl koordinátor jako technickou věc (za drobnostmi, před vyvrácenými). Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
