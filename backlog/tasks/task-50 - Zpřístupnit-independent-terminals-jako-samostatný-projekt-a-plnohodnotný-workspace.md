---
id: TASK-50
title: 'Zpřístupnit independent terminals jako samostatný projekt a plnohodnotný workspace'
status: To Do
assignee: []
created_date: '2026-09-29'
labels:
  - desktop
  - terminals
dependencies: []
type: feature
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Independent terminals jsou v Orca desktop aktuálně dostupné pouze přes nabídku `+` → `New independent terminal`. Tato akce zároveň vytvoří nový terminál, takže chybí přímý vstup k již existujícím terminálům bez zakládání dalšího.

Zobrazit independent terminals jako samostatný projekt v hlavní navigaci Orcy, aby byly snadno dostupné i bez otevřeného repozitáře či git worktree. Otevření projektu má zobrazit existující terminály; vytvoření nového terminálu musí být samostatná explicitní akce.

Nahradit plovoucí okno klasickým workspace s taby, který využívá celou hlavní pracovní plochu desktopové aplikace stejně jako ostatní workspaces. Zachovat existující terminálové relace při přepínání mezi projekty a sjednotit ovládání tabů s běžným workspace podle design systému Orcy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Independent terminals mají vlastní přímo dostupnou položku projektu v hlavní navigaci Orca desktop.
- [ ] #2 Otevření tohoto projektu zobrazí existující terminály a nevytvoří automaticky nový terminál.
- [ ] #3 Pokud žádný terminál neexistuje, workspace zobrazí prázdný stav s explicitní akcí pro vytvoření terminálu.
- [ ] #4 Terminály se zobrazují jako taby klasického workspace přes celou hlavní pracovní plochu aplikace místo plovoucího okna.
- [ ] #5 Uživatel může terminály vytvářet, přepínat a zavírat stejně jako taby v běžném workspace; přepnutí projektu zachová běžící relace.
- [ ] #6 Akce `+` → `New independent terminal`, pokud zůstane dostupná, vytvoří terminál a otevře jej v novém workspace zobrazení.
- [ ] #7 Přístup není podmíněn git repozitářem ani worktree; změna zachová podporované lokální a SSH scénáře a chování na macOS, Linuxu a Windows.

<!-- AC:END -->
