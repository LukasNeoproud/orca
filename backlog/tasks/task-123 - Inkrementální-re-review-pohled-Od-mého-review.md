---
id: TASK-123
title: 'Inkrementální re-review: pohled Od mého review'
status: To Do
assignee: []
created_date: '2026-11-19T09:36:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-89
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 209100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Po pushi autora dnes recenzent vidí znovu celý diff a sám hledá, co je nové. Záložka Files má umět ukázat jen rozdíl od bodu posledního review, který si od TASK-89 pamatuje hostitel.

### Rozsah

- Vstup: bod review (iterace, zdrojový commit) jako nepovinné pole detailu pull requestu z TASK-89.
- Změny mezi iteracemi: `listAzureDevOpsReviewIterationChanges` v `src/main/azure-devops/review/azure-devops-review-client.ts` má `$compareTo` natvrdo 0; rozdíl souboru mezi dvěma commity v `src/main/azure-devops/review/azure-devops-review-file-diff.ts`.
- Rozhraní: přepínač Vše a Od mého review v `src/renderer/src/components/azure-devops-review/AzureDevOpsReviewFiles.tsx` a `AzureDevOpsReviewAllChanges.tsx`.

### Mimo rozsah

- Úložiště bodu review, jeho zápis, příznak změny v seznamu a stav na stránce pull requestu: TASK-89.
- Posouzení otevřených vláken AI: TASK-90.
- Změny od review v pohledu Diff po celcích: řeší stav revize po hunkách ve vlastním tiketu.
- Pohled pro pull requesty GitHubu a GitLabu.

### Omezení

- Klient a hostitel se aktualizují nezávisle: nová pole nepovinná, nová metoda vyjednaná.
- Poloha vláken v diffu mezi iteracemi je předmětem TASK-76; tady ji neřeš.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Záložka Files má přepínač Vše a Od mého review; druhá volba ukáže jen soubory a rozdíly mezi zapamatovanou a poslední iterací, včetně smazaných a přejmenovaných souborů; totéž platí pro All changes
- [ ] #2 Když zapamatovaná iterace po přepsání historie neexistuje nebo ji nejde porovnat, zobrazí se celý diff se sdělením proč
- [ ] #3 Bez zapamatovaného bodu review se přepínač nenabízí
- [ ] #4 Starší hostitel bez porovnání iterací přepínač nenabídne a záložka Files funguje jako dosud; starší mobilní klient detail dál načte
- [ ] #5 Testy pokrývají porovnání iterací a přepsanou historii; pohled je ověřený ve skrytém okně proti smyšlenému serveru se dvěma iteracemi
<!-- AC:END -->
