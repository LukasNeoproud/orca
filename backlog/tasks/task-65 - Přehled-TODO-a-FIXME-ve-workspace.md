---
id: TASK-65
title: Přehled TODO a FIXME ve workspace
status: Done
assignee: []
created_date: '2026-11-18T12:43:00Z'
updated_date: '2026-11-18T21:50:00Z'
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
- [x] #1 Pohled vypíše komentáře TODO a FIXME ze všech kořenů workspace seskupené po souborech, s řádkem a textem
- [x] #2 Filtr omezí výpis na soubory změněné proti bázi větve
- [x] #3 Klik na položku otevře soubor v editoru na daném řádku
- [x] #4 Hledání běží přes ripgrep přibalený k Orce, lokálně i na SSH hostiteli
- [x] #5 Pohled funguje ve folder workspace bez gitu; filtr změněných souborů se tam nenabízí
- [x] #6 Výpis je omezený počtem položek a o oříznutí pohled informuje
- [x] #7 Spárovaný klient se starší verzí dál načte rozložení pravého sidebaru
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: pohled TODO jako režim uvnitř zobrazení Contents (Search) v průzkumníku, stav jen v paměti rendereru (nový zustand store), takže se nemění STATIC_RIGHT_SIDEBAR_TABS ani perzistovaný RightSidebarExplorerView a starší spárovaný klient nic nového nedostane. Hledání přes searchRuntimeFiles (fs:search lokálně / files.search na runtime hostiteli včetně SSH), tj. runBundledRipgrepTextSearch s regexem na komentář + TODO|FIXME, limit 1000. Výsledky přes existující SearchResultsPane/buildSearchRows/openMatchResult. Filtr změněných souborů = gitStatusByWorktree + gitBranchChangesByWorktree (stav ready) ze store; include globy ukotvené na kořen, jinak klientský filtr. Folder workspace bez gitu filtr nenabízí. Kód v src/renderer/src/components/todo-overview/, do FileExplorer.tsx jen registrace; e2e ve skrytém okně.

Hotovo: src/renderer/src/components/todo-overview/ (store, hook hledání, panel, hlavička), src/shared/todo-comment-search.ts (dotaz, limit 1000, include globy), registrace ve FileExplorer.tsx, klíče todoOverview.* v 6 jazycích, docs 07 bod 8. Testy: unit (shared, renderer hook, reálný rg v src/main/ripgrep/todo-comment-search-real.test.ts), e2e tests/e2e/todo-overview.spec.ts ve skrytém okně, snímky ~/.cache/orca-review-ide/task-65/01..06. Zbývá: nic; SSH ověřeno jen přes směrování (unit), ne živým SSH hostitelem.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
V panelu Search (Contents) přibyl pohled TODO and FIXME: vypíše komentáře se značkou TODO nebo FIXME po souborech s řádkem a textem, klik otevře soubor na značce. Přepínač Only files changed on this branch zúží výpis na soubory změněné proti bázi (porovnání z panelu Source Control) a necommitnuté změny; ve folder workspace bez gitu se přepínač nenabízí. Hledání jde stávající cestou textového hledání (lokálně přibalený ripgrep, na vzdáleném hostiteli files.search), kontrakt se spárovanými klienty se nezměnil a stav pohledu se neukládá. Výpis je omezený na 1000 výsledků s hláškou o oříznutí; limit vynutí i klient proti staršímu hostiteli. Ověřeno testy se skutečným ripgrepem, testem směrování a e2e ve skrytém okně; živý SSH hostitel ověřen nebyl. Omezení: komentář se pozná jen podle otevírací značky těsně před TODO nebo FIXME; dokud v Source Control neproběhlo porovnání s bází, filtr počítá jen necommitnuté změny a nabídne odkaz na porovnání. Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
