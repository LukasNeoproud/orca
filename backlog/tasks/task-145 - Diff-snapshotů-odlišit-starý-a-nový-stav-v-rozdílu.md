---
id: TASK-145
title: 'Diff snapshotů: odlišit starý a nový stav v rozdílu'
status: To Do
assignee: []
created_date: '2026-11-20T09:14:00Z'
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
- [ ] #1 V pohledu rozdílu je poznat, co bylo v původním obrázku a co je v novém: posunutý text se ukáže jako starý a nový stav ve dvou odlišných barvách, ne jako dva stejné červené texty
- [ ] #2 Barvy jsou ze stávajících tokenů (odebráno a přidáno jako v diffu kódu) a pohled má legendu
- [ ] #3 Jde přepnout mezi rozdílem a prolnutím nebo překryvem starého a nového obrázku, aby šla regrese posoudit okem
- [ ] #4 Výpočet zůstává ve Web Workeru a limit 8 megapixelů platí dál; testy výpočtu pokrývají přidané, odebrané a posunuté pixely; pohled je ověřený ve skrytém okně se snímkem
<!-- AC:END -->
