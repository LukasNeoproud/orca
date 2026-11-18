---
id: TASK-77
title: Stránkovat seznam pull requestů a dohledání dokončených pull requestů
status: To Do
assignee: []
created_date: '2026-11-18T13:20:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/01-integrace.md
priority: medium
type: bug
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Obě čtení seznamu pull requestů berou jen první stránku a o oříznutí mlčí. Uživatel pak ve filtru Vše nevidí starý otevřený pull request a úklid větví nepozná starou větev sloučenou přes squash.

### Rozsah

- `src/main/azure-devops/review/azure-devops-review-client.ts` (`listAzureDevOpsRepositoryPullRequests`, `$top=100`) a `azure-devops-review-service.ts` (`listAzureDevOpsReviewPullRequests`): stav `all` nesmí ztratit aktivní pull requesty; výsledek nese příznak oříznutí na repozitář.
- `src/renderer/src/components/right-sidebar/AzureDevOpsPullRequestsPanel.tsx`: sdělení o oříznutí a načtení dalších.
- `src/main/azure-devops/completed-pull-request-heads.ts` (`PAGE_SIZE = 500`): stránkování přes `$skip`.
- Zjištění z TASK-67 proti skutečné organizaci: `$top=500` i `$skip=500` API přijímá, `$top=1000` vrátí víc než 500 položek; repozitář se stovkami dokončených pull requestů do jedné cílové větve je běžný; ve filtru Vše chyběl aktivní pull request starý několik měsíců.

### Mimo rozsah

- Mazání větví a jeho důkazy v `src/main/git/merged-branch-cleanup.ts`.
- Řazení a seskupení seznamu (TASK-63).

### Omezení

- Šetřit počet dotazů: další stránky uzavřených pull requestů až na žádost uživatele.
- Starší mobilní klient dostane stejný tvar odpovědi; příznak oříznutí je volitelné pole.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Filtr Vše ukáže každý aktivní pull request, který ukazuje filtr Aktivní, i když je starší než sto novějších uzavřených
- [ ] #2 Když Azure DevOps vrátí plnou stránku a seznam je oříznutý, panel to řekne a nabídne načtení dalších
- [ ] #3 Dohledání dokončených pull requestů pro úklid větví projde další stránky do rozumného stropu a najde i pull request starší než pět set novějších
- [ ] #4 Testy pokrývají plnou stránku, poslední neúplnou stránku, strop počtu stránek a selhání druhé stránky (výsledek první zůstane použitelný)
- [ ] #5 Repozitář jiného poskytovatele než Azure DevOps a SSH repozitář se chovají jako dosud
<!-- AC:END -->
