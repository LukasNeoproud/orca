---
id: TASK-121
title: 'Brány kvality: stav bran na kartě workspace v sidebaru'
status: To Do
assignee: []
created_date: '2026-11-19T09:35:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-86
documentation:
  - docs/review-ide/06-ai-a-review.md
  - docs/review-ide/03-rozlozeni.md
priority: high
type: feature
ordinal: 206100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Výsledek bran kvality má být vidět tam, kde uživatel sleduje workspace: na jeho kartě v sidebaru. Uživatel tak pozná, že brány selhaly, aniž by otevřel panel kontrol.

### Rozsah

- Karta workspace: precedentem je souhrn kontrol pull requestu (`src/renderer/src/components/sidebar/WorktreeCardStatusSlot.tsx`, `WorkspaceReviewChecksIndicator.tsx`, `WorktreeCardMetadataStatusBadges.tsx`). Komponenta stavu patří do `src/renderer/src/components/quality-gates/`; do karty jen registrace.
- Data ze stejného zdroje stavu jako oddíl místních bran v panelu Checks z TASK-86 (RPC `qualityGates.*` z TASK-85, `src/renderer/src/lib/quality-gate-client.ts`), včetně jeho samočinné obnovy.

### Mimo rozsah

- Oddíl místních bran v panelu Checks, spuštění a zrušení bran: TASK-86.
- Stav bran na stránce pull requestu a před založením pull requestu: TASK-104.
- Smyčka zpětné vazby agentovi a její stav: TASK-87.

### Omezení

- Seznam vlastností karty workspace (`WORKTREE_CARD_PROPERTIES` z `src/shared/worktree/card-properties.ts`, použitý v `src/shared/rpc-contract/client-ui-params.ts`) je součást kontraktu se spárovanými klienty; novou vlastnost nepřidávej, starší klient by rozložení odmítl.
- Stav agenta a souhrn kontrol pull requestu na kartě zůstávají čitelné; stav bran je nepřekrývá.
- Vzhled podle `docs/STYLEGUIDE.md`, stavové barvy jen ze stávajících tokenů, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Karta workspace v sidebaru ukazuje stav bran (prošly, selhaly, běží, zastaralé) a nepřekrývá stav agenta ani kontrol pull requestu; workspace bez nastavených bran neukazuje nic
- [ ] #2 Stav na kartě se po doběhnutí brány, po commitu a po úpravě souboru obnoví sám, bez ruční obnovy
- [ ] #3 SSH workspace ukazuje na kartě stav ze vzdáleného hostitele; při ztrátě spojení je stav unverifiable, ne selhání; folder workspace s nastavenými branami ukazuje stav stejně jako git worktree
- [ ] #4 Starší spárovaný klient dál načte kartu workspace; seznam vlastností karty se nemění
- [ ] #5 Komponenta stavu na kartě má testy a karta je ověřená ve skrytém okně se snímkem
<!-- AC:END -->
