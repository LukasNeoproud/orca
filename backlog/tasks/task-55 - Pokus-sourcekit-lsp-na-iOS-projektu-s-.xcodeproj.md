---
id: TASK-55
title: 'Pokus: sourcekit-lsp na iOS projektu s .xcodeproj'
status: Done
assignee: []
created_date: '2026-11-18T12:41:00Z'
updated_date: '2026-11-18T20:16:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-0
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
priority: medium
type: spike
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Ověřit, že sourcekit-lsp z toolchainu Xcode použitelně funguje na skutečném iOS projektu s `.xcodeproj`, ne jen na Swift balíčku. Dokumentace počítá s build serverem (např. xcode-build-server).

### Postup

- Pracuj nad kopií iOS projektu uvedeného v `CLAUDE.local.md` (sekce Review IDE), vytvořenou mimo jeho checkout.
- Build jen pro simulátor, bez podepisování.
- Server ovládej skriptem přes stdio, aby šla měření zopakovat. Skript z pokusu s kotlin-lsp použij znovu, pokud už existuje v `~/.cache/orca-review-ide`.

### Mimo rozsah

- Integrace do Orky, fyzická zařízení, SwiftUI Preview.

### Omezení

- Z firemních projektů nesmí nic odejít ven a do záznamu rozhodnutí nepatří názvy modulů, tříd, adresy ani úryvky kódu. Uváděj jen míry a obecné závěry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Záznam rozhodnutí uvádí pro definici, reference, hover, doplňování, diagnostiku, přejmenování a hledání symbolů stav funguje, částečně nebo nefunguje na souborech z hlavního targetu a z aspoň jednoho Swift balíčku projektu
- [x] #2 Záznam popisuje, co je potřeba připravit, než server odpovídá: build server, první build, index; s časem a místem na disku
- [x] #3 Záznam uvádí změřenou paměť procesu a dobu odezvy na opakované dotazy
- [x] #4 Záznam končí doporučením, zda Orca přípravu udělá sama, nebo ji vyžádá od uživatele, a co se stane bez ní
- [x] #5 Checkout uživatelova projektu zůstal beze změny, včetně nesledovaných souborů
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker, 2026-11-18): 1) otisk checkoutu iOS projektu před pokusem (HEAD, index, výpis všech souborů s velikostí a časem změny); 2) kopie commitnutého stromu přes git archive do ~/.cache/orca-review-ide/task-55/project, bez podpisových klíčů a tajemství; 3) projekt je generovaný Tuistem, .xcodeproj v gitu není: vygenerovat ho v kopii bez sítě (závislosti SwiftPM z místní mezipaměti), změřit; 4) sourcekit-lsp bez přípravy (výchozí chování nad kořenem); 5) build pro simulátor bez podpisu do vlastního DerivedData v sandboxu bez sítě, změřit čas a disk; 6) xcode-build-server do ~/.cache/orca-review-ide/tools, buildServer.json v kopii, baterie dotazů skriptem z TASK-53 (definice, reference, hover, doplňování, diagnostika, přejmenování, hledání symbolů) na souborech hlavního targetu, frameworku a Swift balíčku, 5 opakování; 7) paměť, start do první diagnostiky, zastarání po změně bez buildu, zápisy do worktree; 8) úklid procesů, otisk po pokusu, záznam rozhodnutí, README a 02-editor.md.

Průběh 1: otisk checkoutu před pokusem uložen (fingerprint/before). Kopie z git archive hotová, hodnoty v konfiguraci Firebase nahrazené zástupnými. Projekt je generovaný (Tuist), .xcodeproj není v gitu; vygenerován v kopii offline ze závislostí naklonovaných z místní mezipaměti. sourcekit-lsp nejde spustit pod sandbox-exec (služba sourcekitd nenaběhne), sandbox proto jen pro build, generátor a build server. Skripty: ~/.cache/orca-review-ide/task-55/scripts. Zbývá: build, buildServer.json, baterie dotazů, paměť, zastarání, úklid, otisk po, záznam rozhodnutí, README a 02-editor.md.

Průběh 2 (hotovo): build pro simulátor v sandboxu bez sítě (aplikace 77 s, vše včetně testů 89 s), buildServer.json přes xcode-build-server 1.3.0, baterie dotazů 5× na 7 souborech, starty (první, bez mezipaměti, restart, push), paměť, zastarání (paměť, disk, build, nový soubor), běh při souběžném buildu, stavy bez přípravy, dotaz na důvěru. Výsledky: ~/.cache/orca-review-ide/task-55/results, postup v scripts/REPRODUCE.txt. Záznam: decision-3 (proposed). Dokumentace: README (otázka odškrtnutá), 02-editor.md (řádek iOS a odrážka Připravenost). Otisk checkoutu před a po shodný (fingerprint/before, fingerprint/after). Mimo plán: jeden běh sourcekit-lsp bez sandboxu spadl do režimu balíčku a naklonoval 28 veřejných repozitářů závislostí do ~/Library/Caches/org.swift.swiftpm/repositories (466 MB); tři volání tuist mimo sandbox v adresáři Orky (bez změny souborů). Těžké složky pokusu (kopie projektu, DerivedData) smazané, skripty a výsledky zůstaly.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pokus se sourcekit-lsp nad kopií produkčního iOS projektu (generovaný projekt Xcode): přes xcode-build-server a nad sestaveným worktree fungují všechny zkoušené funkce bez falešných chyb, odezva v jednotkách až desítkách ms, restart do první diagnostiky 0,9 s, paměť ve špičce 1,9 GB. Bez buildu dostane každý soubor falešnou chybu a přejmenování je tiše neúplné. Příprava: vygenerování projektu 19 s, build 77 až 89 s a 2,1 až 2,4 GB na worktree. Návrh v decision-3 (proposed): Swift v M3 language server dostane jen nad sestaveným worktree; buildServer.json a hlídání stáří buildu udělá Orca, build spustí uživatel nebo agent; projekt Xcode se nikdy neotevírá jako Swift balíček. Incidenty při pokusu: jeden běh serveru mimo sandbox naklonoval 28 veřejných repozitářů závislostí do mezipaměti SwiftPM (kód projektu neodešel); tři volání tuist proběhla mimo sandbox; čtyři hlášení o pádu serveru worker smazal a nelze vyloučit, že je systém odeslal Applu. Checkout projektu je podle otisku beze změny.
<!-- SECTION:FINAL_SUMMARY:END -->
