---
id: TASK-54
title: 'Pokus: most LSP do Monaca, vlastní nebo monaco-vscode-api'
status: To Do
assignee: []
created_date: '2026-11-18T12:41:00Z'
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

- Prototyp nepatří do pracovní větve. Ulož ho jako commit na větev `review-ide/pokus-lsp-most` bez přepnutí větve (dočasný index a `git commit-tree`) a pracovní strom vrať do stavu před pokusem; maž jen soubory, které jsi sám vytvořil.
- Spouštění procesů jen přes `@orca/process-host`, i v prototypu, aby závěry platily pro Windows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Prototyp ukáže v editoru Orky nad malým Swift balíčkem definici, hover, doplňování, diagnostiku jako markery a symboly souboru přes sourcekit-lsp spuštěný hlavním procesem
- [ ] #2 Definice v jiném souboru se otevře jako tab Orky
- [ ] #3 Záznam rozhodnutí porovnává vlastní most a @codingame/monaco-vscode-api: slučitelnost s verzí Monaca v package.json, nárůst velikosti bundlu, služby, které knihovna přináší, licence a odhad práce
- [ ] #4 Záznam obsahuje seznam metod LSP potřebných pro M3 s odpovídajícím API Monaca a popis synchronizace dokumentů, úprav zavřených souborů a práce s více kořeny
- [ ] #5 Záznam říká, kde language server poběží u SSH worktree a co k tomu chybí
- [ ] #6 Prototyp je uložený na větvi review-ide/pokus-lsp-most a pracovní větev ho neobsahuje
- [ ] #7 Otevřená otázka v docs/review-ide/README.md je odškrtnutá s odkazem na záznam
<!-- AC:END -->
