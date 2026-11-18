---
id: decision-3
title: >-
  Swift v editoru M3: sourcekit-lsp přes build server, jen nad sestaveným
  worktree
date: '2026-11-18T20:11:00Z'
status: proposed
---
## Context

Editor v M3 má dostat language servery ([02-editor.md](../../docs/review-ide/02-editor.md)). Pro Swift dokumentace počítala se sourcekit-lsp z toolchainu Xcode a pro projekty s `.xcodeproj` s build serverem. [decision-2](decision-2%20-%20Language-servery-v-editoru-vlastní-tenký-most-do-Monaca-ne-monaco-vscode-api.md) ho ověřil jen na smyšleném Swift balíčku. TASK-55 ho zkusil na skutečném iOS projektu.

- **Server:** sourcekit-lsp z Xcode 27.0 (Swift 6.4). Projekty Xcode sám neumí, nabídka typů workspace je jen balíček, kompilační databáze a build server.
- **Build server:** xcode-build-server 1.3.0 (vydání z 5. 1. 2026, MIT, 1 610 řádků Pythonu). Parametry kompilace čte z logu posledního buildu Xcode a serveru předá index, který při buildu vznikl.
- **Projekt:** produkční iOS aplikace generovaná Tuistem; `.xcodeproj` ani `.xcworkspace` nejsou v gitu. 1 263 souborů Swiftu, zhruba 126 tisíc řádků, 207 souborů XIB a storyboardů. 51 vlastních targetů (aplikace, 26 frameworků, 24 testových), 21 přímých závislostí SwiftPM (40 balíčků po rozřešení, 13 binárních artefaktů), které generátor převádí na dalších 81 targetů Xcode. Generovaný kód: přístup ke zdrojům od generátoru (9 souborů, 5 tisíc řádků) a jedna třída, která vzniká až při buildu z datového modelu.
- **Stroj:** Apple M4 Pro, 14 jader, 48 GB RAM, macOS 27.0.
- **Postup:** kopie commitnutého stromu mimo checkout, závislosti naklonované z místní mezipaměti, projekt vygenerovaný a sestavený pro simulátor bez podpisu do vlastní složky DerivedData. Generátor, build i build server běžely v sandboxu bez sítě. Server ovládal skript přes stdio (skripty z TASK-53), každý dotaz pětkrát.
- **Sandbox:** sourcekit-lsp pod `sandbox-exec` nefunguje, jeho služba sourcekitd nenaběhne a server spadne při otevření prvního souboru. Běžel proto bez sandboxu.
- **Swift balíček projektu:** projekt žádný místní balíček nemá. Jako balíček jsme měřili zdrojový soubor závislosti, kterou generátor překládá jako target Xcode.
- **Checkout projektu:** otisk před pokusem a po něm je shodný (HEAD, index, obsah 2 305 sledovaných souborů, velikost a čas změny všech 153 315 položek včetně nesledovaných).
- **Podklady:** skripty a výsledky jsou v `~/.cache/orca-review-ide/task-55` (`scripts/REPRODUCE.txt`), mimo repozitář.

## Findings

### Co je potřeba připravit

| Krok | Čas | Místo na disku | Poznámka |
| --- | --- | --- | --- |
| Závislosti SwiftPM | neměřeno, potřebuje síť | 3,4 GB ve worktree | V pokusu naklonované z místní mezipaměti |
| Vygenerování projektu | 19 s | 6 MB ve worktree, vše ignorované gitem | Jen u generovaných projektů; bez sítě prošlo |
| Build pro simulátor, jen aplikace | 77 s (514 s procesoru) | 2,1 GB v DerivedData | Testové targety zůstanou nepokryté |
| Build pro simulátor včetně testů | 89 s (613 s procesoru) | 2,4 GB v DerivedData, z toho index 0,1 GB | Špička paměti buildu zhruba 5,7 GB |
| `buildServer.json` | pod 1 s se zadanou složkou buildu | 1 soubor v kořeni worktree | Nesledovaný soubor, git ho ukazuje jako změnu. Hledání složky buildu přes `xcodebuild` neměřeno |
| První start serveru | 14 až 16 s | 0,37 GB v DerivedData, 0,09 GB v `~/Library/Caches/xcode-build-server` | Server si staví vlastní mezipaměť modulů a databázi indexu |

Celkem zhruba dvě minuty plného vytížení všech jader a 2,9 GB na worktree, k tomu závislosti.

- **Build spouští kód projektu.** Projekt má pět skriptových fází (lint, verze, changelog a další). Build v pokusu nezměnil žádný sledovaný soubor.
- **Build v sandboxu** prošel až s vypnutým vnořeným sandboxem kompilátoru pro makra a s povoleným zápisem do mezipamětí nástrojů Xcode v `~/Library`.
- **Další buildy:** beze změny 10 s, po změně jednoho souboru aplikace 24 s, po změně základního frameworku 56 až 59 s.
- **Co build server potřebuje:** `buildServer.json` musí ležet přímo v kořeni worktree, ve složce `.bsp` ho xcode-build-server nenajde. Je svázaný s jedním schématem a zná jen targety, které se pod ním sestavily.

### Bez přípravy

| Stav worktree | Co server udělá | Výsledek v souborech aplikace |
| --- | --- | --- |
| Kořen s `Package.swift`, bez `buildServer.json` | Otevře repozitář jako Swift balíček a začne stahovat závislosti ze sítě | Bez parametrů kompilace |
| Bez build serveru | Použije náhradní parametry s macOS SDK | Jedna falešná chyba na soubor, prázdné odpovědi |
| `buildServer.json` bez buildu | Totéž | Totéž |
| Build jen schématu aplikace | Funguje pro sestavené targety | V testech falešná chyba `No such module 'XCTest'`, reference a přejmenování testy vynechají |

- **Falešná chyba v každém souboru:** `No such module 'UIKit'` nebo název prvního importovaného modulu.
- **Prázdné odpovědi:** hover, definice, doplňování, reference i hledání symbolů. Funguje jen struktura souboru.
- **Tiché neúplné přejmenování:** přejmenování třídy vrátilo 1 úpravu místo 109. Po buildu jen aplikace vrátilo přejmenování vlastnosti 11 úprav, po buildu včetně testů 17.
- **Režim balíčku stahuje.** Za 20 s server naklonoval 28 veřejných repozitářů závislostí (466 MB) do sdílené mezipaměti SwiftPM v `~/Library/Caches` a dalších 0,4 GB do `.build/index-build` ve worktree. V checkoutu projektu leží z dřívějška stejná složka o 4,5 GB. Stalo se to v jediném běhu, kdy server běžel bez sandboxu nad kořenem bez platné konfigurace; kód projektu při tom neodešel.
- **Volba `--default-workspace-type buildServer` tomu nezabrání.** Bez `buildServer.json` server `Package.swift` otevře i s ní (ověřeno v sandboxu).
- **Soubor mimo targety projektu** dostane falešnou chybu i po buildu: 1 ze 60 náhodně otevřených souborů.

### Funkce

Po buildu včetně testů. Měřeno na sedmi souborech: dva z targetu aplikace, dva z funkčního frameworku, jeden ze sdíleného frameworku, jeden ze Swift balíčku závislosti a jeden test.

| Funkce | Target aplikace | Frameworky projektu | Swift balíček | Stav |
| --- | --- | --- | --- | --- |
| Definice | Funguje v targetu, mezi moduly, do zdrojů balíčku, do třídy generované při buildu a do SDK | Funguje včetně generovaného přístupu ke zdrojům a maker | Funguje | Funguje |
| Reference | Funguje | Funguje napříč moduly: 108 výskytů ve 40 souborech z 8 targetů | Funguje: 97 použití ve 43 souborech balíčku i aplikace | Funguje, jen pro sestavené targety |
| Hover | Funguje včetně generované třídy a SDK | Funguje | Funguje | Funguje |
| Doplňování | Funguje včetně členů generované třídy | Funguje včetně generovaných zdrojů | Funguje | Funguje, nejvýš 200 položek na odpověď |
| Diagnostika | Bez falešných chyb, vložené chyby hlásí | Bez falešných chyb | Bez falešných chyb | Funguje: 59 ze 60 souborů ze všech targetů bez chyby |
| Přejmenování | Správné úpravy v souboru i mezi soubory | Správné úpravy napříč moduly: 109 úprav ve 41 souborech | Správné úpravy | Funguje, jen pro sestavené targety |
| Hledání symbolů | Najde typy aplikace i třídu generovanou při buildu | Najde typy frameworků, testů i generovaný kód | Najde typy balíčku | Částečně: symboly SDK nenajde, vrací i volné shody |

- **Definice do SDK** vede na dokument `sourcekit-lsp://`, který existuje jen v serveru; klient ho čte přes `workspace/getReferenceDocument`.
- **Úpravy v paměti** jiného souboru server nevidí, dokud se soubor neuloží.
- **Stejný modul:** nová deklarace je po uložení vidět hned, bez buildu. Nový soubor, který projekt ještě nezná, dostane správnou diagnostiku a ostatní soubory modulu ho vidí.
- **Jiný modul:** nová deklarace hlásí chybu, dokud neproběhne build. Po buildu ji server převezme bez restartu.
- **Index:** reference a hledání symbolů se mění jen buildem. Indexování na pozadí server v tomto režimu nedělá a neposílá žádný `$/progress`.

### Čas od startu do první diagnostiky

| Stav | První skutečná diagnostika | Hover | Hledání symbolů |
| --- | --- | --- | --- |
| První start po čistém buildu (tři běhy) | 13,9 až 15,7 s od otevření souboru | 16,2 s | 16,4 s |
| Start bez mezipaměti build serveru | 1,6 s | 2,1 s | 2,3 s |
| Restart nad hotovými mezipaměťmi (tři běhy) | 0,88 až 0,90 s | 0,91 až 0,93 s | 1,13 až 1,15 s |
| Restart, klient bez diagnostiky na vyžádání | 1,96 až 1,99 s | | |

- `initialize` trvá 33 až 85 ms.
- Při prvním startu server neodpovídá prázdně, první dotaz čeká na výsledek.
- První dotaz v dalším modulu trvá 0,1 až 4 s.

### Paměť

| Proces | Paměť (RSS) |
| --- | --- |
| sourcekit-lsp | 30 MB po startu, 120 až 180 MB při práci |
| SourceKitService po prvním souboru | 0,3 GB, při prvním startu po buildu 0,7 GB |
| SourceKitService po 7 až 65 otevřených souborech | 1,4 až 1,6 GB |
| Build server | 21 až 34 MB |
| Součet ve špičce | 1,9 GB |

- **SourceKitService** spouští systém jako samostatnou službu, není potomkem serveru. Po ukončení serveru skončila sama.
- Server v tomto režimu nespouští kompilátory ani build.

### Odezva na opakované dotazy

Pět opakování každého dotazu.

| Dotaz | První volání | Medián opakování |
| --- | --- | --- |
| Hover | 2 až 41 ms | 2 až 27 ms |
| Definice | 2 až 37 ms; první otevření rozhraní SDK až 0,9 s | 1 až 32 ms |
| Doplňování | 0,1 až 0,4 s | 3 až 30 ms |
| Reference | 3 až 25 ms | 2 až 25 ms |
| Přejmenování | 17 až 69 ms | 16 až 59 ms |
| Struktura souboru | 1 až 4 ms | 1 až 2 ms |
| Hledání symbolů | 6 až 55 ms | 6 až 53 ms |
| Diagnostika na vyžádání, první pro soubor | 0,1 až 4,0 s | do 1 ms |
| Diagnostika po úpravě souboru | 0,09 až 0,40 s | |
| Diagnostika po úpravě, posílaná serverem | 1,5 s | |

- Šedesát souborů ze všech targetů za sebou: medián první diagnostiky 104 ms, nejvýš 291 ms.
- Při běžícím buildu stejného worktree zůstaly odpovědi správné a zpomalily z 0,4 s nejvýš na 1,2 s.

### Worktree a důvěra

- **Zápis do worktree:** v režimu build serveru server do worktree nezapisuje a nic nestaví. Otázka z decision-2 se tak týká jen Swift balíčků.
- **Dotaz na důvěru:** konfigurace ve složce `.bsp` nebo `.sourcekit-lsp` vyvolá `window/showMessageRequest` s volbami „Trust Workspace“ a „Don't Trust“. Bez souhlasu server konfiguraci přeskočí a spadne do režimu balíčku. `buildServer.json` v kořeni dotaz nevyvolal. Přepínač `--bypass-workspace-trust` dotaz vypne. Souhlas se podle vývojářů serveru ukládá do `~/.sourcekit-lsp`; pokus souhlas nedával.
- **Telemetrie:** ve zdrojích xcode-build-server žádné síťové volání není a v sandboxu bez sítě běžel bez chyb. Generátor projektu běžel bez sítě s vypnutou analytikou.

### Jiný build server

sourcekit-xcode-bsp 0.1.0 (Apache 2.0, srpen 2026) se ptá přímo sestavovací služby Xcode a podle autora nepotřebuje předchozí build. Je to první verze jednoho autora; pokus ho nezkoušel.

## Decision

Návrh: Swift v M3 language server dostane, ale jen nad worktree, který má sestavený projekt. Lehkou část přípravy udělá Orca sama, build spustí uživatel nebo agent.

- **Orca sama:** rozpozná projekt Xcode, najde jeho build, vytvoří `buildServer.json`, zapíše ho do `.git/info/exclude`, spustí server a hlídá, jestli build není starší než zdroje.
- **Na pokyn uživatele:** vygenerování projektu a build. Příkaz patří do nastavení repozitáře, stejně jako brány kvality, a editor ho nabídne ve stavu relace jako „Připravit Swift“.
- **Proč ne automaticky:** build stojí dvě minuty všech jader, 5,7 GB paměti a 2,9 GB na worktree, spouští skripty projektu a u nového worktree potřebuje síť pro závislosti. Orca drží víc worktrees najednou.
- **Bez přípravy** se server nespustí. Editor ukáže stav „Swift není připraven“ s akcí, zůstane zvýraznění syntaxe a „Otevřít v Xcode“.
- **Proč ne aspoň omezeně:** bez buildu dostane každý soubor falešnou chybu a přejmenování tiše vrátí zlomek úprav.
- **Projekt Xcode se nikdy neotevírá jako Swift balíček.** Kde je `.xcodeproj`, `.xcworkspace` nebo manifest generátoru a chybí `buildServer.json`, server nestartuje, i když v kořeni leží `Package.swift`.
- **Build server:** xcode-build-server v připnuté verzi.

K rozhodnutí se vrátit, až sourcekit-lsp bude umět projekty Xcode sám, nebo až sourcekit-xcode-bsp dospěje a příprava bez buildu půjde ověřit stejnými skripty.

## Consequences

- Katalog serverů v M3 potřebuje podmínku připravenosti a stav relace hodnoty „není připraveno“ a „build je starší než zdroje“.
- Hostitel musí odpovídat na `window/showMessageRequest`, nebo server spouštět s `--bypass-workspace-trust`. V seznamu metod v decision-2 chybí.
- Hostitel musí počítat a uklízet i SourceKitService, která není potomkem serveru.
- Server nejde zavřít do `sandbox-exec`.
- Jedna relace Swiftu stojí až 1,9 GB paměti; uspání po nečinnosti je nutné.
- Reference a přejmenování jsou úplné jen pro sestavené targety. Příprava proto má sestavit i testy, jinak přejmenování testy vynechá.
- Review cizího pull requestu ve worktree bez buildu zůstane u Swiftu bez navigace, dokud ho někdo nepřipraví.
- Agenti dostanou `orca lsp` pro Swift jen nad připraveným worktree. Build, který agent pustí do stejné složky DerivedData, relaci obnoví sám.
- `buildServer.json` ve folder workspace bez gitu zůstane viditelným souborem.
- U SSH worktree musí být vzdálený stroj Mac s Xcode; na Linuxu a Windows tato cesta neexistuje.
- Nezkoušeno: stažení závislostí v novém worktree, ručně udržovaný `.xcodeproj` s balíčky spravovanými Xcode, CocoaPods, soubory Objective-C, build pro zařízení, sdílení buildu mezi worktrees, SSH, sourcekit-xcode-bsp.
