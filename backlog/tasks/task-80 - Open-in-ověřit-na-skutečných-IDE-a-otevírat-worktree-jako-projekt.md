---
id: TASK-80
title: 'Open in: ověřit na skutečných IDE a otevírat worktree jako projekt'
status: To Do
assignee: []
created_date: '2026-11-18T14:40:00Z'
updated_date: '2026-11-18T22:10:00Z'
labels:
  - review-ide
  - effort-medium
  - ceka-na-uzivatele
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
priority: low
type: task
ordinal: 15600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Příkazy pro otevření souboru na řádku z TASK-61 jsou doložené jen testy sestavení argumentů. Nikdo je nespustil proti skutečnému IDE a sloupec pro JetBrains je vypnutý, protože není jisté, jestli se počítá od nuly.

### Rozsah

- `src/main/external-editor-file-location.ts` a `src/main/external-editor-launch.ts`: opravy syntaxe podle ověření, případně sloupec pro JetBrains.
- Volitelně předat spolu se souborem i kořen worktree (`code <worktree> --goto …`, `studio <worktree> --line …`), aby se soubor neotevřel v okně jiného projektu.

### Čeká na uživatele

1. Kdo IDE spustí: agent (okna IDE se uživateli otevřou do popředí), nebo uživatel ručně při akceptaci milníku podle připraveného seznamu. Doporučení: uživatel ručně při akceptaci.
2. Otevírat s řádkem i celý worktree jako projekt? Ano: soubor skončí v okně správného worktree, ale IDE může otevřít nové okno a načítat projekt. Ne: IDE si okno vybere samo, u neotevřeného worktree třeba okno jiného projektu. Doporučení: ano, až po ověření na IDE.

### Omezení

- Bez rozhodnutí uživatele žádné IDE nespouštět.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 VS Code, Android Studio, Rider, Xcode a Zed na macOS otevřou soubor na zvoleném řádku příkazem, který Orca sestavuje; výsledek každé aplikace je zapsaný
- [ ] #2 JetBrains IDE dostávají i sloupec, pokud ověření ukáže, jak ho počítají; jinak je důvod zapsaný v dokumentaci
- [ ] #3 Podle rozhodnutí uživatele se soubor otevírá v okně svého worktree, nebo zůstává dnešní chování; dokumentace odpovídá
- [ ] #4 Testy sestavení příkazu pokrývají každou změnu argumentů na macOS, Linuxu a Windows
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Z TASK-79 (2026-11-18): v režimu commitu a porovnání větví otevírá Open in aktuální soubor ve workspace, ne zobrazenou verzi, takže čísla řádků se mohou lišit. Při ověřování na IDE rozhodnout, jestli akci v tomto režimu skrýt, nebo upozornit na posun řádků. U smazaného souboru v diffu jednoho souboru workspace menu jen nevznikne (v souhrnném diffu už vysvětlení je).
<!-- SECTION:NOTES:END -->
