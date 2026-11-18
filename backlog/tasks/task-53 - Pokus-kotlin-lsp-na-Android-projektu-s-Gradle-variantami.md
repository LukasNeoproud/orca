---
id: TASK-53
title: 'Pokus: kotlin-lsp na Android projektu s Gradle variantami'
status: To Do
assignee: []
created_date: '2026-11-18T12:41:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-0
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
  - docs/review-ide/README.md
priority: high
type: spike
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Rozhodnout, jestli editor v M3 dostane language server i pro Kotlin. Dokumentace to nechává otevřené: kotlin-lsp je alfa a není jisté, že zvládne Android projekt s Gradle variantami.

### Postup

- Nainstaluj aktuální kotlin-lsp od JetBrains do `~/.cache/orca-review-ide/tools`.
- Pracuj nad kopií Android projektu uvedeného v `CLAUDE.local.md` (sekce Review IDE), vytvořenou mimo jeho checkout. Language server zapisuje do složky projektu.
- Ovládej server skriptem přes stdio (initialize, didOpen, dotazy), ne přes editor, aby šla měření zopakovat.
- Vyzkoušej soubory z modulu aplikace, z funkčního modulu a ze sdílené knihovny; aspoň jeden s kódem generovaným při buildu.

### Mimo rozsah

- Integrace do Orky a jakýkoli produkční kód.
- Placené rozšíření JetBrains; jen ho zmiň jako alternativu, pokud kotlin-lsp nestačí.

### Omezení

- Z firemního projektu nesmí nic odejít ven a do záznamu rozhodnutí nepatří názvy modulů, tříd ani úryvky kódu. Uváděj jen míry a obecné závěry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Záznam rozhodnutí uvádí pro definici, reference, hover, doplňování, diagnostiku, přejmenování a hledání symbolů stav funguje, částečně nebo nefunguje, vždy na souborech aspoň ze tří modulů včetně modulu s build variantami a generovaným kódem
- [ ] #2 Záznam uvádí změřený čas od startu do první diagnostiky, paměť procesu po načtení projektu a dobu odezvy na opakované dotazy
- [ ] #3 Záznam popisuje, jak se kotlin-lsp získává: zdroj, verze, licence a zda ho Orca může stáhnout sama
- [ ] #4 Záznam končí doporučením pro M3: Kotlin plně, omezeně s vyjmenovanými funkcemi, nebo jen Otevřít v Android Studiu
- [ ] #5 Otevřená otázka v docs/review-ide/README.md je odškrtnutá s odkazem na záznam
- [ ] #6 Checkout uživatelova projektu zůstal beze změny, včetně nesledovaných souborů
<!-- AC:END -->
