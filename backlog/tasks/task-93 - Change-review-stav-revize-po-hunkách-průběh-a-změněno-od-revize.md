---
id: TASK-93
title: 'Change review: stav revize po hunkách, průběh a změněno od revize'
status: To Do
assignee: []
created_date: '2026-11-18T15:19:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-92
documentation:
  - docs/review-ide/05-funkce.md
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 213000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Recenzent si má odškrtávat, co už viděl, a po dalším pushi číst jen to, co se změnilo. Pro Diff po celcích je to zároveň inkrementální re-review: diff od posledního review vyplyne z toho, které hunky jsou nové.

### Rozsah

- Úložiště stavu v hlavním procesu hostitele, který worktree vlastní. Klíč je repozitář a předmět revize (větev; u review worktree s odpojeným HEAD pull request), hodnota stav hunku podle klíče hunku z TASK-91 a poslední zkontrolovaný head. Atomický zápis (`src/main/durable-file-write.ts`), zápisy sdružené v čase. Do metadat worktree stav nepatří: jsou to tisíce položek.
- RPC `changeReview.getState` a dávkové `changeReview.setHunkState`.
- Nový manifest: hunk se známým klíčem převezme stav; ostatní jsou nezkontrolované a nesou značku změny, pokud jejich soubor stav měl. Přejmenování souboru mezi dvěma heady stav přenese.
- Rozhraní v `src/renderer/src/components/change-review/`: zaškrtnutí u hunku, souboru a skupiny, průběh, Další nezkontrolované, filtr.
- Poznámky v diffu (`DiffComment` v `src/shared/diff-comment-types.ts`) dostanou nepovinný klíč hunku jako kotvu, která přežije push.

### Mimo rozsah

- Zápis stavu do Azure DevOps nebo synchronizace s označením Viewed na GitHubu.
- Bod posledního review pull requestu Azure DevOps a pohled Od mého review na stránce pull requestu (TASK-89).
- Stav revize v mobilní aplikaci; RPC ale navrhni tak, aby ho mobil mohl později použít.
- Hromadné schválení bezpečných skupin: tiket o riziku.

### Omezení

- Stav musí přežít smazání worktree; proto se neklíčuje cestou ani identifikátorem worktree.
- Klávesové zkratky podle platformy; žádné natvrdo `metaKey`.
- `DiffComment` čtou i starší klienti a telefon: nové pole jen nepovinné.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Zaškrtnutí Zkontrolováno u hunku, souboru nebo skupiny přežije zavření pohledu, restart aplikace i smazání a nové vytvoření worktree téže větve
- [ ] #2 Po commitu, který změní jeden soubor, zůstanou ostatní hunky zkontrolované; změněné jsou nezkontrolované se značkou změněno od revize
- [ ] #3 Po rebase na novou bázi a po přejmenování souboru se stav přenese u hunků se stejným klíčem
- [ ] #4 Přehled a skupiny ukazují průběh; akce Další nezkontrolované skočí na další hunk zkratkou s ⌘ na Macu a Ctrl na Windows a Linuxu
- [ ] #5 Filtr Změněno od revize ukáže jen hunky nové nebo změněné od posledního zkontrolovaného stavu
- [ ] #6 Poznámka v diffu u hunku, který se změnil, je označená jako zastaralá; u nezměněného hunku zůstane na místě i po posunu řádků
- [ ] #7 Review worktree pull requestu s odpojeným HEAD drží stav podle pull requestu; SSH worktree má stav na svém hostiteli; starší vzdálený hostitel ukáže pohled bez zaškrtávání
- [ ] #8 Testy pokrývají přenos stavu po commitu, rebase a přejmenování; pohled je ověřený ve skrytém okně na smyšleném repozitáři se dvěma commity
<!-- AC:END -->
