---
id: TASK-60
title: 'Pokus: proveditelnost extraktorů a schéma modelu kódu'
status: Done
assignee: []
created_date: '2026-11-18T12:42:00Z'
updated_date: '2026-11-19T00:58:00Z'
labels:
  - review-ide
  - effort-xhigh
milestone: m-0
dependencies: []
documentation:
  - docs/review-ide/01-integrace.md
priority: medium
type: spike
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Ověřit, že jeden model kódu jde naplnit ze tří jazyků dost rychle na to, aby se počítal na pozadí, a navrhnout jeho schéma. Na výsledku stojí milníky M4 a M5.

### Postup

- Kotlin: Gradle model projektu a Kotlin PSI (kotlin-compiler-embeddable) na JVM.
- Swift: `swift package describe`, seznam targetů `.xcodeproj` a SwiftSyntax. Jak Orca dnes sestavuje nativní pomocníky, ukazují `config/scripts/build-notification-status-macos.mjs` a `native/`.
- C#: Roslyn jako .NET nástroj.
- Prototypy drž mimo `src/`; do repozitáře patří jen smyšlené projekty pro testy a návrh schématu. Navrhni pro ně umístění, které nekoliduje s upstreamem.
- Na skutečných projektech z `CLAUDE.local.md` jen měř, nad kopií mimo jejich checkout.

### Mimo rozsah

- Obrazovky, intenty a controllery v prototypech; stačí je mít ve schématu.
- Proces na pozadí, cache a RPC v Orce.

### Omezení

- Z firemních projektů nesmí nic odejít ven a do záznamu rozhodnutí nepatří názvy modulů, tříd, adresy ani úryvky kódu.
- Způsob distribuce extraktorů je rozhodnutí uživatele; záznam ho jen připraví s doporučením.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pro Kotlin, Swift a C# existuje spustitelný prototyp, který z malého smyšleného projektu vypíše moduly a závislosti mezi nimi jako JSON ve společném schématu
- [x] #2 Záznam rozhodnutí uvádí pro každý jazyk čas extrakce na skutečném projektu uživatele a co k ní bylo potřeba: build, synchronizace, nástroje
- [x] #3 Záznam porovnává u Kotlinu statické čtení Gradle souborů s Gradle Tooling API a volí jedno jako výchozí
- [x] #4 Návrh schématu verze 0 v docs/review-ide pokrývá moduly a vazby, obrazovky s intenty a přechody, controllery a akce, lokalizační klíče a metriky souborů a říká, co je klíčem cache
- [x] #5 Záznam navrhuje, jak se extraktory dostanou k uživateli: nástroje nainstalované u uživatele, nebo přibalené k Orce, s dopadem na velikost instalace a na platformy
- [x] #6 Smyšlené projekty pro testy jsou v repozitáři a neobsahují firemní kód
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker, 2026-11-19): 1) návrh schématu v0 v docs/review-ide/09-model-kodu.md; 2) smyšlené projekty tests/fixtures/code-model/{kotlin,swift,csharp} s očekávaným JSON; 3) prototypy mimo repozitář v ~/.cache/orca-review-ide/task-60/prototypes (Kotlin: statické čtení Gradle souborů + Tooling API + PSI; Swift: swift package describe + pbxproj + SwiftSyntax; C#: sln/csproj + Roslyn); 4) měření nad kopiemi skutečných projektů v sandboxu bez sítě; 5) záznam rozhodnutí (proposed). Pořadí: schéma a Kotlin, Swift, C#.

Stav 1 (Kotlin hotovo, měřeno): prototyp v ~/.cache/orca-review-ide/task-60/prototypes/kotlin (build.sh, run-static.sh, run-tooling.sh). Smyšlený projekt tests/fixtures/code-model/kotlin-gradle: statické čtení i Tooling API dávají 7 modulů a 12 vazeb shodně. Skutečný Android projekt (kopie, sandbox bez sítě): staticky 39 modulů, 299 vazeb, 77 zdrojových kořenů za 0,4 s; Tooling API totéž za 47 s studeně, 35 s nový worktree se studeným daemonem, 10,6 s nový worktree s běžícím daemonem, 2 až 3 s opakovaně, daemon 1,5 až 2,3 GB. PSI přes 1 983 souborů: 1,2 s, celý model 1,5 až 1,8 s a 0,4 až 0,6 GB. Zbývá: očekávaný JSON, Swift, C#, schéma, záznam.

Stav 2 (Swift hotovo, měřeno): smyšlený projekt tests/fixtures/code-model/swift-ios (ručně psaný .xcodeproj se třemi targety + místní balíček SwiftPM se šesti targety). Prototyp ~/.cache/orca-review-ide/task-60/prototypes/swift (SwiftSyntax 604.0.0; čtečky swift package describe, project.pbxproj, tuist dump project). Fixture: 9 modulů, 13 hran, 14 souborů, 0 problémů. Skutečný projekt iOS (kopie, bez sítě): struktura z tuist dump 51 modulů / 157 hran / 27 vnějších za 0,2–0,3 s teplé (5,2 s první překlad manifestu), z vygenerovaného project.pbxproj 47 modulů / 141 hran za 0,05–0,08 s; průchod SwiftSyntax 1 263 souborů 0,67 s jedno vlákno, 0,21 s 14 vláken, 52–66 MB paměti, 0 chyb parsování. Binárka 17,6 MB (9,2 MB po strip), jen arm64. Zbývá: C#, sjednocení schématu (structure.roots) v prototypu Kotlin, očekávané JSON, dokument schématu, záznam rozhodnutí, brány, úklid kopií.

Stav 3 (hotovo): C# prototyp (~/.cache/orca-review-ide/task-60/prototypes/dotnet, Roslyn 5.0.0, statické čtení .sln/.csproj/Directory.Build.props s podmnožinou podmínek MSBuildu) a smyšlený projekt tests/fixtures/code-model/dotnet-api. Měřeno na dvou backendech: struktura 0,06 a 0,08 s, celý model 0,37 až 1,35 s, shoda s vyhodnocením MSBuildem (92 projektů: 214 hran, 354 balíčků bez rozdílu). Schéma sjednoceno ve všech třech prototypech (structure.roots s members), očekávaná struktura v tests/fixtures/code-model/expected. Návrh schématu docs/review-ide/09-model-kodu.md, záznam decision-9 (stav proposed), otázka v README odškrtnutá. Brány: pnpm tc a check:code-quality:changed prochází. Úklid: kopie projektů, výsledky nad nimi a kopie mezipaměti Gradlu smazané, vlastní démoni ukončení, otisky checkoutů porovnané (viz decision-9, Context). Neověřeno prototypem: references (přechody, použití lokalizačních klíčů), čtení zdrojů lokalizace, cache; návrh navazujících tiketů je ve zprávě workera.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Jeden model kódu jde naplnit ze tří jazyků dost rychle na výpočet na pozadí, bez buildu, synchronizace, obnovy balíčků i sítě: celý model skutečného projektu Androidu (necelé 2 000 souborů) za 1,5 až 1,8 s, iOS pod 1 s, backendy do 1,4 s. Tři prototypy (Kotlin, Swift, C#) vypisují moduly a závislosti ve společném schématu a nad smyšlenými projekty dávají přesně očekávaný výstup. U Kotlinu dalo statické čtení souborů Gradlu na skutečném projektu stejný graf jako Gradle Tooling API, za zlomek času a bez démona, spouštění kódu projektu a zápisu do worktree; u C# se statická čtečka shodla s vyhodnocením MSBuildem. Návrh v decision-9 (proposed): schéma verze 0 podle docs/review-ide/09-model-kodu.md, cache podle obsahu souboru místo commitu, statické čtení build souborů jako výchozí ve všech třech jazycích; způsob distribuce extraktorů je připravený k rozhodnutí uživatele s doporučením přibalit vlastní kód a knihovny stáhnout při prvním použití. Smyšlené projekty jsou v tests/fixtures/code-model. Prototypem neověřená zůstala část schématu o voláních (přechody mezi obrazovkami, použití lokalizačních klíčů). Extraktor Swiftu je jen pro macOS. Prototypy jsou mimo repozitář v ~/.cache/orca-review-ide/task-60/prototypes; nezkoušeno na Windows, Linuxu ani přes SSH. docs/review-ide/01-integrace.md se od návrhu liší a upraví se až po přijetí decision-9.
<!-- SECTION:FINAL_SUMMARY:END -->
