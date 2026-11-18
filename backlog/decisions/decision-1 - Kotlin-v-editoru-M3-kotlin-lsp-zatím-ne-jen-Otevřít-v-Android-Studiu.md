---
id: decision-1
title: 'Kotlin v editoru M3: kotlin-lsp zatím ne, jen Otevřít v Android Studiu'
date: '2026-11-18T17:15:00Z'
status: proposed
---
## Context

Editor v M3 má dostat language servery ([02-editor.md](../../docs/review-ide/02-editor.md)). Pro Kotlin dokumentace počítala s kotlin-lsp od JetBrains a nechávala otevřené, jestli zvládne Android projekt s Gradle variantami. TASK-53 to ověřil pokusem.

- **Server:** kotlin-lsp 271.2085.0 z 12. 11. 2026, samostatný archiv pro macOS arm64, spouštěný `bin/intellij-server --stdio --data-sharing=none`.
- **Projekt:** produkční Android aplikace: 40 Gradle projektů (aplikace, 36 knihovních Android modulů, pomocné moduly), 1 983 souborů Kotlinu, zhruba 150 tisíc řádků, tři build typy bez flavorů, AGP 8.10.1, Kotlin 2.1.20, Gradle 8.14.5. Při buildu vzniká `BuildConfig` a třídy `R`; jiný generovaný zdrojový kód projekt nemá.
- **Stroj:** Apple silicon, 14 jader, 48 GB RAM.
- **Postup:** kopie commitnutého stromu mimo checkout, server ovládaný skriptem přes stdio (initialize, didOpen, dotazy, každý dotaz opakovaně). Server i Gradle běžely v sandboxu bez vnější sítě a bez práva zápisu mimo složku pokusu, s vlastním Gradle home a kopií mezipaměti závislostí jen pro čtení.
- **Kontrolní projekt:** smyšlený projekt o dvou modulech (aplikace a knihovna) se stejnou verzí AGP, na kterém jsme ověřili, že nálezy nejsou zvláštností jednoho projektu.
- **Podklady:** skripty a výsledky jsou v `~/.cache/orca-review-ide/task-53` (`scripts/REPRODUCE.txt`), mimo repozitář.

## Findings

### Import projektu

Ve výchozím nastavení import selže a server pak nedělá nic.

- Selže vlastní Android model builder serveru: ptá se na výstup úlohy `generate…AndroidTestBuildConfig`, která při importu neběžela. Server to ohlásí vlastní notifikací `intellij/workspaceImportState` se stavem `FAILED` a zprávou `window/logMessage`; `window/showMessage` nepošle.
- Po selhání vrací hover, definice, diagnostika i hledání symbolů prázdný výsledek. Editor by vypadal, jako by soubor neměl žádné problémy.
- Smyšlený projekt ukázal, kdy k tomu dojde: vždy, když má varianta vybraná serverem instrumentované testy (`androidTest`) a modul aplikace generuje `BuildConfig`. To je běžné nastavení Android aplikace.

| Smyšlený projekt | Vybraná varianta | Import |
| --- | --- | --- |
| build typy debug a release, `BuildConfig` zapnutý | debug | selže |
| totéž, `BuildConfig` vypnutý | debug | projde |
| přidaný třetí build type, testy nad debug | přidaný build type | projde |
| přidaný třetí build type, testy nad ním | přidaný build type | selže |

Na produkčním projektu import prošel až po přepnutí build typu instrumentovaných testů přes vlastnost Gradle, kterou projekt náhodou má. Obecný projekt takový přepínač nemá a Orca nemůže měnit build uživatele. Všechna další měření jsou z tohoto obejitého stavu.

Co import dělá, když projde:

- **Spouští build.** Na čistém worktree proběhlo 1 313 úloh včetně kompilace Kotlinu všech 36 knihovních modulů ve všech třech build typech. Do worktree zapsal 0,72 GB (`build/`, `.gradle/`, `.kotlin/`).
- **Opakuje se při každém startu.** I nad uloženým stavem trvá synchronizace s Gradlem 22 s.
- **Vybere jedinou variantu na modul** a nenašli jsme volbu, jak ji změnit. Zdroje ostatních build typů se neanalyzují. `androidTest` se importuje, jen když patří k vybrané variantě; na produkčním projektu k ní nepatřil a jeho soubory zůstaly bez diagnostiky i navigace.

### Funkce

Měřeno na pěti souborech: dva z modulu aplikace (jeden používá generovaný `BuildConfig`, druhý leží ve zdrojové sadě jen pro některé build typy), jeden z funkčního modulu a dva ze sdílených knihoven. Doplňkově soubor aplikace s `R`, unit test a instrumentovaný test.

| Funkce | Modul aplikace (varianty, generovaný kód) | Funkční modul | Sdílené knihovny | Stav |
| --- | --- | --- | --- | --- |
| Definice | Funguje i mezi moduly, do generovaného `BuildConfig` vybrané varianty, do `R` a do Android SDK (dekompilovaná kostra přes URI `jar:`) | Funguje, kromě `R` | Funguje | Částečně |
| Reference | Funguje | Funguje | Funguje napříč moduly (81 výskytů ve 3 modulech) | Funguje, první dotaz na vlastnost trvá 12 až 16 s |
| Hover | Funguje včetně generovaných konstant a SDK | Funguje, kromě `R` | Funguje | Částečně |
| Doplňování | Funguje včetně členů `BuildConfig` a `R` | Funguje | Funguje | Funguje |
| Diagnostika | Bez falešných chyb, skutečné chyby hlásí | 6 falešných chyb v jednom souboru | Bez falešných chyb v souborech bez `R` | Částečně |
| Přejmenování | Správné úpravy včetně přejmenování souboru, 11 až 13 s | Správné úpravy, 2 s | Správné úpravy napříč moduly, až 165 s | Částečně |
| Hledání symbolů | Najde třídy ze všech zdrojových sad | Funguje | Funguje | Částečně: nenajde generované třídy ani třídy Android SDK |

Hlavní vada je třída `R`:

- V knihovních modulech se `R` nenajde, ať jde o vlastní `R` modulu, nebo o `R` sdíleného modulu se zdroji. Každý soubor, který používá resources, tak dostane falešné chyby `Unresolved reference 'R'`: 6 a 18 ve dvou zkoušených souborech.
- V modulu aplikace `R` funguje, protože server připojí jen souhrnný `R.jar` aplikace.
- Smyšlený projekt chybu zopakoval, takže nejde o nastavení jednoho projektu.

Další postřehy:

- Hover na některých knihovních funkcích nevrátí nic.
- Inspekce hlásí u funkcí Compose varování o velkém písmenu v názvu, které Android Studio potlačuje.
- Definice do knihoven vede do souborů `.class` s URI `jar:`; klient musí umět `workspace/textDocumentContent`.
- Bez importu (import vypnutý volbou `buildTools`) funguje jen struktura souboru. Server pak zabere 0,7 GB a nastartuje za 3 s.

### Čas od startu do první diagnostiky

| Stav | Import hotový | Server připraven | První skutečná diagnostika |
| --- | --- | --- | --- |
| Výchozí nastavení | selže po 26 až 161 s | nikdy | nikdy |
| Čistý worktree, studený Gradle (bez daemonu a mezipaměti buildu) | 155 s | 197 s | 198 s |
| Čistý worktree, zahřátý Gradle | 68 s | 113 s | 113 s |
| Worktree s hotovým buildem, nový stav serveru | 26 s | 67 s | neměřeno |
| Restart nad uloženým stavem | 27 s | 28 s | 9 s |

- Na čistém worktree se zahřátým Gradlem z toho 64 s zabere build spuštěný importem a 41 s indexace.
- Se studeným Gradlem trvá samotný build 150 až 158 s.
- Tři sekundy po startu server pro otevřený soubor publikuje prázdnou diagnostiku, i když analýza ještě neproběhla.

### Paměť

| Proces | Paměť (RSS) |
| --- | --- |
| Server po načtení projektu | 3,0 GB |
| Server při dotazech | 2,2 až 2,6 GB |
| Server při indexaci, špička | 4,1 až 4,7 GB |
| Gradle daemon při importu | 2,4 až 2,8 GB |
| Kotlin daemony při importu čistého worktree | až 6,2 GB |
| Součet ve špičce | 9,2 GB |

Index zabere 1,4 GB na disku na jeden worktree. Výchozí halda serveru je 2 GB a varování o nedostatku paměti se neobjevilo. Gradle daemon po importu zůstává běžet.

### Odezva na opakované dotazy

Pět opakování každého dotazu, dvě nezávislé relace se shodnými výsledky.

| Dotaz | První volání | Medián opakování |
| --- | --- | --- |
| Hover | 2 až 77 ms | 1 až 3 ms |
| Definice | 1 až 31 ms | do 1 ms |
| Doplňování | 0,2 až 1,7 s | 40 ms až 1,0 s |
| Reference | 0,1 až 16 s | 2 až 87 ms |
| Přejmenování | 0,5 až 13 s; vlastnost rozhraní s 86 úpravami v 16 souborech 161 až 169 s | stejné jako první volání |
| Struktura souboru | 2 až 5 ms | 1 ms |
| Hledání symbolů | 27 ms až 1,2 s | 27 ms až 0,8 s |
| Diagnostika na vyžádání | 15 ms až 0,6 s | 6 až 38 ms |
| Diagnostika po úpravě souboru | 0,4 až 2,4 s | |

Pomalé první reference se po jiných operacích vracejí; výsledek se neudrží trvale.

### Získání serveru

- **Zdroj:** vydání na GitHubu `Kotlin/kotlin-lsp` odkazují na archivy na `download.jetbrains.com`. Existují pro macOS, Linux a Windows, vždy x64 a arm64, každý se souborem `.sha256`. Stejnou verzi nabízí Homebrew cask `kotlin-lsp`.
- **Verze:** 271.2085.0, stav alfa, podpora Android Gradle Pluginu je označená jako experimentální. Posledních šest vydání vyšlo od června do listopadu, zhruba jedno za měsíc.
- **Velikost:** 364 MB ke stažení, 1,1 GB po rozbalení. Obsahuje vlastní Javu (JBR 25); pro import potřebuje navíc JDK, které vyhovuje Gradlu projektu.
- **Licence:** repozitář je pod Apache 2.0, server je podle README zčásti uzavřený. Rozšíření pro VS Code je pod JetBrains Free Plugin License. Samostatný archiv žádný vlastní licenční text ani EULA neobsahuje, jen licence třetích stran; spustí se bez licenčního klíče i bez potvrzení EULA.
- **Může ho Orca stáhnout sama:** technicky ano, adresa je veřejná, bez přihlášení a s kontrolním součtem. Podmínky pro automatické stahování samostatného archivu cizí aplikací ale nejsou nikde napsané a před zavedením je potřeba je potvrdit.
- **Telemetrie:** samostatný spouštěč má výchozí `--data-sharing=none`; v pokusu byla volba zadaná výslovně. I tak se server při startu pokusil o kontrolu aktualizací a o stažení regionálního mapování adres. AGP se v Gradle daemonu pokusil zapsat soubor s nastavením analytiky do domovské složky. Sandbox všechny tři pokusy zablokoval, z počítače nic neodešlo.

## Decision

Návrh: v M3 Kotlin language server nedostane. Pro Kotlin zůstane zvýrazňování syntaxe a „Otevřít v Android Studiu“ na řádku (hotovo v TASK-61).

- **Proč ne plně:** import selže na běžném nastavení Android aplikace a po selhání server mlčí. Obejití závisí na úpravě buildu, kterou Orca dělat nemůže.
- **Proč ne omezeně:** bez importu funguje jen struktura souboru. S importem dostane většina souborů v knihovních modulech falešné chyby, což je při review horší než žádná diagnostika.
- **Cena i po opravě:** server na každý worktree znamená 2 až 3 GB paměti, při importu až 9 GB, build všech build typů a 2 GB na disku. Orca drží víc worktrees najednou.
- **Hostitel language serverů** v M3 navrhnout tak, aby šel Kotlin přidat později bez přestavby: start na vyžádání, uspání, stav importu jako samostatný signál, obsah pro URI `jar:`.

Kotlin znovu vyzkoušet stejnými skripty, až vydání kotlin-lsp splní všechny tři podmínky:

1. Import projde na výchozí Android aplikaci s `BuildConfig` a instrumentovanými testy.
2. Třída `R` se najde v knihovních modulech.
3. Import nespouští kompilaci všech build typů, nebo jde omezit na jednu variantu.

Placené rozšíření „Java and Kotlin by IntelliJ IDEA“ jsme nezkoušeli. Poznámky k vydání ho uvádějí jako možnou náhradu rozšíření kotlin-lsp a spouštěč samostatného serveru má volby pro licenční klíč, takže jde nejspíš o stejný základ. Jiný výsledek importu Androidu od něj proto nečekáme; je to domněnka, ne měření.

## Consequences

- M3 se zmenší o Kotlin: language servery se plánují pro Swift a C# podle jejich pokusů (TASK-55, TASK-56).
- Review Kotlinu v Orce zůstane bez přechodu na definici a bez diagnostiky. Kdo je potřebuje, otevře soubor v Android Studiu.
- Agenti nedostanou `orca lsp` pro Kotlin; pro Android zůstávají u Gradlu a hledání v textu.
- Pokud se Kotlin později přidá, musí Orca umět ukázat stav importu a jeho selhání. Prázdná odpověď serveru jinak vypadá jako soubor bez problémů.
- Server zapisuje do worktree a spouští Gradle. U worktree s rozpracovanou prací agenta by soutěžil o Gradle daemon a zámky buildu; při novém pokusu to ověřit.
- U SSH worktree by server musel běžet na vzdáleném stroji se stejnými nároky na paměť. Archivy pro Linux existují, pokus je nezkoušel.
- Na Windows pokus neběžel; archivy existují.
