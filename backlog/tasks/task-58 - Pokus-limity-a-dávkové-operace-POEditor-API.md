---
id: TASK-58
title: 'Pokus: limity a dávkové operace POEditor API'
status: To Do
assignee: []
created_date: '2026-11-18T12:42:00Z'
updated_date: '2026-11-18T21:22:00Z'
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
- [ ] #1 Záznam rozhodnutí uvádí limity požadavků a velikostí z oficiální dokumentace POEditoru s odkazy
- [ ] #2 Záznam popisuje, jak dávkově přidat, upravit a smazat klíče a překlady, jak stáhnout stav projektu a podle čeho poznat, že je lokální kopie starší než server
- [ ] #3 Záznam uvádí, které formáty souborů POEditor přijímá a vydává pro strings.xml, xcstrings a resx
- [ ] #4 Záznam navrhuje velikost dávky a rozestup požadavků pro synchronizaci
- [ ] #5 Co nebylo ověřeno proti živému API, je v záznamu výslovně označené
- [ ] #6 Otevřená otázka v docs/review-ide/README.md je odškrtnutá s odkazem na záznam
<!-- AC:END -->
