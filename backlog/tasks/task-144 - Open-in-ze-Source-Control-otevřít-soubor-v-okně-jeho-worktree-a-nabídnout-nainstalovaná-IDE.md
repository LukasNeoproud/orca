---
id: TASK-144
title: >-
  Open in ze Source Control: otevřít soubor v okně jeho worktree a nabídnout
  nainstalovaná IDE
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
  - docs/review-ide/02-editor.md
priority: high
type: bug
ordinal: 10
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připomínka uživatele z akceptace M1 (2026-11-20): Open in na souboru v panelu Source Control nabídl jen VS Code, Android Studio chybělo a v nastavení nešlo jednoduše přidat. Open in v editoru otevře VS Code s projektem a souborem, ale ze Source Control otevře jen soubor bez projektu.

### Rozsah

- Najdi všechna místa, kde se Open in volá bez kořene worktree (TASK-116 ho předává jen s řádkem; src/main/external-editor-file-location.ts vrací složku jen když je location), a sjednoť je: soubor otevřený z workspace patří do okna svého worktree i bez řádku.
- Seznam aplikací Open in: zjisti, odkud se bere a proč Android Studio chybí, a doplň zjištění nainstalovaných IDE nebo jednoduché přidání v nastavení. Znovu použij stávající registr aplikací, nestav druhý.

### Omezení

- Složený příkaz (například code --reuse-window) a WSL soubory složku nedostávají, jak je zapsáno v 02-editor.md.
- IDE při ověřování spouštěj jen nad smyšleným projektem v ~/.cache/orca-review-ide; okna, která měl uživatel otevřená, nezavírej a nenech po sobě viset žádný proces spouštěče (při TASK-80 zůstalo chybové okno Android Studia). Android Studio s otevřeným modálním dotazem na další příkaz neodpoví.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Open in na souboru v panelu Source Control otevře soubor v okně jeho worktree nebo folder workspace stejně jako Open in v editoru (VS Code i JetBrains), ne samotný soubor
- [ ] #2 Totéž platí pro ostatní místa, odkud jde Open in na souboru bez řádku; seznam míst a jejich chování je zapsaný v dokumentaci
- [ ] #3 Nabídka Open in ukazuje nainstalované Android Studio (i ze spouštěče JetBrains Toolbox) bez ruční úpravy nastavení, nebo ho jde v nastavení přidat výběrem ze seznamu nalezených aplikací; totéž pro ostatní podporovaná IDE
- [ ] #4 Na Windows a Linuxu se seznam staví bez pádu; co nejde zjistit, se nenabízí. SSH soubory se chovají jako dosud
- [ ] #5 Testy sestavení příkazu a seznamu aplikací; průchod ze Source Control ověřený ve skrytém okně
<!-- AC:END -->
