---
id: TASK-64
title: 'Diff snapshotů: změněné obrázky snapshot testů jako před, po a rozdíl'
status: To Do
assignee: []
created_date: '2026-11-18T12:43:00Z'
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
- [ ] #1 Pohled Snapshots vypíše změněné, přidané a odebrané obrázky snapshot testů z porovnání větve s bází a z diffu pull requestu
- [ ] #2 Obrázky Paparazzi, Roborazzi a swift-snapshot-testing se rozpoznají podle cesty bez nastavení a vzory jsou na jednom místě
- [ ] #3 Vybraný snapshot se zobrazí jako před, po a rozdíl, s přepínačem zvýraznění rozdílu
- [ ] #4 Oblasti změn jsou v rozdílu ohraničené a očíslované a jejich seznam umožní na oblast skočit
- [ ] #5 Výpočet rozdílu neblokuje rozhraní a u obrázku nad stanovený rozměr se rozdíl nepočítá a pohled řekne proč
- [ ] #6 Pohled je dostupný z diffu, ze stránky pull requestu a z hlavního menu, pokud už jeho registr existuje
- [ ] #7 Rozpoznání cest a hledání oblastí změn pokrývají jednotkové testy; pohled je ověřený ve skrytém okně na smyšleném repozitáři
<!-- AC:END -->
