---
id: TASK-65
title: Přehled TODO a FIXME ve workspace
status: To Do
assignee: []
created_date: '2026-11-18T12:43:00Z'
updated_date: '2026-11-18T21:22:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/07-funkce-z-ide.md
priority: low
type: feature
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Mít nedodělky z celého workspace na jednom místě, hlavně ty ve změněných souborech před odesláním pull requestu.

### Rozsah

- Hledání postav na stávajícím textovém hledání (`src/main/ripgrep/bundled-ripgrep-text-search.ts` a cesta, kterou používá panel Search). Na vzdáleném hostiteli přes `resolveRelayRipgrepCommand`.
- Umístění: přednostně jako pohled uvnitř panelu Search. Seznam tabů pravého sidebaru (`STATIC_RIGHT_SIDEBAR_TABS` v `src/shared/rpc-contract/client-ui-params.ts`) je součást kontraktu se spárovanými klienty a neznámý tab starší klient odmítne. Nový tab přidej jen s ošetřenou kompatibilitou.
- Seznam změněných souborů vezmi z porovnání větve s bází, které Orca už počítá.

### Mimo rozsah

- Zvýraznění TODO, která nechal agent; potřebuje původ změn z M7.
- Vlastní značky nad rámec TODO a FIXME.

### Omezení

- Nikdy holé `rg`; žádná záložní cesta přes git nebo procházení adresářů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pohled vypíše komentáře TODO a FIXME ze všech kořenů workspace seskupené po souborech, s řádkem a textem
- [ ] #2 Filtr omezí výpis na soubory změněné proti bázi větve
- [ ] #3 Klik na položku otevře soubor v editoru na daném řádku
- [ ] #4 Hledání běží přes ripgrep přibalený k Orce, lokálně i na SSH hostiteli
- [ ] #5 Pohled funguje ve folder workspace bez gitu; filtr změněných souborů se tam nenabízí
- [ ] #6 Výpis je omezený počtem položek a o oříznutí pohled informuje
- [ ] #7 Spárovaný klient se starší verzí dál načte rozložení pravého sidebaru
<!-- AC:END -->
