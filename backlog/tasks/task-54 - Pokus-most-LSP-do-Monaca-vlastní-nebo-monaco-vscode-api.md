---
id: TASK-54
title: 'Pokus: most LSP do Monaca, vlastní nebo monaco-vscode-api'
status: Done
assignee: []
created_date: '2026-11-18T12:41:00Z'
updated_date: '2026-11-18T18:04:00Z'
labels:
  - review-ide
  - effort-xhigh
milestone: m-0
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
  - docs/review-ide/README.md
priority: high
type: spike
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Rozhodnout, jak propojit language servery s Monacem: vlastním tenkým mostem, nebo knihovnou `@codingame/monaco-vscode-api`. Na rozhodnutí stojí celý milník M3.

### Postup

- Hostitel v hlavním procesu spouští server přes `spawnProcess` z `@orca/process-host` a mluví s ním JSON-RPC přes stdio. Renderer se dotazuje přes IPC.
- V rendereru registruj providery Monaca pro jeden jazyk. Výchozí bod: `src/renderer/src/components/editor/MonacoEditor.tsx` a `src/renderer/src/lib/monaco-languages`.
- Swift balíček pro pokus vytvoř mimo repozitář, sourcekit-lsp je v toolchainu Xcode.
- Knihovnu `@codingame/monaco-vscode-api` vyzkoušej jen do míry potřebné pro porovnání; pokud je neslučitelná s připnutou verzí Monaca, stačí to doložit.

### Mimo rozsah

- Kotlin a C# (mají vlastní pokusy), přejmenování, code actions, uspávání serverů, přístup agentů přes CLI.
- Produkční kvalita prototypu: testy, lokalizace, nastavení.

### Omezení

- Prototyp nepatří do pracovní větve. Ulož ho jako commit na větev `review-ide-pokus-lsp-most` bez přepnutí větve (dočasný index a `git commit-tree`) a pracovní strom vrať do stavu před pokusem; maž jen soubory, které jsi sám vytvořil.
- Spouštění procesů jen přes `@orca/process-host`, i v prototypu, aby závěry platily pro Windows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Prototyp ukáže v editoru Orky nad malým Swift balíčkem definici, hover, doplňování, diagnostiku jako markery a symboly souboru přes sourcekit-lsp spuštěný hlavním procesem
- [x] #2 Definice v jiném souboru se otevře jako tab Orky
- [x] #3 Záznam rozhodnutí porovnává vlastní most a @codingame/monaco-vscode-api: slučitelnost s verzí Monaca v package.json, nárůst velikosti bundlu, služby, které knihovna přináší, licence a odhad práce
- [x] #4 Záznam obsahuje seznam metod LSP potřebných pro M3 s odpovídajícím API Monaca a popis synchronizace dokumentů, úprav zavřených souborů a práce s více kořeny
- [x] #5 Záznam říká, kde language server poběží u SSH worktree a co k tomu chybí
- [x] #6 Prototyp je uložený na větvi review-ide-pokus-lsp-most a pracovní větev ho neobsahuje
- [x] #7 Otevřená otázka v docs/review-ide/README.md je odškrtnutá s odkazem na záznam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker, 2026-11-18):
1. Smyšlený Swift balíček a skripty mimo repozitář v ~/.cache/orca-review-ide/task-54; nejdřív sourcekit-lsp přes stdio skriptem (capabilities, push/pull diagnostika, časy).
2. Prototyp v pracovním stromu: src/main/language-servers (hostitel přes spawnProcess z @orca/process-host, rámování Content-Length, IPC), preload bridge, src/renderer/src/lib/language-servers (providery Monaca pro swift: definice, hover, doplňování, markery, symboly; synchronizace dokumentů; editor opener -> tab Orky).
3. Ověření ve skrytém okně: build --mode e2e, Playwright electron-headless, snímky do ~/.cache/orca-review-ide/task-54/screenshots.
4. @codingame/monaco-vscode-api: zkouška v ~/.cache/orca-review-ide/task-54/codingame (slučitelnost s monaco-editor 0.55.1 a hlubokými importy Orky, velikost bundlu, služby, licence).
5. Záznam rozhodnutí (backlog decision), odškrtnutí otázky v docs/review-ide/README.md, úprava 02-editor.md.
6. Prototyp uložit commit-tree na větev review-ide-pokus-lsp-most, pracovní strom vrátit do stavu HEAD (včetně out/).

Průběh 1: hotovo: smyšlený balíček TideClock a sondy sourcekit-lsp (~/.cache/orca-review-ide/task-54/scripts, results/probe-*.json); hlavní proces prototypu (src/main/language-servers/*, src/main/ipc/language-servers.ts, preload bridge, registrace ve 3 souborech); průzkum SSH (orcad, žádná RPC pro stdio proces). Zbývá: renderer (sync dokumentů, providery, opener), build e2e + ověření ve skrytém okně, zkouška codingame, záznam rozhodnutí, uložení prototypu na větev a úklid (včetně obnovy out/ ze zálohy).

Průběh 2: prototyp hotový a ověřený ve skrytém okně (Playwright electron-headless, spec tests/e2e/language-server-swift-spike.spec.ts, 1 passed): symboly, hover, markery, doplňování, definice v jiném souboru jako tab Orky; sourcekit-lsp po ukončení aplikace neběží. Snímky v ~/.cache/orca-review-ide/task-54/screenshots, logy v results/e2e-run-*.log. Zjištění: po 'ready' vrací hover ~2 s null; Peek bez modelu cílového souboru má prázdný náhled (Model not found). Zbývá: uložit prototyp na větev (commit-tree), vrátit strom a out/ ze zálohy ~/.cache/orca-review-ide/task-54/out-backup, zkouška codingame, záznam rozhodnutí, README.

Průběh 3: prototyp uložen jako commit 02ada22cc7fb4b38c8ba9e32997e57e99bee0f9b na místní větvi review-ide-pokus-lsp-most (název review-ide-pokus-lsp-most git odmítl: existuje větev review-ide, refs/heads/review-ide nemůže být zároveň soubor i adresář). Pracovní strom vrácen (smazány jen vytvořené soubory, 4 sledované soubory obnoveny), out/ obnoven ze zálohy beze změny obsahu. Zbývá: zkouška codingame v ~/.cache/orca-review-ide/task-54/codingame, záznam rozhodnutí, README + 02-editor.md.

Průběh 4 (hotovo): zkouška @codingame/monaco-vscode-api 37.6.0 mimo repozitář (~/.cache/orca-review-ide/task-54/codingame: hluboké importy scripts/check-deep-imports.mjs, velikost bundlu dist/ + results/bundle-*.log), sonda více kořenů (results/probe-multi-root-*.json), záznam backlog/decisions/decision-2 (stav proposed), odškrtnutá otázka v docs/review-ide/README.md, upravený oddíl Language servery v 02-editor.md. Důkazy AC: #1 a #2 spec v commitu prototypu, 1 passed ve skrytém okně, snímky ~/.cache/orca-review-ide/task-54/screenshots/1..7; #3 až #5 decision-2; #7 README. AC #6 neodškrtnuto: prototyp je uložený (commit 02ada22cc7fb4b38c8ba9e32997e57e99bee0f9b) a pracovní větev ho neobsahuje, ale větev se jmenuje review-ide-pokus-lsp-most, protože název review-ide-pokus-lsp-most git vedle větve review-ide vytvořit neumí.

Koordinátor (2026-11-18): větev prototypu se jmenuje review-ide-pokus-lsp-most, protože git nedovolí větev review-ide/… vedle větve review-ide; kritérium 6 a odkazy jsou upravené. Commit prototypu 02ada22cc7.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Prototyp vlastního tenkého mostu ukázal v editoru Orky nad smyšleným Swift balíčkem definici (v jiném souboru jako nový tab), hover, doplňování, diagnostiku jako markery a symboly souboru přes sourcekit-lsp spuštěný hlavním procesem; ověřeno e2e ve skrytém okně. Knihovna @codingame/monaco-vscode-api je neslučitelná s připnutým Monacem (nahrazuje balíček monaco-editor vlastním sestavením, rozbije 15 z 19 hlubokých importů), přidá 5,4 MB do rendereru a hostitele, SSH ani agenty neřeší. Návrh v decision-2 (proposed): vlastní most; záznam obsahuje metody LSP pro M3 s API Monaca, synchronizaci dokumentů, úpravy zavřených souborů, více kořenů a umístění serveru u SSH worktree (v orcad na vzdáleném stroji). Prototyp je commit 02ada22cc7 na místní větvi review-ide-pokus-lsp-most; pracovní větev ho neobsahuje. Knihovna se jen sestavila, za běhu zkoušena nebyla.
<!-- SECTION:FINAL_SUMMARY:END -->
