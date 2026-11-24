---
id: TASK-172
title: >-
  Přehled Moje práce: jednotky práce s fází, váznutím a odznakem v postranním
  panelu
status: To Do
assignee: []
created_date: '2026-11-24T09:05:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-9
dependencies:
  - TASK-171
documentation:
  - docs/review-ide/10-tok-prace.md
priority: high
type: feature
ordinal: 156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Uživatel má na jednom místě vidět, kde která jeho práce vázne: větev bez pull requestu, review, které trvá dlouho, čekající opravy a sloučená práce bez vydaného buildu.

### Rozsah

- Nová stránka Moje práce a její položka v postranním panelu vedle Tasks (`src/renderer/src/components/sidebar/`), s počtem váznoucích jednotek.
- Řádek: tiket a jeho stav, repozitář a větev, pull request, fáze, jak dlouho v ní je, stav vydání (dev, ostrý). Váznoucí nahoře.
- Akce z řádku jen nad tím, co už existuje: otevřít tiket, pull request, workspace a u větve bez pull requestu stávající cestu založení pull requestu.

### Mimo rozsah

- Data a pravidla: TASK-171. Tento tiket nemění, co si vyměňují klient a hostitel.
- Karta workspace a nastavení: TASK-173. Stránka Tasks: TASK-174.

### Omezení

- Vzhled podle docs/STYLEGUIDE.md, texty v šesti jazycích.
- Neznámou fázi ukaž jako neznámou s důvodem, ne jako v pořádku.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Stránka Moje práce ukazuje jednotky práce uživatele se všemi údaji z dokumentace, váznoucí nahoře a s vyznačenou lhůtou, kterou překročily
- [ ] #2 Položka v postranním panelu nese počet váznoucích jednotek; bez váznoucích nenese nic
- [ ] #3 Z řádku jde otevřít tiket, pull request a workspace; u větve bez pull requestu stávající založení pull requestu
- [ ] #4 Jednotka s neznámou fází nebo neznámým tiketem to říká s důvodem; hostitel bez schopnosti toku práce stránku ukáže s vysvětlením, ne prázdnou
- [ ] #5 Komponenty mají testy; stránka je ověřená ve skrytém okně se smyšlenými jednotkami ve všech fázích, se snímkem
<!-- AC:END -->
