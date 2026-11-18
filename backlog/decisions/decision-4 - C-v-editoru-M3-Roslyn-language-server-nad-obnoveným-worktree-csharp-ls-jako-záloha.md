---
id: decision-4
title: >-
  C# v editoru M3: Roslyn language server nad obnoveným worktree, csharp-ls jako
  záloha
date: '2026-11-18T21:15:00Z'
status: proposed
---
## Context

Editor v M3 má dostat language servery ([02-editor.md](../../docs/review-ide/02-editor.md)). Pro C# dokumentace uváděla Roslyn language server, případně csharp-ls, a upozorňovala na licenční omezení některých součástí od Microsoftu. TASK-56 oba servery zkusil na skutečném backendu.

- **Roslyn language server:** nástroj `roslyn-language-server` 5.13.0-1.26514.10 z nuget.org (15. 10. 2026). Tenký klient, který přeposílá LSP procesu `Microsoft.CodeAnalysis.LanguageServer`. Spouštěný s `--stdio --autoLoadProjects --telemetryLevel off`.
- **csharp-ls:** 0.28.0 z nuget.org (13. 9. 2026), spouštěný s `--solution`. Verze 0.29.0 vyšla v den pokusu a vyžaduje .NET SDK 11, která na stroji není.
- **Projekt:** backend ve dvou repozitářích, tři kopie.
  - **Hlavní měření:** řešení se 76 projekty pro .NET 8 (služby ASP.NET, workery, sdílené knihovny, testy), 550 souborů C#, zhruba 71 tisíc řádků, centrálně připnuté verze balíčků, analyzátory a rozhraní HTTP klienta, jehož implementaci vytváří source generator. Je to rok starý commit druhého repozitáře; jen jeho balíčky jsou všechny v místní mezipaměti.
  - **Neobnovené řešení:** aktuální stav téhož repozitáře, 90 projektů pro .NET 10, 871 souborů, zhruba 122 tisíc řádků. Bez sítě ho obnovit nejde, chybí 46 balíčků, z toho 9 soukromých.
  - **Starší řešení:** první repozitář, 10 projektů (6 pro .NET 6, 4 pro .NET Framework 4.7.2), 610 souborů, zhruba 54 tisíc řádků, čtyři řešení v kořeni, `global.json` připíná SDK 6 a projekty odkazují na sousední repozitáře, které v kopii nejsou.
- **Stroj:** Apple M4 Pro, 14 jader, 48 GB RAM, macOS 27.0. .NET SDK 8.0.405, 9.0.102 a 10.0.402, běhová prostředí 8.0.12, 9.0.1 a 10.0.13. Mono ani referenční sestavení .NET Frameworku nainstalované nejsou.
- **Postup:** kopie commitnutého stromu mimo checkout, tajemství přepsaná zástupnými hodnotami. Servery ovládal skript přes stdio (skripty z TASK-53 a TASK-55), každý dotaz pětkrát. Hlavní řešení bylo obnovené (`dotnet restore`), ale nesestavené.
- **Sandbox a síť:** restore, build i oba servery běžely pod `sandbox-exec` bez sítě, se zápisem jen do složky pokusu, s náhradní domovskou složkou a bez přístupu k checkoutům a uloženým přihlašovacím údajům. Zdrojem balíčků byla jen místní složka `~/.nuget/packages`. Žádný proces, který pracoval s kopií projektu, neměl přístup k síti (ověřeno: HTTPS, přímá adresa i localhost zamítnuty).
- **Úpravy kopie kvůli měření:** vlastní `NuGet.Config` s místním zdrojem a soubor, který .NET 8 nasměruje na nainstalovanou verzi cílových balíčků 8.0.12 (SDK 10 by si jinak stahovala novější).
- **Kontrola:** sandboxovaný `dotnet build` hlavního řešení skončil bez chyby (1 498 varování, 36 s, 261 s procesoru). Chybu tedy nemá hlásit ani server.
- **Checkout projektu:** otisk prvního repozitáře před pokusem a po něm je shodný (HEAD, index, obsah 1 215 souborů, velikost a čas změny všech 1 466 položek včetně nesledovaných). U druhého se shoduje HEAD, index, stav a obsah 2 013 souborů; liší se jen ignorovaná výstupní složka, kterou během pokusu přepisoval uživatelův vlastní `dotnet restore`, a čtyři časy změny v `.git` (`FETCH_HEAD` a tři složky) z doby, kdy pokus nad checkoutem nic nespouštěl.
- **Podklady:** skripty a výsledky jsou v `~/.cache/orca-review-ide/task-56` (`scripts/REPRODUCE.txt`), mimo repozitář.

## Findings

### Co je potřeba připravit

| Krok | Čas | Poznámka |
| --- | --- | --- |
| .NET SDK | | Server potřebuje běhové prostředí .NET 10; projekty načítá přes SDK, kterou vybere `global.json` |
| `dotnet restore` | 3,7 s z místní mezipaměti | V novém worktree potřebuje síť a přihlášení k soukromým zdrojům balíčků |
| Build | není potřeba | Po restore fungují všechny funkce bez falešných chyb i bez buildu |
| Start serveru | 7 až 20 s | Viz níže |

- **Server si při načtení pouští vlastní vyhodnocení projektů** (MSBuild) a zapisuje jeho výstup do složek `obj`: Roslyn language server zhruba 1 000 položek, csharp-ls zhruba 500, dohromady 11 MB na 76 projektů. Git je díky `.gitignore` nevidí.
- **Připnutá SDK:** s `global.json` na nainstalovanou SDK 8 oba servery načetly řešení přes ni a bez chyb (Roslyn 10,5 s, csharp-ls 18 s).

### Bez přípravy

Šedesát souborů ze všech projektů, otevřených za sebou.

| Stav worktree | Roslyn language server | csharp-ls |
| --- | --- | --- |
| Obnovené řešení | 0 souborů s chybou | 0 souborů s chybou |
| Neobnovené řešení | 47 ze 60 souborů s chybou (1 213 chyb), 17 ze 41 dotazů prázdných | 49 ze 60 souborů s chybou (1 225 chyb), stejných 17 dotazů prázdných |
| `global.json` připíná SDK, která není nainstalovaná | Nenačte žádný projekt a běží dál: 0 chyb, reference jen v souboru, hledání symbolů prázdné | `initialize` skončí chybou |
| Projekty pro .NET Framework na macOS (bez připnuté SDK) | Načte je přes .NET SDK s varováním: 16 ze 40 souborů s chybou (1 282 chyb) | Načte jen jedno ze čtyř řešení: 1 ze 40 souborů s chybou (213 chyb) |

- **Roslyn language server spouští `dotnet restore` sám.** Nad neobnoveným řešením ho pustil hned po načtení, obyčejným příkazem s nastavením NuGetu, které platí pro worktree a uživatele. V pokusu měl jen místní zdroj: všech 90 projektů selhalo za 5 s, do worktree přibylo 1 561 položek (35 MB) a špička paměti stoupla na 2,5 GB v 16 procesech. Mimo sandbox by se ptal i soukromých zdrojů balíčků s uloženým přihlášením.
- **Vypnout to jde.** Když klient na `workspace/configuration` odpoví `false` pro `projects.dotnet_enable_automatic_restore`, server restore nespustí (ověřeno, 0 pokusů).
- **Neobnovený stav server klientovi neoznámí zvlášť.** Roslyn language server pošle jen varování do logu („has unresolved dependencies“, jedno na projekt a cílový framework), csharp-ls nic.
- **Co bez restore funguje:** část navigace mezi zdroji řešení, reference, přejmenování a typy z SDK. Dotazy na typy z balíčků a na kód, který na nich závisí, jsou prázdné.
- **Tiché selhání u chybějící SDK:** Roslyn language server ohlásí dokončení načtení za 2,4 s a chyby napíše jen do logu. Editor by vypadal funkčně, jen bez chyb a bez navigace.
- **csharp-ls restore nespouští.**

### Funkce

Obnovené řešení se 76 projekty. Měřeno na sedmi souborech (implementace domény, sdílená knihovna, běhová knihovna, kontrakty, server ASP.NET, test, generovaný klient), 46 dotazů a 8 hledání symbolů.

| Funkce | Roslyn language server | csharp-ls |
| --- | --- | --- |
| Definice | Funguje v souboru, mezi projekty, do balíčků NuGet včetně soukromých i do SDK | Funguje ve zdrojích; do balíčků a SDK je ve výchozím stavu prázdná, funguje až s `--features metadata-uris` |
| Reference | Funguje napříč projekty: 94 výskytů v 88 souborech z 23 projektů, 127 výskytů v 55 souborech | Stejné počty; u rozhraní s generovanou implementací 2 výskyty místo 4 |
| Hover | Funguje včetně typů z balíčků a SDK | Funguje |
| Doplňování | Funguje | Funguje |
| Diagnostika | Bez falešných chyb, včetně hlášení analyzátorů. Jen na vyžádání klienta | Bez falešných chyb, jen kompilátor; analyzátory jsou ve výchozím stavu vypnuté. Na vyžádání klienta |
| Přejmenování | Správné úpravy napříč projekty: 95 úprav ve 23 projektech | Stejné počty úprav (95, 43, 23, 3, 2) |
| Hledání symbolů | Najde typy řešení i generované; typy SDK ne; nejvýš 600 výsledků | Najde typy řešení; generovaný typ jednou místo třikrát; typy SDK ne; nejvýš 100 výsledků |
| Implementace rozhraní z generátoru | Vede na dokument `roslyn-source-generated://` | Prázdná, s `metadata-uris` vede na dokument `csharp:` |

- **Dokumenty mimo worktree, Roslyn language server:** definice do balíčku nebo SDK vede na soubor, který server zapíše do dočasné složky. Generovaný kód existuje jen v serveru a klient ho čte standardní metodou `workspace/textDocumentContent` (57 řádků za 3 ms).
- **Dokumenty mimo worktree, csharp-ls:** vlastní schéma `csharp:` a vlastní metoda `csharp/metadata` (typ z SDK 1 165 řádků za 3 ms, typ z balíčku za 40 ms).
- **Klient bez diagnostiky na vyžádání** nedostal od Roslyn language serveru za 120 s žádnou diagnostiku.
- **Úpravy v paměti** jiného projektu vidí oba servery hned, bez uložení a bez buildu (161 ms a 35 ms).
- **Nový soubor na disku** uvidí server až po `workspace/didChangeWatchedFiles` (1,3 s a 71 ms). Roslyn language server si sledování sám registruje, zhruba 500 až 580 žádostí `client/registerCapability` včetně složek balíčků; csharp-ls žádné sledování neregistruje.
- **Výběr řešení:** Roslyn language server načte jediné řešení v kořeni; je-li jich víc, načte všechny projekty, které najde (nejvýš 500). csharp-ls si z více řešení jedno vybere, nebo ho dostane parametrem.

### Čas od startu do první diagnostiky

Od spuštění procesu, obnovené řešení. Diagnostika, hover a hledání symbolů jsou ze tří restartů.

| Stav | Roslyn language server | csharp-ls |
| --- | --- | --- |
| `initialize` | 0,5 až 1,0 s | 0,4 až 0,5 s |
| Načtení řešení bez dotazů | 7,1 až 10,6 s | 16,6 až 18,9 s |
| První skutečná diagnostika | 11,6 až 15,4 s | 18,1 až 20,6 s |
| Hover | 10,4 až 14,2 s | 18,0 až 20,4 s |
| Hledání symbolů | 11,1 až 15,2 s | 17,9 až 20,3 s |
| Neobnovené řešení (90 projektů) | 8,2 s, s automatickým restore 14,8 s | 16,9 s |

- **Roslyn language server během načítání odpovídá prázdně.** Hover vrátil 71 až 94 prázdných odpovědí, než přišla první skutečná. Konec načtení hlásí `$/progress` a oznámení `workspace/projectInitializationComplete`.
- **csharp-ls nechá dotaz čekat** a odpoví jednou. Řešení začne načítat až s prvním otevřeným souborem; konec hlásí `$/progress`.
- **Když pomocné procesy Roslyn language serveru nenaběhnou** (v pokusu kvůli zakázaným socketům v `/tmp`), server zůstane navždy ve stavu „Loading“ a žádnou chybu neohlásí.
- **Trvalá mezipaměť** Roslyn language serveru v `~/Library/Application Support` byla v sandboxu vypnutá. Další starty mohou být ve skutečnosti rychlejší.

### Paměť

| Stav | Roslyn language server | csharp-ls |
| --- | --- | --- |
| Před načtením | | 51 až 108 MB |
| Špička při načítání, všechny procesy | 1,9 až 2,4 GB (server, BuildHost a 6 uzlů MSBuildu) | 1,0 až 1,4 GB (server a BuildHost) |
| Po načtení | 0,3 až 0,5 GB | 0,7 GB |
| Po 60 otevřených souborech | 1,1 až 1,7 GB | 0,7 až 0,9 GB |
| Po sadě dotazů | 1,1 až 1,6 GB | 0,6 až 0,7 GB |
| Špička serveru při práci | 1,5 až 2,6 GB | 1,1 GB |

- **Pomocné procesy** (BuildHost, uzly MSBuildu) po načtení skončí. Tenký klient Roslyn language serveru přidává 23 až 49 MB.
- **Osiřelý BuildHost:** po zaseknutém startu zůstal BuildHost Roslyn language serveru běžet i po ukončení serveru, přepojený pod proces 1, a 16 minut bral zhruba 13 % jednoho jádra, dokud jsme ho neukončili. Část měření Roslyn language serveru běžela s ním na pozadí.
- **Roslyn language server má zapnutý serverový garbage collector** (`System.GC.Server`), který si na stroji s mnoha jádry drží paměti víc.

### Odezva na opakované dotazy

Pět opakování každého dotazu, v milisekundách, pokud není uvedeno jinak.

| Dotaz | Roslyn: první volání | Roslyn: medián opakování | csharp-ls: první volání | csharp-ls: medián opakování |
| --- | --- | --- | --- | --- |
| Hover | 0 až 98 | 0 až 2 | 0 až 144 | 0 až 1 |
| Definice ve zdrojích | 0 až 22 | 0 až 1 | 0 až 57 | 0 až 1 |
| Definice do balíčku nebo SDK | 3 až 88 | 0 až 9 | 20 až 470 (s `metadata-uris`) | 0 až 2 |
| Doplňování | 2 až 72 | 1 až 8 | 9 až 236 | 3 až 14 |
| Reference | 501 až 638 | 502 až 509 | 11 až 1 623 | 1 až 498 |
| Přejmenování | 17 až 416 | 15 až 374 | 47 až 903 | 35 až 855 |
| Struktura souboru | 1 až 9 | 0 až 1 | 6 až 39 | 3 až 10 |
| Hledání symbolů | 3 až 100 | 3 až 6 | 11 až 109 | 12 až 40 |
| Diagnostika na vyžádání, první pro soubor | medián 155, nejvýš 2,2 s | | medián 8, nejvýš 46 | |
| Diagnostika po úpravě souboru | 0,15 až 0,62 s | | 2 až 39 | |

- **Reference u Roslyn language serveru trvají vždy zhruba půl sekundy**, ať je výskyt jeden, nebo 127. csharp-ls odpoví na opakovaný dotaz za 1 až 5 ms, u metod rozhraní a přepsaných metod za 0,1 až 0,5 s.
- **Přejmenování s 95 úpravami ve 23 projektech:** Roslyn language server 200 až 374 ms, csharp-ls 745 až 855 ms.

### Licence a získání

| | Roslyn language server | csharp-ls |
| --- | --- | --- |
| Licence | MIT podle balíčku i README; balíček vyžaduje přijetí licence | MIT |
| Autor | Microsoft, tým Roslynu; zdroje v `dotnet/roslyn` | Jeden správce; „not affiliated with Microsoft“ |
| Stav vydání | Jen předběžné verze, 12 od ledna 2026; volby příkazové řádky se podle README mohou měnit | Stabilní verze; 0.28.0 v září, 0.29.0 v listopadu 2026 |
| Získání | `dotnet tool install --global roslyn-language-server --prerelease`, nebo balíček z nuget.org | `dotnet tool install --global csharp-ls`, nebo balíček z nuget.org |
| Velikost | 63 MB ke stažení pro jednu platformu, 162 MB na disku | 22 MB ke stažení, 57 MB na disku |
| Platformy | Zvláštní balíček pro Windows, Linux (i musl) a macOS, x64 a arm64 | Jeden balíček pro všechny |
| Běhové prostředí | .NET 10 nebo novější | Podle konfigurace balíčku jen řada .NET 10; verze 0.29.0 chce .NET SDK 11 |

- **Smí je používat aplikace mimo produkty Microsoftu? Ano, oba.** Licence MIT použití neomezuje a žádný z balíčků nemá doložku o použití jen s produkty Microsoftu. README Roslyn language serveru počítá s obecnými klienty LSP a nástroj dnes spouštějí i pluginy pro Neovim.
- **Omezení se týká rozšíření C# pro VS Code**, ne samostatného serveru: jeho licence dovoluje použití jen s VS Code, Visual Studiem a Xamarin Studiem (dopadá hlavně na debugger). Tuto cestu a C# Dev Kit Orca použít nesmí a pokus je nepoužil.
- **Roslyn language server nejde s jistotou přibalit k Orce.** Balíček obsahuje knihovny Microsoftu, které na nuget.org nejsou pod MIT: `Microsoft.VisualStudio.Telemetry` a `Microsoft.VisualStudio.RemoteControl` mají vlastní licenční podmínky, které zakazují software sdílet a zveřejňovat; `Microsoft.ServiceHub.Client` a `Microsoft.VisualStudio.Utilities.Internal` mají také vlastní podmínky (nečteno). Stažení z nuget.org na počítači uživatele tím dotčené není.
- **csharp-ls přibalit jde.** Všechny jeho závislosti (Roslyn, Ionide.LanguageServerProtocol, ICSharpCode.Decompiler, Microsoft.Build.Locator) jsou pod MIT.
- **V pokusu** jsme balíčky stáhli přímo z nuget.org do `~/.cache/orca-review-ide/tools` a ověřili otisk SHA-512 proti katalogu nuget.org. Instalace přes `dotnet tool` nezkoušena.

### Telemetrie

- **Roslyn language server** má výchozí `--telemetryLevel all`. Běžel s `off`. I tak si do domovské složky zapsal identifikátor zařízení a soubory `uuid` a `hardDriveSerialNumber` (`Library/Application Support/Microsoft/DeveloperTools` a `Microsoft DevDiv`); v pokusu do náhradní domovské složky. Jestli s `off` zkouší něco odeslat, pokus nezjistil, síť byla zakázaná a server běžel bez chyb.
- **csharp-ls** žádnou telemetrickou knihovnu neobsahuje a bez sítě běžel bez chyb.
- **.NET SDK** měla telemetrii vypnutou proměnnou `DOTNET_CLI_TELEMETRY_OPTOUT=1`.

## Decision

Návrh: C# v M3 dostane Roslyn language server, a to jen nad worktree s obnovenými balíčky. Server si Orca stáhne z nuget.org na počítači uživatele, nepřibaluje ho. csharp-ls zůstane zálohou, kterou jde zapnout změnou jedné položky katalogu.

- **Proč Roslyn language server:** jako jediný umí bez přepínačů všechno, co review potřebuje: navigaci do balíčků a SDK, generovaný kód přes standardní metodu LSP, úplné reference v generovaném kódu a hlášení analyzátorů, která projekt používá. Řešení načte za polovinu času. Je to stejný server, jaký běží v rozšíření C# pro VS Code, takže chyby v editoru odpovídají tomu, co vývojář vidí tam.
- **Co za to platíme:** dvojnásobek paměti, jen předběžné verze a telemetrické knihovny v balíčku.
- **Verze:** připnutá v katalogu, s ověřeným otiskem. Novou verzi pouštíme až po přeměření stejnými skripty.
- **Spouštění:** vždy s `--telemetryLevel off` a s odpovědí `false` na `projects.dotnet_enable_automatic_restore`. Restore se sítí a s přihlašovacími údaji není věc, kterou má server dělat sám na pozadí.
- **Příprava:** `dotnet restore` spustí uživatel nebo agent, stejně jako build u Swiftu ([decision-3](decision-3%20-%20Swift-v-editoru-M3-sourcekit-lsp-přes-build-server-jen-nad-sestaveným-worktree.md)). Editor akci nabídne ve stavu relace jako „Připravit C#“. Build potřeba není.
- **Bez přípravy** se server nespustí. Editor ukáže stav „C# není připraven“ s akcí, zůstane zvýraznění syntaxe a „Otevřít v…“. Bez restore má chybu 47 ze 60 souborů.
- **Chybějící SDK** je také stav „není připraveno“: Orca před startem ověří `dotnet --version` ve worktree, protože server sám by selhal potichu.
- **Požadavek na uživatele:** nainstalovaná .NET SDK 10 (měřeno s 10.0.402) nebo novější, na stroji, kde worktree leží. Pokud repozitář v `global.json` připíná jinou řadu SDK, musí být nainstalovaná i ta.
- **Projekty pro .NET Framework** M3 na macOS a Linuxu nepodporuje; zůstanou u zvýraznění syntaxe a „Otevřít v…“.
- **Kdy sáhnout po csharp-ls:** když právní posouzení telemetrických knihoven vyjde proti Roslyn language serveru, když jeho předběžné verze rozbijí spouštění, nebo když paměť na worktree bude vadit víc než chybějící navigace do balíčků. Cena: požadavek na nejnovější .NET SDK s každou další verzí, jeden správce a vlastní metoda pro dokumenty mimo worktree.

K rozhodnutí se vrátit, až Roslyn language server vydá stabilní verzi, nebo až půjde hlavní měření zopakovat nad aktuálním stavem backendu.

## Consequences

- Katalog serverů potřebuje pro C# podmínku připravenosti ze dvou částí: SDK podle `global.json` je nainstalovaná a balíčky jsou obnovené. Server sám neobnovený stav hlásí jen varováním v logu.
- Hostitel musí server stáhnout, ověřit otisk a rozbalit (63 MB na platformu), nebo použít nástroj, který si uživatel nainstaloval přes `dotnet tool`. Přibalení k Orce by potřebovalo právní posouzení.
- Hostitel musí odpovídat na `workspace/configuration` (odpověď `null` u csharp-ls vyvolá výjimku), `client/registerCapability` a `client/unregisterCapability` po stovkách, `window/workDoneProgress/create` a `workspace/diagnostic/refresh`, a číst `workspace/projectInitializationComplete`.
- Most musí umět diagnostiku na vyžádání; bez ní C# žádnou diagnostiku nemá.
- Dotazy před koncem načtení hostitel zadrží, jinak editor ukáže prázdné odpovědi jako výsledek.
- Dokumenty mimo worktree mají tři podoby: soubor v dočasné složce (jen pro čtení), `roslyn-source-generated://` přes `workspace/textDocumentContent`, u csharp-ls `csharp:` přes `csharp/metadata`.
- Sledování souborů musí hostitel serveru hlásit, jinak nový soubor od agenta server neuvidí. Roslyn language server si registruje i složky balíčků mimo worktree.
- Hostitel musí ukončovat celý strom procesů a po startu hlídat čas načtení; zaseknutý start se sám neohlásí a BuildHost může server přežít.
- Jedna relace C# stojí až 2,4 GB při načítání a 1,1 až 2,6 GB při práci; uspání po nečinnosti je nutné a probuzení stojí 10 až 15 s.
- Server zapisuje do složek `obj` ve worktree. Ve folder workspace bez gitu a v repozitáři, který `obj` neignoruje, to budou viditelné změny.
- Server pod `sandbox-exec` bez sítě běží, pokud smí vytvářet sockety přímo v `/tmp`. Po každém startu tam nechá několik socketů s názvem GUID.
- Server zapisuje do domovské složky identifikátor zařízení i s vypnutou telemetrií a chce tam ukládat trvalou mezipaměť.
- Repozitář s více řešeními potřebuje v nastavení volbu, které řešení načíst; jinak server načte všechny projekty, které najde.
- Agenti dostanou `orca lsp` pro C# jen nad obnoveným worktree.
- U SSH worktree musí být .NET SDK a server na vzdáleném stroji; balíčky existují pro Linux i Windows.
- Nezkoušeno: aktuální stav backendu po restore se sítí, instalace přes `dotnet tool`, sdílený režim `--daemon-mode`, Razor, formátování a rychlé opravy, Windows a Linux, SSH, projekty .NET Framework na Windows, start s trvalou mezipamětí, csharp-ls s klientem bez diagnostiky na vyžádání, csharp-ls 0.29.0.
