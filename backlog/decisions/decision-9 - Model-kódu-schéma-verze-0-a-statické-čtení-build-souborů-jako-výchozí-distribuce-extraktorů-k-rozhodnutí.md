---
id: decision-9
title: >-
  Model kódu: schéma verze 0 a statické čtení build souborů jako výchozí,
  distribuce extraktorů k rozhodnutí
date: '2026-11-19T00:49:00Z'
status: proposed
---
## Context

Analytické jádro má všem pohledům dávat jeden model kódu z extraktorů podle jazyka ([01-integrace.md](../../docs/review-ide/01-integrace.md), oddíl Analytické jádro). Pokus TASK-60 měl před stavbou jádra zjistit, jestli jsou extraktory proveditelné, jak rychlé jsou na skutečných projektech, co potřebují, jak má vypadat společné schéma a jak se extraktory dostanou k uživateli.

- **Prototypy:** tři spustitelné extraktory se stejnými příkazy a stejným výstupem JSON.
  - **Kotlin:** statické čtení Gradle Kotlin DSL a průchod zdrojů přes Kotlin PSI (kotlin-compiler-embeddable 2.4.21) na JVM. Pro porovnání druhá čtečka přes Gradle Tooling API 8.14.5 s vloženým init skriptem.
  - **Swift:** SwiftSyntax 604.0.0; struktura z `swift package describe`, z `project.pbxproj` a z `tuist dump project`.
  - **C#:** nástroj .NET nad Roslynem 5.0.0 (jen syntaktické stromy); struktura z `.sln`, `.csproj`, `Directory.Build.props` a `Directory.Packages.props`. Pro porovnání vyhodnocení MSBuildem (`dotnet msbuild -getItem`).
- **Skutečné projekty** (kopie commitnutého stromu mimo checkout, bez složek sestavení):
  - **Android:** 39 modulů Gradle (1 aplikace, 36 knihoven Android, 2 knihovny JVM), 1 983 souborů Kotlin, zhruba 150 tisíc řádků, Kotlin DSL, katalog verzí, sdílená logika v `buildSrc` a v kořenovém build souboru.
  - **iOS:** projekt generovaný Tuistem, 51 targetů (1 aplikace, 26 frameworků, 24 testovacích), 1 263 souborů Swift, 126 tisíc řádků. Soubor `.xcodeproj` v gitu není.
  - **Backend A:** 10 projektů (6 pro .NET 6, 4 pro .NET Framework), 4 řešení, 610 souborů C#, 54 tisíc řádků, `global.json` připíná SDK 6.
  - **Backend B:** 92 projektů pro .NET 8 a 10, 2 řešení, 871 souborů C#, 122 tisíc řádků, centrálně připnuté verze balíčků, 15 souborů `Directory.Build.props` s podmínkami.
- **Smyšlené projekty:** tři projekty téhož obchodu v [`tests/fixtures/code-model`](../../tests/fixtures/code-model/README.md), bez firemního kódu.
- **Stroj:** Apple M4 Pro, 14 jader, 48 GB RAM. JDK 21, Swift 6.4, .NET SDK 8, 9 a 10. Časy jsou celé běhy procesu včetně startu, není-li řečeno jinak.
- **Sandbox a síť:** všechno nad kopiemi skutečných projektů běželo pod `sandbox-exec` bez sítě, se zápisem jen do složky pokusu, s náhradní domovskou složkou a bez přístupu k checkoutům a přihlašovacím údajům. Gradle s `--offline` nad kopií uživatelovy mezipaměti závislostí, MSBuild bez obnovy balíčků, SwiftPM a Tuist bez rozřešení balíčků. Síť dostalo jen sestavení prototypů a smyšlené projekty (veřejné zdroje).
- **Checkouty projektů:** kopie jsou smazané. Otisk dvou checkoutů před pokusem a po něm je úplně shodný. U zbylých dvou se shoduje HEAD, index, stav a obsah všech sledovaných i nesledovaných neignorovaných souborů; liší se jen soubory, které během pokusu přepisovaly uživatelovy vlastní běžící nástroje (poznámky relace agenta a metadata `git fetch` u jednoho, ignorovaná výstupní složka přepisovaná uživatelovým `dotnet restore` u druhého).
- **Podklady:** prototypy a postup spuštění jsou v `~/.cache/orca-review-ide/task-60/prototypes` (`RUN.md`), mimo repozitář. Výsledky nad skutečnými projekty jsou smazané, protože nesou jména z firemního kódu.

## Findings

### Čas a nároky podle jazyka

| | Android (Kotlin) | iOS (Swift) | Backend A (C#) | Backend B (C#) |
| --- | --- | --- | --- | --- |
| Struktura | 0,36 až 0,47 s | 0,05 až 0,08 s z `project.pbxproj`; 0,2 až 0,3 s z Tuistu (5,2 s napoprvé) | 0,06 s | 0,08 s |
| Průchod všech souborů, 1 vlákno (jen krok parsování) | 1,0 až 1,3 s | 0,47 až 0,58 s | 0,69 s | 1,25 s |
| Průchod všech souborů, 4 až 14 vláken (jen krok parsování) | 0,62 až 0,68 s | 0,07 až 0,15 s | 0,27 s | 0,50 až 0,58 s |
| Celý model | 1,5 až 1,8 s | 0,73 až 0,83 s (1,7 s napoprvé) | 0,37 až 0,72 s | 0,66 až 1,35 s |
| 1 změněný soubor | 0,29 s | 0,02 s | neměřeno | 0,10 s |
| 20 změněných souborů | 0,36 až 0,39 s | 0,02 s | neměřeno | 0,18 s |
| Paměť na vrcholu | 0,39 až 0,64 GB | 52 až 66 MB | 107 až 117 MB | 157 až 166 MB |
| Výstup JSON s osnovou deklarací | 5,9 MB | 4,1 MB | 1,9 MB | 6,1 MB |
| Chyby parseru | 0 | 0 | 0 | 0 |

| Co bylo potřeba | Android | iOS | Backend |
| --- | --- | --- | --- |
| Build | ne | ne | ne |
| Sync, generování nebo obnova balíčků | ne | ne (`tuist install` ani `tuist generate` neproběhly) | ne (`dotnet restore` neproběhl) |
| Síť | ne | ne | ne |
| Nástroje na stroji | JVM (běželo na JDK 21) | pro fakta nic; pro strukturu `tuist` a kompilátor Swiftu, nebo vygenerovaný `.xcodeproj` | běhové prostředí .NET 8 nebo novější |
| Zápis do worktree | žádný | žádný | žádný |

- **Výstup je deterministický:** stejné bajty při 1, 4 i 14 vláknech u všech tří extraktorů.
- **Kotlin PSI stojí hlavně start:** 0,18 až 0,25 s zabere prostředí parseru, samotné čtení build souborů 0,14 až 0,17 s. Vstup do parseru je v Kotlinu 2.4 označený jako API, které se bude měnit; prototyp varování potlačuje a produkt musí verzi kompilátoru připnout. Kompilátor 2.4.21 přečetl projekt psaný v Kotlinu 2.1 bez chyby.
- **Tuist:** `tuist dump project` vyhodnotí manifest bez instalace závislostí a bez generování, bez sítě a bez zápisu do worktree. Kořenový `Package.swift` je u projektu Tuistu jen seznam závislostí generátoru a `swift package describe` z něj nevrátí žádný target.
- **Vygenerovaný `.xcodeproj`** se čte jako seznam vlastností bez Xcode (1,3 MB za 7 ms). Byl starší než HEAD, proto má 47 targetů proti 51 v manifestu; kde existuje manifest Tuistu, má mít přednost.
- **Projekty mimo repozitář:** backend A odkazuje 11 projektů ze sousedních repozitářů, které v kopii nejsou. Statická čtečka je ohlásí a zařadí mezi vnější závislosti.

### Kotlin: statické čtení proti Gradle Tooling API

Obě čtečky daly na skutečném projektu stejné moduly, stejné hrany a stejné kořeny zdrojů: 39 modulů, 299 hran mezi moduly (285 různých dvojic), 77 kořenů zdrojů. Na smyšleném projektu také (7 modulů, 12 hran, 9 kořenů zdrojů, 12 vnějších závislostí).

| | Statické čtení | Gradle Tooling API |
| --- | --- | --- |
| Čas | 0,36 až 0,47 s | 47 s se studeným démonem; 35 s v novém worktree se studeným démonem; 10,6 s v novém worktree s běžícím démonem; 2,0 až 3,2 s opakovaně nad stejným worktree |
| Paměť | proces skončí | démon zůstává, 1,5 až 2,3 GB |
| Potřebuje | JVM | JDK, které projekt vyžaduje, Android SDK, distribuci Gradlu a všechny pluginy a závislosti v mezipaměti nebo síť |
| Spouští kód projektu | ne, čte text | ano, build skripty i `buildSrc` |
| Zápis do worktree | žádný | `.gradle`, `build`, `buildSrc/build` (zhruba 0,8 MB) |
| Místo deklarace hrany | soubor a řádek, případně konvenční plugin | nezná |
| Vnější závislosti | jen zapsané v build souborech | navíc 40, které přidávají pluginy |
| Když build nejde nakonfigurovat | čte dál a hlásí, co nerozhodlo | nevrátí nic |
| Neumí | Groovy DSL, `include` složený za běhu, binární konvenční pluginy, obecné podmínky | |

- **Statická čtečka musela umět víc než `dependencies {}` v modulu.** Napoprvé jí chybělo 36 hran, které kořenový build soubor přidává všem modulům s určitým pluginem (`subprojects`, `pluginManager.withPlugin`, `dependencies.add`). Po doplnění je výsledek shodný a čtečka nehlásí žádný problém.
- **Tooling API bez sítě fungovalo jen proto, že všechny závislosti byly v mezipaměti.** Smyšlený projekt bez sítě nenakonfiguroval, dokud se nestáhl plugin, který v mezipaměti chyběl.
- **Init skript musel hrany filtrovat:** bez omezení na deklarační konfigurace vracel 26 hran místo 12 (závislosti modulu na sobě a odvozené konfigurace).

### C#: statické čtení proti MSBuildu

| | Statické čtení | Vyhodnocení MSBuildem |
| --- | --- | --- |
| Backend B, 92 projektů | 0,08 s | 19,4 s po jednom, 3,3 s v osmi procesech |
| Shoda na backendu B | 214 hran, 354 odkazů na balíčky včetně verzí, druhy projektů a cílové frameworky: bez rozdílu | |
| Backend A | 0,06 s | nespustí se: `global.json` žádá SDK 6, která na stroji není. Po odebrání připnutí v kopii 2,0 s a stejné odkazy |
| Testovací projekty | pozná podle balíčků | bez obnovy balíčků nepozná, vlastnost nastavuje až balíček |

- **Bez vyhodnocení podmínek je statické čtení špatně.** První verze označila všech 92 projektů backendu B za testovací, protože `Directory.Build.props` přidává balíčky podle jména projektu. Stačila podmnožina podmínek: porovnání řetězců a vlastností, `And`, `Or`, `!`, `Exists` a řetězcové funkce `StartsWith`, `EndsWith`, `Contains`. Co se rozhodnout nedá (konfigurace, platforma, volání MSBuildu), zůstává nerozhodnuté a ohlásí se.
- **152 z 354 odkazů na balíčky** backendu B nepochází z projektů, ale z `Directory.Build.props`; verze dává `Directory.Packages.props`.
- **Staré projekty .NET Frameworku** statická čtečka čte stejně jako nové, jen závislosti jsou v nich zapsané jako odkazy na sestavení (52 odkazů).

### Rozpoznání z osnovy deklarací

Extraktory nekompilují a typy vypisují jako text. Na skutečných projektech přesto anotace, nadtypy a jména stačí k nalezení toho, co pohledy potřebují:

| Projekt | Nalezeno jen z osnovy |
| --- | --- |
| Android | 113 view modelů, 115 obrazovek mezi 1 555 composable funkcemi, 271 typů stavu, intentů a efektů (155 zapečetěných), 113 funkcí klienta API s anotací metody HTTP |
| iOS | 108 pohledů SwiftUI, 212 pozorovatelných tříd a view modelů, 48 view controllerů |
| Backend A | 32 controllerů, 141 akcí |
| Backend B | 78 controllerů (77 s prefixem cesty), 275 akcí, 189 atributů autorizace, 221 parametrů s určeným zdrojem |

Všechny akce ležely v rozpoznaných controllerech. Jestli je cesta v anotaci klienta API vždy zapsaná jako text, nebo někde odkazem na konstantu, pokus nerozlišil; odkaz by jádro muselo dohledat v jiné deklaraci.

### Velikost extraktorů

| Extraktor | Vlastní kód | Závislosti | Běhové prostředí |
| --- | --- | --- | --- |
| Kotlin | 87 kB (`.jar`) | 62 MB knihoven z Maven Central, stejné pro všechny platformy | JVM. Nejmenší sestavení přes `jlink`, na kterém prototyp běží, má 45 MB na platformu; menší bez `java.desktop` (33 MB) spadne |
| Swift | 17,6 MB binárka pro arm64, 9,2 MB po odstranění symbolů | žádné, odkazuje jen systémové knihovny | žádné, běhové knihovny Swiftu jsou součástí macOS |
| C# | 66 kB (`.dll`) | 10 MB (Roslyn z nuget.org) | .NET 8 nebo novější. Samostatné sestavení bez požadavku na .NET má 82 MB, s ořezáním 17,6 MB na platformu a dalo na backendu B stejný výstup |

Sestavení prototypu pro Swift trvalo 2,5 minuty (swift-syntax) a potřebuje Xcode. Orca už dnes sestavuje pomocné programy ve Swiftu při vlastním buildu a přikládá je jen k macOS.

### Nezkoušeno

- Volání (`references`), a tedy přechody mezi obrazovkami, použití lokalizačních klíčů a koncové body minimal API. Schéma je navrhuje, žádný prototyp je nevypisuje.
- Čtení zdrojů lokalizace, párování volání API s akcemi backendu, samotná cache a skládání snímku.
- Windows a Linux: všechno běželo na macOS. JVM a .NET jsou přenositelné; sestavení extraktoru pro Swift mimo macOS vyzkoušené není.
- SSH: extraktor má běžet na hostiteli, kde je kód. Doprava extraktoru na vzdálený stroj vyzkoušená není.
- Groovy DSL v Gradlu, Kotlin Multiplatform, projekty Xcode se skupinami místo synchronizovaných složek ve větším měřítku, řešení `.slnx` na skutečném projektu.
- Tree-sitter jako jeden parser pro všechny tři jazyky v procesu Orky. Odpadla by distribuce i běhová prostředí; gramatiky pro Kotlin a Swift jsou komunitní a za jazykem zaostávají. Orca tree-sitter dnes nepoužívá.
- Kotlin: zdrojové soubory smyšleného projektu se nekompilovaly, jen parsovaly; Gradle projekt nakonfiguroval. Balíček Swiftu se sestavil a řešení .NET se sestavilo a prošlo testy.

## Decision

Návrh:

1. **Schéma verze 0** podle [09-model-kodu.md](../../docs/review-ide/09-model-kodu.md). Extraktor odevzdává strukturu a fakta o souborech; obrazovky, intenty, přechody, controllery, akce a použití lokalizačních klíčů skládá jádro Orky podle rozpoznávacího profilu v nastavení projektu.
2. **Klíč cache je obsah, ne commit.** Fakta o souboru se ukládají pod otiskem obsahu souboru, verzí extraktoru a verzí schématu; struktura pod otiskem build souborů; složený snímek pod otiskem stromu. Cache je na hostiteli, který kód vykonává, a sdílí se mezi worktrees.
3. **Kotlin: výchozí je statické čtení souborů Gradlu.** Je o dva řády rychlejší, nic nespouští, nic nezapisuje, nepotřebuje síť ani Android SDK a zná řádek deklarace. Gradle Tooling API zůstává jako doplněk na žádost uživatele pro projekty, kde statická čtečka ohlásí, že něco nerozhodla.
4. **Swift a C# také staticky:** `project.pbxproj`, `tuist dump project` a `swift package describe` pro Swift (manifest Tuistu má přednost před vygenerovaným projektem), soubory řešení a projektů s podmnožinou podmínek MSBuildu pro C#. MSBuild se pro model nepouští.
5. **Distribuce je rozhodnutí uživatele.** Doporučení je varianta B:

| Varianta | Instalátor Orky | První použití | Co musí mít uživatel |
| --- | --- | --- | --- |
| A. Všechno přibalit včetně běhových prostředí | macOS zhruba +145 MB (Kotlin 62 + JVM 45, Swift 18 pro obě architektury, C# 18); Windows a Linux zhruba +125 MB (odhad podle měření na macOS) | nic | nic |
| B. Přibalit vlastní kód, veřejné knihovny stáhnout při prvním použití, běhová prostředí vzít od uživatele | macOS zhruba +18 MB (Swift), jinde pod 1 MB | stáhne 62 MB z Maven Central pro Kotlin a 10 MB z nuget.org pro C#, s připnutou verzí a kontrolním součtem | JVM pro Kotlin, .NET 8+ pro C# |
| C. Všechno sestavit z nástrojů uživatele | beze změny | sestavení swift-syntax 2,5 minuty a Xcode | JDK, Xcode, .NET SDK |

- **Proč B:** kdo vyvíjí Android, má JDK (Android Studio ho přibaluje), a kdo vyvíjí backend, má .NET. Stejně už pokusy navrhly language servery: z nástrojů uživatele nebo stažené na jeho stroj ([decision-3](./decision-3%20-%20Swift-v-editoru-M3-sourcekit-lsp-přes-build-server-jen-nad-sestaveným-worktree.md), [decision-4](./decision-4%20-%20C-v-editoru-M3-Roslyn-language-server-nad-obnoveným-worktree-csharp-ls-jako-záloha.md)). Instalátor neroste o 125 MB kvůli jazykům, které uživatel nepoužívá.
- **Cena B:** recenzent bez JDK nebo bez .NET nedostane model cizí platformy, dokud si prostředí nenainstaluje; pohled to musí říct. První použití potřebuje síť.

## Consequences

- **Platformy:** extraktor pro Swift je ve všech variantách jen pro macOS. Na Windows a na Linuxu model iOS nebude, dokud se nevyzkouší sestavení pro tyto systémy nebo jiný parser.
- **SSH:** extraktor a cache patří na hostitele s kódem. Ve variantě B musí vzdálený stroj stahovat sám, nebo mu Orca knihovny nahraje; cesta přes relay je samostatná práce.
- **Statické čtečky je potřeba držet při životě:** nový zápis v build souborech, který čtečka nezná, musí skončit jako ohlášený problém, ne jako tichá díra v grafu. Smyšlené projekty a jejich očekávaná struktura jsou první sada testů.
- **Groovy DSL** statická čtečka Gradlu neumí. Projekt s `build.gradle` dostane buď čtečku pro Groovy, nebo Tooling API jako jedinou cestu; rozhodne se, až takový projekt bude potřeba.
- **Verze kompilátoru Kotlinu je připnutá** v extraktoru a s novou jazykovou verzí se zvedá ručně.
- **Rozpoznávací profil je konfigurace, kterou někdo musí napsat:** výchozí profily pro Compose, SwiftUI s UIKitem a ASP.NET Core dodá Orca, odchylky projektu jdou do jeho nastavení.
- **Před stavbou navigačního grafu a lokalizace je potřeba malý pokus nad `references`,** protože tuhle část schématu žádný prototyp neověřil.
- **Otevřené:** jestli místo tří extraktorů nestačí tree-sitter. Stojí za krátké porovnání dřív, než se extraktory začnou produktizovat, protože by odstranilo distribuci, běhová prostředí i omezení Swiftu na macOS.
