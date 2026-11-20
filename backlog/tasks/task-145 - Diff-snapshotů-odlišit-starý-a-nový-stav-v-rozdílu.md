---
id: TASK-145
title: 'Diff snapshotů: odlišit starý a nový stav v rozdílu'
status: Done
assignee: []
created_date: '2026-11-20T09:14:00Z'
updated_date: '2026-11-20T10:01:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
priority: high
type: bug
ordinal: 20
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připomínka uživatele z akceptace M1 (2026-11-20): v pohledu Snapshots jsou změny červené a původní části černobílé. Rozdíl je červený podle starého i nového obrázku, takže posunutý text vypadá jako dva červené texty pod sebou a nejde poznat, co je starý a co nový stav.

### Rozsah

- Pohled Snapshots z TASK-64 (rozpoznání v src/shared/snapshot-image-path.ts, výpočet rozdílu ve Web Workeru): rozdíl rozliš podle toho, ze které strany pixel pochází.
- Způsob prohlížení, ve kterém je vidět starý a nový stav přes sebe (přepínání, prolnutí nebo posuvník); vyber jeden, který jde udělat nad stávajícími komponentami.

### Omezení

- Vzhled podle docs/STYLEGUIDE.md, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 V pohledu rozdílu je poznat, co bylo v původním obrázku a co je v novém: posunutý text se ukáže jako starý a nový stav ve dvou odlišných barvách, ne jako dva stejné červené texty
- [x] #2 Barvy jsou ze stávajících tokenů (odebráno a přidáno jako v diffu kódu) a pohled má legendu
- [x] #3 Jde přepnout mezi rozdílem a prolnutím nebo překryvem starého a nového obrázku, aby šla regrese posoudit okem
- [x] #4 Výpočet zůstává ve Web Workeru a limit 8 megapixelů platí dál; testy výpočtu pokrývají přidané, odebrané a posunuté pixely; pohled je ověřený ve skrytém okně se snímkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker): (1) čistý výpočet stran v components/snapshot-diff/snapshot-pixel-sides.ts: změněný pixel je přidaný, když se nový obrázek víc liší od pozadí oblasti (nejčastější nezměněná barva v okolí oblasti změny) než starý, jinak odebraný; testy přidaných, odebraných a posunutých pixelů. (2) Worker kreslí odebrané barvou --git-decoration-deleted a přidané --git-decoration-added, výsledek nese počty obou; limit 8 MP beze změny. (3) Pohled: legenda u rozdílu, přepínač Rozdíl / Prolnutí (třetí panel: před a po přes sebe s posuvníkem průhlednosti nad ImageDiffPane overlay). (4) Lokalizace 6 jazyků, testy komponenty, e2e ve skrytém okně se smyšleným posunutým textem, snímky do ~/.cache/orca-review-ide/task-145, úprava 05-funkce.md §10.

Stav 1: hotový výpočet stran (snapshot-change-sides.ts + testy), worker a hook kreslí odebrané/přidané barvami --git-decoration-deleted/added, pohled má legendu a přepínač Rozdíl/Prolnutí s posuvníkem (SnapshotDiffToolbar, SnapshotBlendPane, snapshot-diff-display); testy komponenty a pnpm tc:web prochází. Zbývá: lokalizace 6 jazyků, e2e se smyšleným posunutým textem a snímky, 05-funkce.md, brány.

Stav 2 (hotovo): lokalizace 6 jazyků (7 klíčů snapshotDiff.*), e2e tests/e2e/snapshot-diff.spec.ts rozšířen o posunutý popisek ORDER TOTAL (tests/e2e/helpers/snapshot-fixture-text.ts), kontrolu barev pixelů proti tokenům, legendu a režim Blend s posuvníkem; snapshot-diff-pull-request.spec.ts upraven na 5 oblastí (slova popisku jsou od sebe víc než buňka). Rámečky oblastí jsou neutrální (foreground, aktivní ring), aby červená znamenala jen odebráno. Snímky ~/.cache/orca-review-ide/task-145. Prochází pnpm tc, oxlint, check:code-quality:changed, audit:anti-slop, focus-read a layout-writer ratchety, jednotkové testy (28 souborů, Node 24, Bun 1.4.2, čisté prostředí) a obě e2e ve skrytém okně. 05-funkce.md §10 doplněn.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rozdíl snapshotů rozlišuje strany: pixely z původního obrázku jsou v barvě odebraného, pixely z nového v barvě přidaného (tokeny jako v diffu kódu), s legendou Removed (before) a Added or changed (after). Posunutý text se ukáže jako červený starý a zelený nový. Nový režim Blend překryje starý a nový obrázek s posuvníkem podílu; funguje i nad limitem 8 megapixelů. Rámečky oblastí jsou neutrální, aby se nepletly s odebranými pixely. Změna barvy na místě se ukáže jako přidaná. Neověřeno: tmavé téma snímkem, skutečný projekt. Ověřeno: tc, 23 testů, brána změněných řádků, anti-slop, lokalizace, e2e ve skrytém okně se snímky.
<!-- SECTION:FINAL_SUMMARY:END -->
