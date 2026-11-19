---
id: TASK-141
title: 'Oprava nálezů kontroly před akceptací M1: brány kvality a smyčka zpětné vazby'
status: Done
assignee: []
created_date: '2026-11-19T22:17:00Z'
updated_date: '2026-11-19T23:37:00Z'
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
- [x] #1 Každý ze šesti nálezů je ověřený reprodukcí nebo testem; nepotvrzený je zapsaný s důvodem
- [x] #2 Začátek tahu s vlastním markerem, který přijde před dokončením doručení, smyčku nezastaví jako zprávu uživatele
- [x] #3 Výjimka odběratele změn neoznačí běh jako nespuštěný a nezablokuje frontu běhů worktree
- [x] #4 Zrušení nebo timeout brány ve WSL ukončí i potomky příkazu, nebo je omezení zapsané v dokumentaci a záznam běhu netvrdí, že proces skončil
- [x] #5 Dotaz na stav bran nečte a neparsuje celé úložiště běhů při každém volání a stav zdroje se při častých dotazech nepočítá pokaždé znovu
- [x] #6 Každá oprava má test; starší klient i hostitel fungují dál
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker 2026-11-20): 1) číst a potvrdit každý nález testem, 2) opravy 1,3,4 (stav smyčky před deliver, onRunChanged v try, WSL process group termination), 3) změřit 5 a 6 (300 běhů, tisíce změněných souborů) a opravit jen potvrzené, 4) nález 2: hledat pravidlo bez čtení obrazovky, jinak nechat a navrhnout tiket.

Stav: opravy 1 (outgoing v řetězu, test quality-gate-feedback-loop-early-turn.test.ts), 3 (onRunChanged v try), 4 (guestTermination v runWslProcess), 5 (parse jen po změně souboru), 6 (quality-gate-source-reader.ts + dávkový lstat) napsané, testy běží. Nález 2 ponechán: bezpečné pravidlo bez čtení obrazovky nenalezeno. Měření: úložiště 300 běhů 10,4 MB: list/get 6,6 ms, put 15,9 ms; strom 3000 změn: status 49 ms, z toho 2000 lstat sekvenčně 25 ms (paralelně 3 ms). Zbývá: ověřit selhání testů proti HEAD, tc, lint, brány.

Hotovo (worker 2026-11-20): nálezy 1, 3, 4, 5, 6 opravené s testy; nové testy proti kódu z HEAD selhávají (7 testů), s opravou prochází. Kritérium 3 nesplněno: nález 2 potvrzen (hostitel zná jen čas posledního vstupu, quality-gate-feedback-delivery.test.ts 'writes nothing when somebody typed...'), ale pravidlo bez čtení obrazovky není bezpečné: (a) koncept napsaný při práci agenta a pozdější potvrzení dotazu, (b) koncept napsaný po potvrzení dotazu, než přijde další hook (u dlouhého nástroje minuty). Obojí by se s jediným časem posledního vstupu doručením odeslalo spolu se zprávou. Chování ponecháno, popsáno v 06-ai-a-review.md; navržen navazující tiket. Po opravě: list/get úložiště 0,01 ms (dřív 6,6 ms), put 16 ms beze změny; stav stromu 3000 změn 25 ms (dřív 49 ms). WSL neověřeno na skutečném systému. Ověření: pnpm tc, oxlint, check:code-quality:changed, audit:anti-slop, 46 testových souborů quality-gates + wsl + rpc.

Nález 2 (psaný vstup blokuje doručení) je potvrzený a neopravený: bez evidence jednotlivých vstupů by se rozepsaný text uživatele mohl odeslat spolu se zprávou bran. Kritérium převzal TASK-143.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pět ze šesti nálezů potvrzeno a opraveno s testy: začátek tahu během doručení se vyhodnotí až po návratu doručení (smyčka si vlastní zprávu nevyloží jako zprávu uživatele); výjimka odběratele změn nezablokuje frontu běhů; brána ve WSL běží ve vlastní skupině procesů a zrušení i limit ukončí potomky (BusyBox bez setsid --wait zapsán jako omezení); úložiště běhů se parsuje jen po změně souboru (čtení 6,6 ms → 0,01 ms při 300 bězích); stav stromu sdílí jedno čtení na 250 ms a lstat běží po dávkách (49 → 25 ms při 3000 cestách). Nález o psaném vstupu je potvrzený a neopravený, převzal ho TASK-143. Neověřeno: skutečné WSL a Windows, skuteční agenti. Ověřeno: tc, 265 testů, brána změněných řádků, anti-slop.
<!-- SECTION:FINAL_SUMMARY:END -->
