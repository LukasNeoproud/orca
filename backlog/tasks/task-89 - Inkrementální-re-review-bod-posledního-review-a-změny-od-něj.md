---
id: TASK-89
title: 'Inkrementální re-review: bod posledního review a změny od něj'
status: To Do
assignee: []
created_date: '2026-11-18T15:18:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-83
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 209000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Po pushi autora dnes recenzent vidí znovu celý diff a sám hledá, co je nové. Orca si má pamatovat, kde review skončilo, upozornit na změnu a ukázat jen rozdíl od toho bodu.

### Rozsah

- Úložiště bodu review na pull request v hlavním procesu, vedle draftů (`src/main/azure-devops/review/azure-devops-review-draft-store.ts` je vzor: soubor v `~/.orca`, atomický zápis). Hodnota: iterace, zdrojový commit, čas. Dnes nic takového není; registr review worktree si pamatuje jen poslední checkout.
- Zápis bodu po úspěšné publikaci v `publishAzureDevOpsReviewDrafts` (`azure-devops-review-draft-actions.ts`) a ruční akcí na stránce pull requestu.
- Detail (`AzureDevOpsReviewDetail`) a seznam (`AzureDevOpsReviewListResult`, vedle `draftCounts`) v `src/shared/azure-devops-review-types.ts` dostanou bod jako nepovinné pole. Seznam už nese `sourceCommit`, takže příznak změny se spočítá bez dalších dotazů.
- Změny mezi iteracemi: `listAzureDevOpsReviewIterationChanges` v `azure-devops-review-client.ts` má `$compareTo` natvrdo 0; rozdíl souboru mezi dvěma commity v `azure-devops-review-file-diff.ts`.
- Rozhraní: `AzureDevOpsReviewFiles.tsx` a `AzureDevOpsReviewAllChanges.tsx` (přepínač), `AzureDevOpsPullRequestPage.tsx` (stav a ruční akce), `src/renderer/src/components/right-sidebar/AzureDevOpsPullRequestRow.tsx` (značka).

### Mimo rozsah

- Posouzení otevřených vláken AI: navazující tiket.
- Změny od review v pohledu Diff po celcích: řeší stav revize po hunkách ve vlastním tiketu.
- Bod review pro pull requesty GitHubu a GitLabu; typ úložiště ale pojmenuj obecně.

### Omezení

- Pravidelná kontrola nových pull requestů nesmí dostat žádný nový dotaz na Azure DevOps.
- Stav patří hostiteli, ne do `localStorage`: desktop i telefon musí vidět totéž.
- Klient a hostitel se aktualizují nezávisle: nová pole nepovinná, nová metoda vyjednaná.
- Poloha vláken v diffu mezi iteracemi je předmětem TASK-76; tady ji neřeš.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Po úspěšné publikaci draftů nebo hlasu si Orca zapamatuje iteraci a commit pull requestu; akce Označit jako zkontrolované udělá totéž bez publikace
- [ ] #2 Po pushi autora ukazuje řádek v panelu Pull requests i stránka pull requestu, že se pull request od review změnil; načtení seznamu kvůli tomu nepřidá žádný požadavek na pull request
- [ ] #3 Záložka Files má přepínač Vše a Od mého review; druhá volba ukáže jen soubory a rozdíly mezi zapamatovanou a poslední iterací, včetně smazaných a přejmenovaných souborů
- [ ] #4 Když zapamatovaná iterace po přepsání historie neexistuje nebo ji nejde porovnat, zobrazí se celý diff se sdělením proč
- [ ] #5 Bez zapamatovaného bodu se přepínač nenabízí; vlastní pull request bod review nemá
- [ ] #6 Bod review je uložený u hostitele, vidí ho desktop i spárovaný telefon jako nepovinné pole a přežije restart; starší klient i starší hostitel fungují dál
- [ ] #7 Testy pokrývají uložení bodu, porovnání iterací a přepsanou historii; pohled je ověřený ve skrytém okně proti smyšlenému serveru se dvěma iteracemi
<!-- AC:END -->
