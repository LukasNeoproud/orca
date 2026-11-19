---
id: TASK-80
title: 'Open in: ověřit na skutečných IDE a otevírat worktree jako projekt'
status: Done
assignee: []
created_date: '2026-11-18T14:40:00Z'
updated_date: '2026-11-19T20:41:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
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

### Rozhodnuto uživatelem (2026-11-18, decision-5)

1. IDE spouští agent. Uživatel ví, že se okna IDE při ověřování otevřou do popředí; spouštěj je jen po dobu ověření, každé po sobě zavři a nezavírej okna, která měl uživatel otevřená předtím.
2. Otevírat s řádkem i celý worktree jako projekt: ano, až když ověření na IDE ukáže, že to funguje.
### Omezení

- Bez rozhodnutí uživatele žádné IDE nespouštět.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 VS Code, Android Studio, Rider, Xcode a Zed na macOS otevřou soubor na zvoleném řádku příkazem, který Orca sestavuje; výsledek každé aplikace je zapsaný
- [x] #2 JetBrains IDE dostávají i sloupec, pokud ověření ukáže, jak ho počítají; jinak je důvod zapsaný v dokumentaci
- [x] #3 Podle rozhodnutí uživatele se soubor otevírá v okně svého worktree, nebo zůstává dnešní chování; dokumentace odpovídá
- [x] #4 Testy sestavení příkazu pokrývají každou změnu argumentů na macOS, Linuxu a Windows
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Z TASK-79 (2026-11-18): v režimu commitu a porovnání větví otevírá Open in aktuální soubor ve workspace, ne zobrazenou verzi, takže čísla řádků se mohou lišit. Při ověřování na IDE rozhodnout, jestli akci v tomto režimu skrýt, nebo upozornit na posun řádků. U smazaného souboru v diffu jednoho souboru workspace menu jen nevznikne (v souhrnném diffu už vysvětlení je).

Plán (worker 2026-11-19): 1) smyšlený projekt se dvěma worktrees v ~/.cache/orca-review-ide/task-80; 2) pro VS Code, Android Studio a Xcode spustit argv z resolveExternalEditorLaunchSpec (řádek, sloupec, varianta s kořenem worktree), polohu číst ze stavu IDE; Rider a Zed nejsou nainstalované, zapsat jako neověřené; 3) podle výsledku sloupec pro JetBrains a kořen worktree v external-editor-file-location.ts, testy, dokumentace 02-editor.md.

Stav (worker 2026-11-19): hotovo: sloupec pro JetBrains (--column S-1, doloženo z bytecode CommandLineProcessor nainstalovaného Android Studia, platforma 262), volba projectRoot v sestavení příkazu pro code/code-insiders, testy pro tři platformy, tabulka ověření v 02-editor.md. Ověřeno živě: VS Code (řádek, sloupec, varianta se složkou worktree). Zčásti: Android Studio (příkaz přijat, soubor otevřen, poloha kurzoru nepřečtena kvůli zamčené obrazovce), Xcode (spuštěn, řádek nepřečten, chybí Automatizace). Neověřeno: Rider a Zed (nejsou nainstalované). Zbývá: předat kořen worktree z rendereru přes shell:openInExternalEditor (soubory mimo rozsah tiketu), doověřit polohu kurzoru v Android Studiu a Xcode při odemčené obrazovce, varianta se složkou pro JetBrains. Zápis: ~/.cache/orca-review-ide/task-80/vysledky.md.

Stav 2026-11-19 (koordinátor): commitnuto je sloupec pro JetBrains (--line N --column S-1, doloženo z bytecode platformy IntelliJ v nainstalovaném Android Studiu: řádek od jedné, sloupec od nuly) a volba projectRoot v sestavení příkazu pro VS Code; zapojení z rozhraní je TASK-116. Živě ověřen jen VS Code 1.140 (řádek i sloupec, okno worktree). Zbývá a potřebuje přítomného uživatele s odemčenou obrazovkou: poloha kurzoru v Android Studiu (po studio --line 17 --column 3 má být ve stavu IDE caret line 16, column 3) a v Xcode, složka worktree u JetBrains (dialogy o důvěře a o okně). Rider a Zed nejsou nainstalované. Čeká na uživatele: doověřit ručně při akceptaci M1 (doporučeno), nebo udělit agentovi oprávnění Automatizace a Zpřístupnění; a jestli Rider a Zed nainstalovat, nebo nechat neověřené.

Odpověď uživatele 2026-11-19 (decision-12): doověří agent; uživatel mu udělí oprávnění Automatizace a Zpřístupnění (čeká se na potvrzení, že je udělil). Rider a Zed zůstávají neověřené; zapsat do dokumentace.

2026-11-19: uživatel udělil oprávnění Zpřístupnění (Ovládání zařízení a přístup k datům). Macos ho připisuje Orca Dev (com.stablyai.orca.dev): relace agentů běží v terminálu Orca Dev a za proces odpovídá jeho Orca Terminal Host. AXIsProcessTrusted vrací true, Automatizace pro System Events už platí. Štítek model-opus podle úsporného režimu (decision-12).

2026-11-19 21:25: worker na Opusu zastavil uživatel hned po startu; nic dalšího se nezměnilo. Zadat znovu.

Plán (worker 2026-11-19, třetí běh): znovu vytvořit smyšlený projekt se dvěma worktrees v ~/.cache/orca-review-ide/task-80; zjistit běžící IDE a jejich otevřené projekty; Android Studio: studio --line 17 --column 3 a poloha kurzoru přes Zpřístupnění (stavový řádek) i ze stavu IDE; varianta se složkou worktree (dialogy důvěry a okna); Xcode: xed -l N a výběr přes AppleScript/Zpřístupnění; výsledky do 02-editor.md, rozhodnout kritéria #1 a #3.

Třetí běh (2026-11-19): ověřeno živě přes Zpřístupnění. Android Studio 2026.2.1: stavový řádek 17:4 po --line 17 --column 3 (AXInsertionPointLineNumber 16), 42:7 v cestě s mezerou, 12:5, 30:1; uložený stav IDE line 16 column 3. Bez složky soubor skončí v okně jiného projektu; se složkou první otevření ukáže dialog o okně (New Window/This Window/Cancel) a u nedůvěryhodné složky dialog o důvěře, pak nové okno worktree na správném místě, další otevření bez dotazu; Cancel neotevře nic. Xcode 27.0: xed -l 42 -> Line: 42 Col: 1, xed -l 17 do běžícího -> Line: 17 Col: 1. Rozhodnutí #3 podle decision-5: kořen worktree dostávají i IDE JetBrains kromě Rideru (neověřený, otevírá řešení); WSL soubory na Windows kořen nedostanou v žádném editoru. Změny: external-editor-file-location.ts, external-editor-launch.ts, testy, 02-editor.md. Rider a Zed neověřené (decision-12). Zápis: ~/.cache/orca-review-ide/task-80/vysledky.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Open in ověřen na skutečných IDE (macOS): VS Code 1.140, Android Studio 2026.2.1 a Xcode 27.0 otevírají soubor na zvoleném řádku (u VS Code a Android Studia i sloupci), poloha kurzoru přečtena přes Zpřístupnění. IDE JetBrains kromě Rideru nově dostávají se souborem i složku worktree (decision-5): soubor se otevře v okně svého worktree; při prvním otevření se IDE zeptá na okno a na důvěru. WSL soubory zůstávají bez složky v každém editoru. Rider a Zed neověřeny, nejsou nainstalované (decision-12). Ověřeno: tc, 263 testů, brána změněných řádků, anti-slop.
<!-- SECTION:FINAL_SUMMARY:END -->
