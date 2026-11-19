---
id: TASK-140
title: >-
  Oprava nálezů kontroly před akceptací M1: kotvy vláken, Open in diff,
  mezipaměť řádků a gutter Annotate
status: To Do
assignee: []
created_date: '2026-11-19T22:17:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-1
dependencies: []
priority: high
type: bug
ordinal: 100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Nezávislá kontrola změn před akceptací M1 (2026-11-19) našla čtyři neověřené nálezy v review Azure DevOps a v Annotate. Ověř je a potvrzené oprav.

### Nálezy

1. src/main/azure-devops/review/azure-devops-review-thread-tracking.ts (kolem řádku 139 a 186): když se verze souboru nenačte (vyčerpaný rozpočet požadavků, chyba sítě, binární nebo velký soubor), vlákno přijde o kotvu a označí se jako outdated, i když se kód nezměnil.
2. src/renderer/src/components/azure-devops-review/AzureDevOpsReviewFiles.tsx (kolem řádku 161) a use-azure-devops-review-diff-reveal.ts: požadavek Open in diff se nevymaže, skok na řádek se opakuje při návratu k souboru nebo přepnutí záložky.
3. src/main/azure-devops/review/azure-devops-review-file-line-cache.ts (řádek 29): remember() přičítá znaky i při přepisu existujícího klíče, počítadlo roste nad skutečnou velikost a mezipaměť pak vyhazuje vše.
4. src/renderer/src/components/git-annotate/git-annotate-gutter-html.ts (řádek 80): commit.id jde do HTML gutteru bez escapování; u vzdáleného hostitele klient tvar odpovědi git.blame nekontroluje.

### Omezení

- Do Azure DevOps se nezapisuje. Vzdálený hostitel může být starší nebo novější; kontrola odpovědi nesmí odmítnout platnou odpověď staršího hostitele.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Každý ze čtyř nálezů je ověřený reprodukcí nebo testem; nepotvrzený je zapsaný s důvodem
- [ ] #2 Vlákno, jehož verzi souboru se nepodařilo načíst, zůstane na původní kotvě a není označené jako outdated
- [ ] #3 Skok Open in diff proběhne jednou; návrat k souboru ani přepnutí záložky ho neopakuje
- [ ] #4 Počítadlo velikosti mezipaměti řádků souborů odpovídá obsahu i při přepisu téhož klíče
- [ ] #5 Identifikátor commitu v gutteru Annotate je escapovaný a odpověď git.blame od vzdáleného hostitele se před použitím kontroluje
- [ ] #6 Každá oprava má test
<!-- AC:END -->
