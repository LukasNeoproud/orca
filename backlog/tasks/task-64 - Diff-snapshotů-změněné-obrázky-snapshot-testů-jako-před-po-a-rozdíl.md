---
id: TASK-64
title: 'Diff snapshotů: změněné obrázky snapshot testů jako před, po a rozdíl'
status: Done
assignee: []
created_date: '2026-11-18T12:43:00Z'
updated_date: '2026-11-18T18:46:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
priority: medium
type: feature
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Rychle posoudit vizuální dopad změny z obrázků, které snapshot testy už do repozitáře ukládají.

### Rozsah

- Rozpoznání snapshotů mezi změněnými soubory. Podobné rozpoznávání cest už existuje v `src/shared/test-code-path.ts` a `src/shared/generated-code-path.ts`; rozšiř je, nestav vedle.
- Zobrazení postav na `src/renderer/src/components/editor/ImageDiffViewer.tsx` a `ImageDiffPane.tsx`. Obrázky načítej cestou, kterou je načítá dnešní diff, aby fungovaly i SSH worktrees.
- Oblasti změn jako spojité plochy pixelového rozdílu.

### Mimo rozsah

- Dělení na očekávané a nečekané změny, příčina podle AI, vazba oblasti na celek diffu a akce Přijmout jako nový základ. Potřebují Diff po celcích z M2.
- Spouštění snapshot testů.

### Omezení

- Folder workspaces bez gitu pohled nenabízí.
- Barvy rozdílu jen z tokenů v `main.css`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pohled Snapshots vypíše změněné, přidané a odebrané obrázky snapshot testů z porovnání větve s bází a z diffu pull requestu
- [x] #2 Obrázky Paparazzi, Roborazzi a swift-snapshot-testing se rozpoznají podle cesty bez nastavení a vzory jsou na jednom místě
- [x] #3 Vybraný snapshot se zobrazí jako před, po a rozdíl, s přepínačem zvýraznění rozdílu
- [x] #4 Oblasti změn jsou v rozdílu ohraničené a očíslované a jejich seznam umožní na oblast skočit
- [x] #5 Výpočet rozdílu neblokuje rozhraní a u obrázku nad stanovený rozměr se rozdíl nepočítá a pohled řekne proč
- [x] #6 Pohled je dostupný z diffu, ze stránky pull requestu a z hlavního menu, pokud už jeho registr existuje
- [x] #7 Rozpoznání cest a hledání oblastí změn pokrývají jednotkové testy; pohled je ověřený ve skrytém okně na smyšleném repozitáři
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker): (1) src/shared/snapshot-image-path.ts = jediná tabulka vzorů Paparazzi/Roborazzi/swift-snapshot-testing, zaregistrovaná v test-code-path.ts. (2) components/snapshot-diff: čistý výpočet oblastí změn (mřížka + spojité komponenty), web worker pro pixelový rozdíl (barva z tokenu --destructive), limit rozměru, pohled seznam + před/po/rozdíl na ImageDiffPane (nový slot overlay), přepínač zvýraznění, seznam oblastí se skokem. (3) Zdroje: kombinovaný diff (stejné položky a fetchCombinedDiffSection jako dnešní diff, tedy i SSH) a stránka Azure DevOps PR (loadAzureDevOpsReviewFileDiff). (4) Vstupy: tlačítko Snapshots v liště kombinovaného diffu, záložka Snapshots na stránce PR, položka View > Snapshots v registru app-menu-views. Bez nového typu tabu: pohled je režim záložky diffu (01-integrace: Záložka diffu). (5) Testy: jednotkové (cesty, oblasti, limit, mapování zdrojů, menu), e2e ve skrytém okně na smyšleném repu. (6) Lokalizace 6 jazyků, úprava 05-funkce.md.

Stav 1: hotové rozpoznání cest (shared/snapshot-image-path.ts + registrace v test-code-path.ts), hledání oblastí, limit rozměru, worker, pohled (components/snapshot-diff), adaptéry pro kombinovaný diff a Azure DevOps PR, registrace v EditorContent, combined-diff-toolbar, AzureDevOpsPullRequestPage, app-menu-views; lokalizace 6 jazyků; pnpm tc prochází; jednotkové testy cest, oblastí, limitu, mapování a menu prochází. Zbývá: testy komponenty, worker klienta a akce z menu, e2e ve skrytém okně se snímky, check:code-quality:changed, oxlint, úprava 05-funkce.md, odškrtnutí AC.

Stav 2 (hotovo): doplněny testy komponenty, worker klienta, akce z menu a rámečku oblasti; e2e ve skrytém okně tests/e2e/snapshot-diff.spec.ts (smyšlený repozitář, skutečné porovnání větve, worker, menu View > Snapshots, tlačítko v liště diffu) a tests/e2e/snapshot-diff-pull-request.spec.ts (stránka PR proti smyšlenému Azure DevOps Serveru); snímky v ~/.cache/orca-review-ide/task-64. Prochází pnpm tc, oxlint nad 47 změněnými soubory, check:code-quality:changed, jednotkové testy. 05-funkce.md §10 doplněn o stav implementace a odložené části. Mimo rozsah zůstává: stránka PR GitHubu a GitLabu (nevrací obsah obrázků), nastavitelná cesta Roborazzi.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pohled Snapshots ukazuje změněné, přidané a odebrané obrázky snapshot testů (Paparazzi, Roborazzi, swift-snapshot-testing; rozpoznání jen podle cesty v src/shared/snapshot-image-path.ts) jako před, po a rozdíl se zvýrazněním, s ohraničenými a očíslovanými oblastmi změn, skokem na oblast a synchronním posunem a přiblížením. Rozdíl se počítá ve Web Workeru; nad 8 megapixelů se nepočítá a pohled řekne proč. Otevírá se tlačítkem Snapshots (N) v liště kombinovaného diffu (větev, všechny změny, necommitnuté změny, jeden commit), záložkou Snapshots na stránce pull requestu Azure DevOps a položkou View > Snapshots. Ověřeno jednotkovými testy a dvěma e2e ve skrytém okně na smyšlených obrázcích a smyšleném serveru. Neověřeno: SSH, Windows, skutečný projekt. Stránky pull requestů GitHubu a GitLabu snapshoty neukazují (nevracejí obsah obrázků); vlastní výstupní cesta Roborazzi se nepozná.
<!-- SECTION:FINAL_SUMMARY:END -->
