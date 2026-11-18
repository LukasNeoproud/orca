---
id: TASK-58
title: 'Pokus: limity a dávkové operace POEditor API'
status: Done
assignee: []
created_date: '2026-11-18T12:42:00Z'
updated_date: '2026-11-18T22:50:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-0
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
  - docs/review-ide/README.md
priority: low
type: spike
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Zjistit, jak rychle a v jakých dávkách může Orca synchronizovat překlady s POEditorem, aby šel navrhnout klient pro milník M6.

### Postup

- Část A, bez přístupu: projdi oficiální dokumentaci API a sepiš limity a potřebné operace.
- Část B, jen s tokenem testovacího projektu od uživatele: změř skutečné chování limitů na čtení a na malém nahrání.

### Vstup od uživatele (volitelný)

Token k testovacímu projektu v POEditoru. Bez něj se provede jen část A a tiket se uzavře s vyznačením neověřených bodů.

### Omezení

- Nikdy nenahrávej do projektu, který není výslovně označený jako testovací.
- Token neukládej do repozitáře, do tiketu ani do záznamu rozhodnutí.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Záznam rozhodnutí uvádí limity požadavků a velikostí z oficiální dokumentace POEditoru s odkazy
- [x] #2 Záznam popisuje, jak dávkově přidat, upravit a smazat klíče a překlady, jak stáhnout stav projektu a podle čeho poznat, že je lokální kopie starší než server
- [x] #3 Záznam uvádí, které formáty souborů POEditor přijímá a vydává pro strings.xml, xcstrings a resx
- [x] #4 Záznam navrhuje velikost dávky a rozestup požadavků pro synchronizaci
- [x] #5 Co nebylo ověřeno proti živému API, je v záznamu výslovně označené
- [x] #6 Otevřená otázka v docs/review-ide/README.md je odškrtnutá s odkazem na záznam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker 2026-11-18): jen část A. Projít veřejnou dokumentaci POEditoru (API v2 reference, limity, formáty, changelog), sepsat záznam rozhodnutí ve stavbě decision-1..4 (stav proposed), body části B označit jako neověřené proti živému API a sepsat jako seznam měření pro běh s tokenem. Na živé API nic neposílat, nikam se nepřihlašovat.

Hotovo (část A): záznam decision-6 (proposed) z veřejné dokumentace čtené 2026-11-18, otevřená otázka v docs/review-ide/README.md odškrtnutá. Na API POEditoru neodešel žádný požadavek. Část B neproběhla (bez tokenu); seznam 11 měření je v decision-6, oddíl „Co by ověřila část B“. Zbývá: část B, až uživatel dodá token testovacího projektu.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pokus nad veřejnou dokumentací POEditoru (část A); na živé API neodešel žádný požadavek, protože token testovacího projektu není k dispozici. Záznam decision-6 (proposed) uvádí limity požadavků podle kategorie účtu (za minutu 100 / 200 / 300, za hodinu 2 000 / 6 000 / 10 000, upload 1 za 20 s nebo 10 s), limity počtu stringů podle tarifu, dávkové metody pro klíče a překlady, způsob stažení stavu a levnou kontrolu zastaralosti dvěma požadavky, a formáty android_strings, xcstrings a resx s jejich omezeními. Návrh: synchronizovat přes JSON metody, ne přes upload souborů; projects/sync a sync_terms nikdy nepoužít, protože mažou klíče chybějící v datech; nejvýš 100 položek v dávce, jeden požadavek najednou s rozestupem 1 s a stropem 1 500 za hodinu; mazání až na konci a po odeslání ověřovací čtení. Nic z toho není ověřené proti živému API; dokumentace neuvádí strop dávky ani velikosti požadavku a ve dvou bodech si odporuje. Jedenáct měření pro běh s tokenem je v záznamu a má je TASK-113. Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
