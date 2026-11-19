---
id: TASK-121
title: 'Brány kvality: stav bran na kartě workspace v sidebaru'
status: Done
assignee: []
created_date: '2026-11-19T09:35:00Z'
updated_date: '2026-11-19T21:29:00Z'
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
- [x] #1 Karta workspace v sidebaru ukazuje stav bran (prošly, selhaly, běží, zastaralé) a nepřekrývá stav agenta ani kontrol pull requestu; workspace bez nastavených bran neukazuje nic
- [x] #2 Stav na kartě se po doběhnutí brány, po commitu a po úpravě souboru obnoví sám, bez ruční obnovy
- [x] #3 SSH workspace ukazuje na kartě stav ze vzdáleného hostitele; při ztrátě spojení je stav unverifiable, ne selhání; folder workspace s nastavenými branami ukazuje stav stejně jako git worktree
- [x] #4 Starší spárovaný klient dál načte kartu workspace; seznam vlastností karty se nemění
- [x] #5 Komponenta stavu na kartě má testy a karta je ověřená ve skrytém okně se snímkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán workera (2026-11-19): (1) Karta: komponenta WorkspaceQualityGatesCardIndicator v components/quality-gates, registrace jedním řádkem v worktree-card-header (řádek titulku, mimo stavový pruh agenta/PR); nová vlastnost karty se nepřidává. (2) Zátěž: místní repozitář bez bran nečte nic; jinak jedno čtení status a odběr až když hostitel vrátí aspoň jednu bránu. Aktivní workspace odebírá jako panel (strom po 3 s), ostatní karty s nepovinným parametrem cadence:'background' (běhy hned, strom po 30 s). Nová schopnost quality-gates.subscribe-cadence.v1; hostitel bez ní se u neaktivních karet neodebírá, klient se ptá po 30 s. (3) Testy: feed, RPC (starší klient bez parametru, neznámá hodnota), klient/hook (starší hostitel), komponenta, kompatibilita vlastností karty, e2e ve skrytém okně.

Stav (worker): hotovo a jednotkově otestováno: hostitel (feed s pomalým intervalem, parametr cadence, schopnost subscribe-cadence), klient a hook (režim background), komponenta WorkspaceQualityGatesCardIndicator + registrace v worktree-card-header, texty v 6 jazycích, test kompatibility vlastností karty. Zbývá: e2e ve skrytém okně se snímkem, brány kvality kódu, dokumentace.

Dokončeno workerem 2026-11-19, čeká na ověření koordinátorem.

Rozhodnutí o zátěži (se zdůvodněním): karta je v sidebaru pro každý workspace a odběr dnes znamená čtení stavu stromu po 3 s na worktree, i přes SSH. Proto: (a) karta místního repozitáře bez bran nečte nic (definice má tato aplikace); u workspace cizího hostitele přečte status jednou a bez bran skončí, bez proudu i intervalu; (b) odběr otevře jen karta, které hostitel vrátil aspoň jednu bránu; (c) karta aktivního workspace odebírá jako panel (strom po 3 s, jeden worktree), ostatní posílají nepovinný parametr cadence:'background' — běhy hostitel hlásí hned, strom čte po 30 s, jednou na worktree bez ohledu na počet odběratelů; odběratel v popředí interval pro ten worktree zrychlí; (d) parametr umí jen hostitel se schopností quality-gates.subscribe-cadence.v1; hostitel bez ní by parametr zahodil a hlídal po 3 s každou kartu, proto se u něj karty v pozadí neodebírají a ptají se po 30 s (při běžící bráně po 5 s). Varianta 'neaktivní hlídá jen běhy' zamítnuta: agent v pozadí mění soubory a zastaralost je tam nejdůležitější. Žádný nový opcode ani rámec; starší klient parametr neposílá, neznámou hodnotu hostitel čte jako výchozí.

Vzhled: značka štítu (lucide Shield*) v řádku titulku karty, mimo stavový pruh agenta/PR; tóny jen text-status-success, text-destructive, text-status-warning, text-muted-foreground. Stavy: running, failed, unknown, outdated, passed, incomplete; nic, dokud žádná brána neběžela. Ztráta spojení = unknown s posledním známým stavem v tooltipu.

Ověření: tc 0; vitest (quality-gates main/renderer/shared, sidebar 368 souborů) prošel, jediný pád host-operation-ownership (androidAppRun.*) je známý z TASK-112; oxlint 0; check:code-quality:changed 0 nálezů; anti-slop, focus-read a layout-writer ratchety bez mých souborů; max-lines ratchet OK; katalog RPC přegenerovaný a ověřený; e2e tests/e2e/quality-gates-workspace-card.spec.ts ve skrytém okně prošel 2x, snímky ~/.cache/orca-review-ide/task-121/01..06-*.png. Výhrady: skutečný vzdálený hostitel, Windows/WSL a mobilní klient neověřeny; přímé ssh: hostitel dál neobsluhuje (karta neukáže nic); folder workspace skupiny projektů brány nemá.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Karta workspace v sidebaru ukazuje vedle názvu značku stavu bran (prošly, selhaly, běží, zastaralé, neúplné, nelze ověřit); bez nastavených bran a před prvním během neukazuje nic. Stav se obnovuje sám přes odběr z TASK-86. Zátěž: karta bez bran se hostitele neptá, aktivní workspace hlídá strom po 3 s, ostatní po 30 s přes nový nepovinný parametr cadence (schopnost quality-gates.subscribe-cadence.v1); u staršího hostitele se karty v pozadí dotazují po 30 s. Seznam vlastností karty se nezměnil. Neověřeno: skutečný vzdálený hostitel, Windows/WSL, mobilní klient; workspace přes přímé SSH stav nemá. Ověřeno: tc, 77 testů, brána změněných řádků, anti-slop, lokalizace, e2e ve skrytém okně se snímky.
<!-- SECTION:FINAL_SUMMARY:END -->
