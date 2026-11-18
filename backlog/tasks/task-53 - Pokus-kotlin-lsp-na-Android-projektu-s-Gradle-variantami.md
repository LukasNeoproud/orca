---
id: TASK-53
title: 'Pokus: kotlin-lsp na Android projektu s Gradle variantami'
status: Done
assignee: []
created_date: '2026-11-18T12:41:00Z'
updated_date: '2026-11-18T17:25:00Z'
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
- [x] #1 Záznam rozhodnutí uvádí pro definici, reference, hover, doplňování, diagnostiku, přejmenování a hledání symbolů stav funguje, částečně nebo nefunguje, vždy na souborech aspoň ze tří modulů včetně modulu s build variantami a generovaným kódem
- [x] #2 Záznam uvádí změřený čas od startu do první diagnostiky, paměť procesu po načtení projektu a dobu odezvy na opakované dotazy
- [x] #3 Záznam popisuje, jak se kotlin-lsp získává: zdroj, verze, licence a zda ho Orca může stáhnout sama
- [x] #4 Záznam končí doporučením pro M3: Kotlin plně, omezeně s vyjmenovanými funkcemi, nebo jen Otevřít v Android Studiu
- [x] #5 Otevřená otázka v docs/review-ide/README.md je odškrtnutá s odkazem na záznam
- [x] #6 Checkout uživatelova projektu zůstal beze změny, včetně nesledovaných souborů
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (2026-11-18): 1) otisk checkoutu projektu před pokusem (git status, manifest souborů) do ~/.cache/orca-review-ide/task-53/state; 2) kotlin-lsp 271.2085.0 (samostatný archiv, ověřený SHA-256) v ~/.cache/orca-review-ide/tools; 3) kopie projektu mimo checkout, server spouštěný skriptem přes stdio pod sandboxem bez vnější sítě, --data-sharing=none; 4) import Gradle projektu, měření startu, paměti a odezvy; 5) sedm funkcí LSP na souborech ze tří modulů; 6) záznam rozhodnutí, odškrtnutí otázky v README, úklid procesů a kontrola otisku checkoutu. Hotovo: body 1 a 2, server startuje na smyšleném projektu bez přijetí EULA a s vypnutou telemetrií.

Průběh 1: kopie projektu z commitnutého stromu a izolovaný Gradle home jsou v ~/.cache/orca-review-ide/task-53 (skripty v scripts/, běhy v runN/). Běh 1 (studený, výchozí nastavení): import Gradle projektu selhal po 161 s ve vlastním Android model builderu kotlin-lsp (dotaz na výstup úlohy androidTest varianty, která neběžela); během importu se spustilo přes 1600 úloh včetně kompilace Kotlinu všech modulů ve všech build typech. Po selhání server na hover, definici, diagnostiku i hledání symbolů vrací prázdno. Zbývá: běh 2 s přepnutým testovacím build typem, měření funkcí, záznam rozhodnutí, README, úklid procesů, kontrola otisku checkoutu.

Průběh 2: běh 3 s testovacím build typem přepnutým na debug (vlastnost Gradle v izolovaném Gradle home, projekt kopie nezměněn) import dokončil. Změřeno v run3/: baterie dotazů (battery-1.json, battery-slow.json, battery-extra.json), diagnostika po úpravě (edit-diag-*.json), paměť (rss.jsonl). Hlavní zjištění: importuje se jediná varianta na modul; třída R se v knihovních modulech nenajde (falešné chyby); přejmenování je pomalé (2 až 165 s); androidTest se neimportuje. Zbývá: běh 4 nad čistou kopií (čas studeného startu se zahřátým Gradle), běh 5 restart nad stejným stavem, případně smyšlený projekt pro ověření příčiny selhání importu, záznam rozhodnutí, README, úklid procesů, kontrola otisku checkoutu.

Hotovo (2026-11-18): záznam backlog/decisions/decision-1 (stav proposed) s tabulkou funkcí, časy, pamětí, odezvou, způsobem získání a doporučením; otázka v docs/review-ide/README.md odškrtnutá, poznámka v 02-editor.md doplněná. Sedm běhů nad kopií projektu a pět případů nad smyšleným projektem; skripty a výsledky v ~/.cache/orca-review-ide/task-53 (scripts/REPRODUCE.txt). Vlastní Gradle a Kotlin daemony ukončené, ověřeno výpisem procesů. Checkout projektu: pracovní strom shodný s otiskem před pokusem (739 635 souborů, velikosti a časy změn), git status a HEAD beze změny. Nezbývá nic; čeká na ověření koordinátorem.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pokus s kotlin-lsp 271.2085.0 nad kopií produkčního Android projektu a nad smyšleným dvoumodulovým projektem: ve výchozím nastavení import běžné Android aplikace selže (aplikace s BuildConfig a instrumentovanými testy ve vybrané variantě) a server pak vrací prázdné odpovědi. Po obejití importu fungují reference a doplňování; definice, hover, diagnostika, přejmenování a hledání symbolů jen částečně, hlavně kvůli třídě R v knihovních modulech (falešné chyby). Start 9 až 198 s, paměť serveru 2 až 4,7 GB, při importu s Gradlem až 9 GB. Návrh v decision-1 (proposed): Kotlin v M3 bez language serveru, jen Otevřít v Android Studiu, se třemi podmínkami pro nový pokus. Z počítače nic neodešlo.
<!-- SECTION:FINAL_SUMMARY:END -->
