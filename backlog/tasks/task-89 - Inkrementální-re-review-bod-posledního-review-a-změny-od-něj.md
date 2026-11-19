---
id: TASK-89
title: 'Inkrementální re-review: bod posledního review a příznak změny'
status: To Do
assignee: []
created_date: '2026-11-18T15:18:00Z'
updated_date: '2026-11-19T09:36:00Z'
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

Po pushi autora dnes recenzent vidí znovu celý diff a sám hledá, co je nové. Orca si má pamatovat, kde review skončilo, a upozornit na změnu; pohled jen na rozdíl od toho bodu dodá TASK-123.

### Rozsah

- Úložiště bodu review na pull request v hlavním procesu, vedle draftů (`src/main/azure-devops/review/azure-devops-review-draft-store.ts` je vzor: soubor v `~/.orca`, atomický zápis). Hodnota: iterace, zdrojový commit, čas. Dnes nic takového není; registr review worktree si pamatuje jen poslední checkout.
- Zápis bodu po úspěšné publikaci v `publishAzureDevOpsReviewDrafts` (`azure-devops-review-draft-actions.ts`) a ruční akcí na stránce pull requestu.
- Detail (`AzureDevOpsReviewDetail`) a seznam (`AzureDevOpsReviewListResult`, vedle `draftCounts`) v `src/shared/azure-devops-review-types.ts` dostanou bod jako nepovinné pole. Seznam už nese `sourceCommit`, takže příznak změny se spočítá bez dalších dotazů.
- Rozhraní: `src/renderer/src/components/azure-devops-review/AzureDevOpsPullRequestPage.tsx` (stav a ruční akce), `src/renderer/src/components/right-sidebar/AzureDevOpsPullRequestRow.tsx` (značka).

### Mimo rozsah

- Pohled Od mého review (porovnání iterací, rozdíl souboru mezi commity, přepínač ve Files a All changes): TASK-123.
- Posouzení otevřených vláken AI: TASK-90.
- Změny od review v pohledu Diff po celcích: řeší stav revize po hunkách ve vlastním tiketu.
- Bod review pro pull requesty GitHubu a GitLabu; typ úložiště ale pojmenuj obecně.

### Omezení

- Pravidelná kontrola nových pull requestů nesmí dostat žádný nový dotaz na Azure DevOps.
- Stav patří hostiteli, ne do `localStorage`: desktop i telefon musí vidět totéž.
- Klient a hostitel se aktualizují nezávisle: nová pole nepovinná, nová metoda vyjednaná.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Po úspěšné publikaci draftů nebo hlasu si Orca zapamatuje iteraci a commit pull requestu; akce Označit jako zkontrolované udělá totéž bez publikace
- [ ] #2 Po pushi autora ukazuje řádek v panelu Pull requests i stránka pull requestu, že se pull request od review změnil; načtení seznamu kvůli tomu nepřidá žádný požadavek na pull request
- [ ] #3 Vlastní pull request bod review nemá
- [ ] #4 Bod review je uložený u hostitele, vidí ho desktop i spárovaný telefon jako nepovinné pole a přežije restart; starší klient i starší hostitel fungují dál
- [ ] #5 Testy pokrývají uložení bodu, zápis po publikaci a ruční akcí a příznak změny; značka v seznamu a stav na stránce jsou ověřené ve skrytém okně proti smyšlenému serveru se dvěma iteracemi
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rozděleno 2026-11-19 podle pravidla velikosti: TASK-123 převzal pohled Od mého review (porovnání iterací, rozdíl souboru mezi commity, přepínač ve Files a All changes).
<!-- SECTION:NOTES:END -->
