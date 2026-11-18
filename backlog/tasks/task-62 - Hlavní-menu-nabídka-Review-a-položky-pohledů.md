---
id: TASK-62
title: 'Hlavní menu: nabídka Review a položky pohledů'
status: Done
assignee: []
created_date: '2026-11-18T12:43:00Z'
updated_date: '2026-11-18T18:13:00Z'
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
- [x] #1 Nativní menu má nabídku Review s položkami Pull requests a Git graph a nabídka View má položky panelů pravého sidebaru
- [x] #2 Každá položka otevře svůj cíl v okně, které má fokus, a v menu není žádná položka bez funkčního cíle
- [x] #3 Zkratky u položek jsou jen zobrazené nápovědy z registru klávesových zkratek, ne akcelerátory menu
- [x] #4 Další funkce přidá svou položku jedním záznamem, bez úprav register-app-menu.ts
- [x] #5 Popisky jsou přeložené ve všech jazycích aplikace
- [x] #6 Na Windows a Linuxu jsou položky dostupné stejnou cestou jako stávající menu
- [x] #7 Nové položky a jejich cíle pokrývá register-app-menu.test.ts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: (1) src/shared/app-menu-views.ts = registr položek (id, nabídka, popisek, nápověda zkratky, cíl). (2) src/main/menu/app-menu-view-items.ts staví z registru položky View a nabídku Review; register-app-menu.ts je jen vloží a dostane onOpenView. (3) Klik posílá ui:openAppMenuView s id do okna z kliku (jinak hlavní okno); preload onOpenAppMenuView, web klient no-op. (4) Renderer src/renderer/src/app-menu-views/ otevře cíl: záložku pravého sidebaru, hledání, nebo Git graph; panel nedostupný v aktuálním workspace ohlásí toastem. (5) Lokalizace: menu.review + toast, názvy panelů používají existující klíče. (6) Testy: register-app-menu.test.ts, test rendereru, e2e ve skrytém okně.

Hotovo: registr src/shared/app-menu-views.ts, stavba položek src/main/menu/app-menu-view-items.ts, IPC ui:openAppMenuView (preload onOpenAppMenuView, volitelné), renderer src/renderer/src/app-menu-views/open-app-menu-view.ts, klíče menu.review / menu.pullRequests / menu.viewUnavailable v šesti jazycích, testy (register-app-menu.test.ts, open-app-menu-view.test.ts, tests/e2e/app-menu-review-views.spec.ts), dokumentace 05-funkce.md oddíl 2. Ověřeno: pnpm tc, vitest, check:code-quality:changed, e2e ve skrytém okně; snímky /tmp/orca-review-ide/task-62/. Zbývá: nic; commit dělá koordinátor.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hlavní menu má nabídku Review (Pull requests, Git graph) mezi View a Window a v nabídce View položky pro panely pravého sidebaru (Explorer, Search, Source Control, Checks, Ports, Agents, Backlog.md, Attached worktrees, PR Checks). Položky se staví z jednoho registru (src/shared/app-menu-views.ts), nemají vlastní akcelerátor a ukazují nápovědu zkratky z registru zkratek. Klik otevře pohled v okně, ze kterého přišel; z nastavení a jiných celostránkových pohledů se nejdřív vrátí do workspace; panel, který workspace nemá, ohlásí toast. Pohledy, které ještě neexistují (Přehled, grafy, Diff snapshotů, Lokalizace, Kód a další), položku nemají a přidá ji tiket, který je dodá. Ověřeno testy šablony na macOS, Linuxu a Windows a e2e ve skrytém okně; skutečné nativní menu na ploše, Windows a Linux spuštěny nebyly. Známé drobnosti: nedostupné panely nejsou v menu zašedlé, ve vyskakovacím okně dashboardu položky nic neudělají.
<!-- SECTION:FINAL_SUMMARY:END -->
