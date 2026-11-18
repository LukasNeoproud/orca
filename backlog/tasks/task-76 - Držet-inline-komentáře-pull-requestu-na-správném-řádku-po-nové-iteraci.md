---
id: TASK-76
title: Držet inline komentáře pull requestu na správném řádku po nové iteraci
status: To Do
assignee: []
created_date: '2026-11-18T13:20:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/01-integrace.md
priority: high
type: bug
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Azure DevOps vrací polohu vlákna vůči iteraci, na které komentář vznikl. Orca ji dnes přikládá na diff poslední iterace, takže po dalším pushi komentář ukazuje na jiný kód. Recenzent i autor musí vidět komentář u kódu, ke kterému patří.

### Rozsah

- `src/main/azure-devops/review/azure-devops-review-client.ts` (`listAzureDevOpsReviewThreads`) a `azure-devops-review-mappers.ts` (`mapAnchor`, `mapAzureDevOpsReviewThread`): poloha vlákna přepočtená na poslední iteraci.
- Zjištění z TASK-67 proti skutečné organizaci: `threadContext` nese původní řádky; `pullRequestThreadContext.iterationContext` říká, na které iteraci vlákno vzniklo. Dotaz na vlákna s `$iteration=<poslední>&$baseIteration=<původní>` vrátí `pullRequestThreadContext.trackingCriteria` (`origRightFileStart`, porovnávané iterace) a `threadContext` už bez `rightFileStart`; samotné `$iteration` polohu nezmění. Ve vzorku s deseti vlákny z první iterace mělo po čtvrté iteraci sedm z nich na původním čísle řádku jiný text.
- Nejdřív zjistit, jak polohu sleduje webové rozhraní Azure DevOps (parametry dotazu, nebo přepočet z diffu iterací), a zvolit jednu cestu. Záložní cesta bez API: přepočet řádku z rozdílu obsahu souboru mezi původní a poslední iterací.
- `src/renderer/src/components/azure-devops-review/azure-devops-review-inline-comments.ts` a mobilní obrazovka vláken: označení zastaralého vlákna.

### Mimo rozsah

- Poloha draftů: ty už nesou iteraci a značí se jako zastaralé.
- Publikace odpovědí a změna stavu vlákna.

### Omezení

- Jen čtení z Azure DevOps. Odpověď hostitele čtou i starší mobilní klienti: nová pole jen volitelná.
- Do testů a tiketu nepatří data ze skutečných pull requestů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Vlákno založené na starší iteraci se v diffu poslední iterace zobrazí u řádku, kam se komentovaný kód posunul
- [ ] #2 Vlákno, jehož řádek v poslední iteraci zanikl nebo ho nejde dohledat, je označené jako zastaralé a není připnuté k nesouvisejícímu řádku
- [ ] #3 Seznam vláken, CLI `orca ado pr` a MCP vracejí stejnou polohu jako diff na desktopu; starší mobilní klient dál dostane platnou odpověď
- [ ] #4 Testy mapování pokrývají vlákno z první iterace u pull requestu se čtyřmi iteracemi: posunutý řádek, změněný řádek a nezměněný řádek
- [ ] #5 Chování je ověřené čtením proti skutečnému pull requestu s více iteracemi ve skrytém okně
<!-- AC:END -->
