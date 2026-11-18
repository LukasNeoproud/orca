---
id: TASK-62
title: 'Hlavní menu: nabídka Review a položky pohledů'
status: To Do
assignee: []
created_date: '2026-11-18T12:43:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
priority: medium
type: feature
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Mít pohledy a akce Review IDE dostupné z hlavního menu. Dnes menu končí u File, Edit, Appearance, View a Help a panel Pull requests ani graf větví v něm nejsou.

### Rozsah

- Nové nabídky a položky v `src/main/menu`; `register-app-menu.ts` má 366 řádků, nový obsah patří do vlastního souboru.
- Malý registr položek, do kterého pozdější tikety přidávají své pohledy (Diff snapshotů, TODO a další).
- Texty přes `translateMain`.

### Mimo rozsah

- Nabídky Lokalizace a Kód a položky pohledů, které ještě neexistují. Přibudou s jejich funkcemi.
- Projekt, větev a zvonek v titulkovém pruhu.

### Omezení

- Nepřidávej skutečné akcelerátory menu: zachytávají klávesy v hlavním procesu dřív než renderer. Důvod je popsaný v komentářích u stávajících položek.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nativní menu má nabídku Review s položkami Pull requests a Git graph a nabídka View má položky panelů pravého sidebaru
- [ ] #2 Každá položka otevře svůj cíl v okně, které má fokus, a v menu není žádná položka bez funkčního cíle
- [ ] #3 Zkratky u položek jsou jen zobrazené nápovědy z registru klávesových zkratek, ne akcelerátory menu
- [ ] #4 Další funkce přidá svou položku jedním záznamem, bez úprav register-app-menu.ts
- [ ] #5 Popisky jsou přeložené ve všech jazycích aplikace
- [ ] #6 Na Windows a Linuxu jsou položky dostupné stejnou cestou jako stávající menu
- [ ] #7 Nové položky a jejich cíle pokrývá register-app-menu.test.ts
<!-- AC:END -->
