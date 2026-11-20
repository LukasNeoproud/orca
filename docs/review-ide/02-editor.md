# Editor

Editor zůstává Monaco, které už fork používá. Doplníme mu language servery a předávání do nativních IDE. Vložený VS Code workbench (code-server, OpenVSCode Server) nepoužijeme.

## Proč ne code-server

- Je to celý VS Code workbench s vlastním sidebarem, explorerem, source control, terminálem, taby, paletou příkazů, nastavením a motivem. Uvnitř Orky by vzniklo druhé IDE se zdvojenými funkcemi.
- Orca by na jeho editor dosáhla jen přes vlastní rozšíření VS Code a zasílání zpráv. Diff komentáře, drafty review a původ řádků v Monacu kreslíme přímo (view zones v `components/diff-comments`).
- Kolize zkratek a fokusu (Cmd+P, Cmd+1, Cmd+Shift+F).
- Další Node server a extension host na každý workspace.
- Rozšíření z Open VSX místo Microsoft Marketplace; část rozšíření Microsoftu (C# Dev Kit, debugger .NET) je licencovaná jen pro produkty Microsoftu.

## Language servery

Dnes editor neregistruje žádné providery pro definice, nápovědu, doplňování ani diagnostiku, umí jen zvýrazňování syntaxe.

- **Hostitel na stroji, kde běží kód:** spouští server pro trojici stroj, kořen worktree (nebo folder workspace) a jazyk přes `@orca/process-host`: lokálně v hlavním procesu, u SSH worktree v `orcad`. Start při otevření prvního souboru daného jazyka, uspání po nečinnosti. Hostitel drží stav klienta LSP (otevřené dokumenty, schopnosti serveru, diagnostiku), aby ho sdílel editor, agenti i vzdálený stroj.
- **Most do Monaca:** vlastní tenký most, LSP na providery Monaca: definice, reference, hover, doplňování, přejmenování, diagnostika jako markery, code actions jako rychlé opravy, symboly souboru pro panel Struktura. Renderer posílá události dokumentů a volá vyjmenované metody hostitele. Seznam metod a odpovídající API Monaca je v [decision-2](../../backlog/decisions/decision-2%20-%20Language-servery-v-editoru-vlastní-tenký-most-do-Monaca-ne-monaco-vscode-api.md).
- **Stav relace:** server po startu chvíli vrací prázdné odpovědi (sourcekit-lsp zhruba 2 s, kotlin-lsp po selhání importu trvale). Hostitel proto hlásí stav relace zvlášť a editor ho ukazuje; prázdná odpověď není výsledek.
- **Připravenost:** některé servery fungují jen nad připraveným worktree (sourcekit-lsp nad projektem Xcode potřebuje build a `buildServer.json`, Roslyn language server obnovené balíčky a nainstalovanou SDK podle `global.json`, viz [decision-4](../../backlog/decisions/decision-4%20-%20C-v-editoru-M3-Roslyn-language-server-nad-obnoveným-worktree-csharp-ls-jako-záloha.md)). Bez přípravy se server nespustí a editor ukáže stav s akcí; projekt Xcode se nikdy neotevírá jako Swift balíček, jinak server stahuje závislosti ze sítě ([decision-3](../../backlog/decisions/decision-3%20-%20Swift-v-editoru-M3-sourcekit-lsp-přes-build-server-jen-nad-sestaveným-worktree.md)).
- **Diagnostika:** servery ji buď posílají samy, nebo ji klient musí žádat. Hostitel obojí převádí na jednu událost s verzí dokumentu.
- **Navigace mezi soubory:** definice v jiném souboru se otevře jako tab Orky přes vlastní editor opener. Náhledy (Peek) zavřených souborů potřebují, aby most Monacu dodal model cílového souboru. Dokumenty, které existují jen v serveru (rozhraní SDK, třídy z knihoven), se otevřou jako taby jen pro čtení s obsahem od hostitele.
- **Úpravy zavřených souborů:** přejmenování a rychlé opravy aplikuje v zavřených souborech hostitel, v otevřených Monaco (zůstane krok zpět). Změny mimo editor hlásí hostitel serveru ze sledování souborů.
- **Agenti:** stejný hostitel přes CLI a MCP (`orca lsp definition|references|diagnostics`).

| Platforma | Server | Poznámka |
| --- | --- | --- |
| Android / Kotlin | kotlin-lsp (JetBrains) | Zdarma, alfa. Pokus TASK-53 (verze 271.2085.0): import běžné Android aplikace selže a třída `R` se v knihovních modulech nenajde; návrh je nechat Kotlin v M3 bez language serveru, viz [decision-1](../../backlog/decisions/decision-1%20-%20Kotlin-v-editoru-M3-kotlin-lsp-zatím-ne-jen-Otevřít-v-Android-Studiu.md). Stabilní „Java and Kotlin by IntelliJ IDEA“ vyžaduje po zkušební době licenci Ultimate |
| iOS / Swift | sourcekit-lsp z toolchainu Xcode | Pro SPM přímo (ověřeno prototypem TASK-54: start 0,6 s, zapisuje do `.build/index-build`). Pro `.xcodeproj` přes xcode-build-server a jen nad sestaveným worktree (pokus TASK-55: build 77 až 89 s a 2,9 GB na worktree, pak restart do první diagnostiky 0,9 s a až 1,9 GB paměti; bez buildu falešná chyba v každém souboru). Návrh: `buildServer.json` a hlídání stáří buildu udělá Orca, build spustí uživatel nebo agent, viz [decision-3](../../backlog/decisions/decision-3%20-%20Swift-v-editoru-M3-sourcekit-lsp-přes-build-server-jen-nad-sestaveným-worktree.md) |
| .NET / C# | Roslyn language server (`roslyn-language-server` z nuget.org), záloha csharp-ls | MIT, zatím jen předběžné verze; potřebuje .NET SDK 10 nebo novější a SDK, kterou připíná `global.json`. Jen nad worktree s obnovenými balíčky (pokus TASK-56 na řešení se 76 projekty: start do první diagnostiky 12 až 15 s, 1,9 až 2,4 GB paměti při načítání a až 2,6 GB při práci; bez `dotnet restore` chyba ve 47 ze 60 souborů). Spouští se s vypnutou telemetrií a vypnutým automatickým restore; `dotnet restore` spustí uživatel nebo agent, build potřeba není. Orca server nepřibaluje, stáhne ho na počítači uživatele, viz [decision-4](../../backlog/decisions/decision-4%20-%20C-v-editoru-M3-Roslyn-language-server-nad-obnoveným-worktree-csharp-ls-jako-záloha.md) |

Návrh je knihovnu `@codingame/monaco-vscode-api` (služby VS Code bez workbenche) nepoužít: nahrazuje balíček `monaco-editor` vlastním sestavením z VS Code, rozbije 15 z 19 hlubokých importů Orky, přidá 5,4 MB do rendereru a hostitele, SSH ani agenty neřeší. Návrh a podmínky, kdy se k ní vrátit, jsou v [decision-2](../../backlog/decisions/decision-2%20-%20Language-servery-v-editoru-vlastní-tenký-most-do-Monaca-ne-monaco-vscode-api.md).

## Otevřít v externím IDE

`external-editor-launch.ts` dnes otevírá složku. Rozšířit o soubor, řádek a výchozí IDE podle role repozitáře:

| Platforma | Výchozí IDE | Příkaz |
| --- | --- | --- |
| Android | Android Studio | `studio --line N soubor` |
| iOS | Xcode | `xed -l N soubor` |
| .NET | VS Code nebo Rider | `code -g soubor:N`, `rider --line N soubor` |

Akce „Otevřít v…“ je v kontextovém menu editoru, diffu, grafů a nálezů. Vždy otevírá cestu ve worktree, ne v hlavním checkoutu.

Hotovo (TASK-61): pravé tlačítko na čísle řádku v editoru, v diffu souboru a v diffu pull requestu, a kontextové menu cesty v hlavičce editoru (řádek kurzoru). Grafy a nálezy přijdou se svými funkcemi.

Hotovo (TASK-79): totéž v souhrnném diffu workspace a v pohledu All changes pull requestu Azure DevOps. Souhrnné diffy pull requestů GitHubu a GitLabu akci nenabízejí, protože ukazují kód mimo review worktree.

- Rodinu editoru určuje název spouštěče (`src/main/external-editor-file-location.ts`): VS Code a odvozeniny dostanou `--goto soubor:N:S`, JetBrains `--line N --column S-1 soubor`, Xcode `xed -l N soubor` (jen macOS), Zed `soubor:N:S`. Neznámý příkaz dostane jen soubor.
- JetBrains počítá `--line` od jedné a `--column` od nuly, proto Orca sloupec o jedna snižuje. Sloupec je u JetBrains logický (tabulátor zabere šířku odsazení), takže na řádku odsazeném tabulátory skončí kurzor vlevo od zvoleného znaku; řádek sedí.
- Okno worktree (TASK-116, TASK-144): Open in na souboru posílá s lokálním souborem i kořen worktree nebo folder workspace, ve kterém soubor leží, s řádkem i bez něj. `code` a `code-insiders` dostanou `code <kořen> --goto soubor:N:S`, bez řádku `code <kořen> soubor`; IDE JetBrains kromě Rideru `studio <kořen> --line N --column S-1 soubor`, bez řádku `studio <kořen> soubor` (TASK-80). Soubor tak skončí v okně svého worktree a už otevřené okno se použije znovu; bez složky by skončil v naposledy aktivním okně, i když patří jinému projektu. Hlavní proces kořenu z rozhraní nevěří: přijme ho jen jako existující absolutní složku, ve které soubor po vyřešení `..` leží (na Windows bez ohledu na velikost písmen a jen na stejném disku), a ne kořen disku; cíl, který je sám složkou, kořen nedostane. Jinak spustí příkaz bez složky. Na macOS a Linuxu se porovnává s rozlišením velikosti písmen, takže jinak napsaný kořen vede k příkazu bez složky.
- Místa, odkud jde Open in, a co dostane IDE:

  | Místo | Cíl | Příkaz |
  | --- | --- | --- |
  | Číslo řádku v editoru, diffu souboru, souhrnném diffu, diffu pull requestu a All changes Azure DevOps | soubor na řádku | kořen, soubor, řádek a sloupec |
  | Kontextové menu cesty v hlavičce editoru | soubor na řádku kurzoru; bez známého kurzoru (náhled, obrázek) soubor bez řádku | kořen a soubor, řádek jen když je |
  | Kontextové menu souboru v panelu Source Control (změny i porovnání větví) | soubor bez řádku | kořen a soubor |
  | Open in u worktree v postranním panelu a v liště File Exploreru | složka worktree | jen složka |
  | Otevření `keybindings.json` z nastavení | soubor mimo workspace | jen soubor |

- JetBrains bez řádku: podle bytecode `CommandLineProcessor` (Android Studio 2026.2.1) jde soubor bez `--line` nejdřív přes kontrolu, jestli to není projekt (`ProjectUtil.openOrImportAsync`), a teprve pak se otevře jako soubor v projektu, který ho obsahuje (`findBestProject`), tedy v okně kořenu z prvního argumentu. Běžný zdrojový soubor tak skončí ve svém worktree jako s řádkem. Soubor, který IDE umí importovat jako projekt (například `build.gradle.kts` modulu), může IDE místo toho otevřít jako samostatný projekt; tak se choval i dřívější příkaz bez složky. Živě neověřeno (TASK-144).
- Kořen nedostanou: SSH soubory (otevírají se přes Remote-SSH jako dosud), WSL soubory na Windows, složený příkaz (například `code --reuse-window`, kde by složka nahradila jiný projekt), Rider, Xcode a ostatní editory. Rider otevírá řešení (`.sln`), ne složku, a na počítači není, proto zůstává u samotného souboru.
- JetBrains při prvním otevření worktree: IDE se zeptá, kam projekt otevřít (New Window, This Window, Cancel; This Window podle názvu nahradí projekt v aktuálním okně, to se nezkoušelo; Cancel neotevře nic), a u složky, které ještě nedůvěřuje, jestli jí důvěřovat. Pak teprve otevře nové okno se souborem na řádku. Když je worktree v IDE už otevřený, použije se jeho okno bez dotazu. Android Studio u skutečného worktree s Gradlem projekt po otevření synchronizuje a indexuje; bez složky by soubor skončil jako cizí soubor v okně jiného projektu, bez navigace v kódu.
- Známé omezení JetBrains: dokud IDE ukazuje modální dotaz (na okno, na důvěru), na další příkaz z příkazové řádky neodpoví. Druhý proces spouštěče pak skončí chybovým oknem „Internal error … is still running and does not respond“ a soubor se neotevře. Stačí okno zavřít a dotaz v IDE vyřídit; běžící IDE se neukončuje. Pozorováno při ověření TASK-80 v Android Studiu 2026.2.1.
- Nastavení VS Code `window.openFoldersInNewWindow`: s výchozí hodnotou otevře složka z příkazové řádky nové okno, pokud už otevřená není. S hodnotou `off` složka nahradí naposledy aktivní okno, takže Open in zavře projekt, který v něm byl otevřený. Kdo to nechce, nechá výchozí hodnotu nebo `on`; podle dokumentace VS Code, živě neověřeno.
- Nabízí se aplikace z nastavení Open in. Výchozí je ta, kterou uživatel pro daný repozitář (nebo folder workspace) zvolil naposledy; výchozí IDE podle role repozitáře přijde s Funkcemi.
- Přidání aplikace (TASK-144): menu Add app v nastavení ukazuje nahoře oddíl Installed s editory, které Orca na počítači našla, pak dosavadní nabídku (VS Code, Cursor, Zed, pokud nebyly nalezeny) a vlastní aplikaci. Aplikace, která už v seznamu je (i pod jiným zápisem spouštěče, například `studio64` nebo cesta ke skriptu), je označená Added. Seznam se do nabídky Open in nepřidává sám; uživatel zvolí, co chce. Katalog známých editorů je `src/shared/open-in-known-applications.ts` (VS Code, Cursor, Zed, Android Studio, IntelliJ IDEA, Rider, WebStorm, PyCharm, GoLand, CLion, RustRover, Xcode), hledání `src/main/open-in-installed-apps/`. Příkaz je spouštěč z PATH (`studio`), když ho Orca najde, jinak cesta: skript JetBrains Toolbox, na macOS spouštěč uvnitř `.app` v `/Applications`, `~/Applications` a `~/Applications/JetBrains Toolbox`, na Windows výchozí instalace (Android Studio, VS Code, Cursor, `Program Files\JetBrains\<IDE> <verze>`), na Linuxu tarball Android Studia v `/opt`, `/usr/local` a v domovské složce. Xcode se nabízí jen s nainstalovanou aplikací, samotný `/usr/bin/xed` nestačí. Co Orca nenajde, nenabízí; nedostupné místo hledání ostatní nález nezruší. Webový klient nenabízí nic, nevidí počítač serveru. Na macOS trvá hledání kolem 10 ms.
- Diff pull requestu akci nabízí, jen když má review worktree vybraný právě tento pull request. Jiný checkout by otevřel jiný kód, než diff ukazuje.
- Kde akce dostupná není, menu na čísle řádku ukáže vypnutou položku Open in s důvodem: pull request není otevřený v review worktree, review worktree má jiný pull request, nebo je soubor smazaný.
- U SSH worktree otevírá jen VS Code přes Remote-SSH; ostatní aplikace jsou v nabídce vypnuté s označením „Local only“.

Ověření na skutečných IDE (TASK-80, 2026-11-19, jen macOS; příkazy sestavila a spustila Orca nad smyšleným projektem se dvěma worktrees):

| IDE | Výsledek |
| --- | --- |
| VS Code 1.140 | Ověřeno: řádek i sloupec sedí (42:7, 17:3, 12:5 na řádku s tabulátory, 30 bez sloupce), přečteno z uloženého stavu okna. Ověřena i varianta se složkou worktree. Bez řádku (TASK-144, 2026-11-20): `code <kořen> soubor` otevřelo okno „Ukazka.kt — okno“ a další soubor („README.md — okno“) stejné okno použilo znovu |
| Android Studio 2026.2.1 (platforma 262, spouštěč z JetBrains Toolbox) | Ověřeno: poloha kurzoru přečtená přes Zpřístupnění ze stavového řádku IDE odpovídá zvolenému řádku a sloupci (17:4, 42:7 v cestě s mezerou, 12:5, 30 bez sloupce → 30:1) a uložený stav IDE ukazuje řádek a sloupec od nuly (`--line 17 --column 3` → line 16, column 3). Bez složky soubor skončil v naposledy aktivním okně jiného projektu. Se složkou worktree: první otevření se zeptalo na okno a na důvěru a pak otevřelo nové okno worktree na správném místě; další otevření stejné okno použilo bez dotazu |
| Xcode 27.0 | Ověřeno: `xed -l 42` Xcode spustil a `xed -l 17` do už běžícího Xcode, oba postavily kurzor na začátek zvoleného řádku (Line: 42 Col: 1, Line: 17 Col: 1 ze spodní lišty editoru přes Zpřístupnění). Sloupec `xed` nepřijímá. Samostatný soubor Xcode otevřel ve vlastním okně |
| Rider, Zed | Neověřeno, na počítači nejsou a nainstalovat je uživatel nechtěl (decision-12). Rider sdílí zpracování `--line` a `--column` s platformou IntelliJ |
| Android Studio bez řádku (TASK-144) | Živě neověřeno: v běžícím IDE měl uživatel otevřené vyhledávání, které by nové okno projektu zavřelo. Chování doložené jen z bytecode (viz JetBrains bez řádku výše) a testy sestavení příkazu |

Windows a Linux pokrývají jen testy sestavení příkazu.

Ladění, build, Compose Preview a simulátory v Orce nestavíme; zůstávají v nativních IDE.
