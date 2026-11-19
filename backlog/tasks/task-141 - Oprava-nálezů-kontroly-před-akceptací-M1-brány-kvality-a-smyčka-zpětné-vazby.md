---
id: TASK-141
title: 'Oprava nálezů kontroly před akceptací M1: brány kvality a smyčka zpětné vazby'
status: To Do
assignee: []
created_date: '2026-11-19T22:17:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies: []
priority: high
type: bug
ordinal: 200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Nezávislá kontrola změn před akceptací M1 (2026-11-19) našla šest neověřených nálezů v branách kvality. Ověř je a potvrzené oprav.

### Nálezy

1. src/main/quality-gates/quality-gate-feedback-loop.ts (kolem řádku 169 a 262): lastMarker a pendingTurn se nastaví až po deps.deliver(), ale turn-started může přijít dřív; smyčka pak vlastní zprávu vyloží jako zprávu uživatele a zastaví se.
2. src/main/quality-gates/quality-gate-feedback-delivery.ts (řádek 78): jakýkoli psaný vstup od začátku tahu (i potvrzení dotazu na oprávnění) zablokuje doručení. Navrhni přesnější pravidlo; pravidla nad obrazovkou terminálu jen proti zachyceným přepisům v repozitáři (AGENTS.md, Agent Terminal Screens).
3. src/main/quality-gates/quality-gate-service.ts (řádek 84 a 161): onRunChanged se volá mimo try; výjimka odběratele může natrvalo zablokovat frontu běhů worktree.
4. src/main/quality-gates/quality-gate-command-run.ts (řádek 61): cesta přes runWslProcess nemá terminationBarrier jako nativní větev; po zrušení nebo timeoutu běží potomci ve WSL dál.
5. src/main/quality-gates/quality-gate-run-store.ts (řádek 134): každé list/get/put synchronně čte a parsuje celý soubor v hlavním procesu, každá změna ho celý přepisuje.
6. src/main/quality-gates/quality-gate-source-state.ts (řádek 68): každý dotaz spustí git status a až 2000 sekvenčních lstat.

### Omezení

- Skutečné agenty nespouštěj. WSL nejde na tomto stroji ověřit; zapiš, co zůstalo neověřené.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Každý ze šesti nálezů je ověřený reprodukcí nebo testem; nepotvrzený je zapsaný s důvodem
- [ ] #2 Začátek tahu s vlastním markerem, který přijde před dokončením doručení, smyčku nezastaví jako zprávu uživatele
- [ ] #3 Potvrzení dotazu agenta klávesou během tahu doručení zpětné vazby nezablokuje; rozepsaný neodeslaný vstup uživatele ho dál zadrží
- [ ] #4 Výjimka odběratele změn neoznačí běh jako nespuštěný a nezablokuje frontu běhů worktree
- [ ] #5 Zrušení nebo timeout brány ve WSL ukončí i potomky příkazu, nebo je omezení zapsané v dokumentaci a záznam běhu netvrdí, že proces skončil
- [ ] #6 Dotaz na stav bran nečte a neparsuje celé úložiště běhů při každém volání a stav zdroje se při častých dotazech nepočítá pokaždé znovu
- [ ] #7 Každá oprava má test; starší klient i hostitel fungují dál
<!-- AC:END -->
