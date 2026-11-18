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

- Rodinu editoru určuje název spouštěče (`src/main/external-editor-file-location.ts`): VS Code a odvozeniny dostanou `--goto soubor:N:S`, JetBrains `--line N soubor`, Xcode `xed -l N soubor` (jen macOS), Zed `soubor:N:S`. Neznámý příkaz dostane jen soubor.
- JetBrains dostává jen řádek. Sloupec vynecháváme, dokud na skutečném IDE neověříme, jestli `--column` počítá od nuly.
- Nabízí se aplikace z nastavení Open in. Výchozí je ta, kterou uživatel pro daný repozitář (nebo folder workspace) zvolil naposledy; výchozí IDE podle role repozitáře přijde s Funkcemi.
- Diff pull requestu akci nabízí, jen když má review worktree vybraný právě tento pull request. Jiný checkout by otevřel jiný kód, než diff ukazuje.
- Kde akce dostupná není, menu na čísle řádku ukáže vypnutou položku Open in s důvodem: pull request není otevřený v review worktree, review worktree má jiný pull request, nebo je soubor smazaný.
- U SSH worktree otevírá jen VS Code přes Remote-SSH; ostatní aplikace jsou v nabídce vypnuté s označením „Local only“.

Ladění, build, Compose Preview a simulátory v Orce nestavíme; zůstávají v nativních IDE.
