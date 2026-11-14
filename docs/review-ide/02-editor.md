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

- **Hostitel v hlavním procesu:** `main/language-servers/` spouští server pro dvojici worktree a jazyk přes `@orca/process-host`. Start při otevření prvního souboru daného jazyka, uspání po nečinnosti.
- **Most do Monaca:** LSP na providery Monaca: definice, reference, hover, doplňování, přejmenování, diagnostika jako markery, code actions jako rychlé opravy, symboly souboru pro panel Struktura.
- **Navigace mezi soubory:** definice v jiném souboru se otevře jako tab Orky přes vlastní editor opener.
- **Úpravy zavřených souborů:** přejmenování a rychlé opravy aplikuje hlavní proces, ne Monaco.
- **Agenti:** stejný hostitel přes CLI a MCP (`orca lsp definition|references|diagnostics`).

| Platforma | Server | Poznámka |
| --- | --- | --- |
| Android / Kotlin | kotlin-lsp (JetBrains) | Zdarma, alfa; ověřit na projektu s Gradle variantami. Stabilní „Java and Kotlin by IntelliJ IDEA“ vyžaduje po zkušební době licenci Ultimate |
| iOS / Swift | sourcekit-lsp z toolchainu Xcode | Pro SPM přímo, pro `.xcodeproj` build server (např. xcode-build-server) |
| .NET / C# | Roslyn language server, případně csharp-ls | |

Mezistupeň, pokud by ruční most bobtnal: `@codingame/monaco-vscode-api` (služby VS Code bez workbenche). Zkusit nejdřív vlastní tenký most.

## Otevřít v externím IDE

`external-editor-launch.ts` dnes otevírá složku. Rozšířit o soubor, řádek a výchozí IDE podle role repozitáře:

| Platforma | Výchozí IDE | Příkaz |
| --- | --- | --- |
| Android | Android Studio | `studio --line N soubor` |
| iOS | Xcode | `xed -l N soubor` |
| .NET | VS Code nebo Rider | `code -g soubor:N`, `rider --line N soubor` |

Akce „Otevřít v…“ je v kontextovém menu editoru, diffu, grafů a nálezů. Vždy otevírá cestu ve worktree, ne v hlavním checkoutu.

Ladění, build, Compose Preview a simulátory v Orce nestavíme; zůstávají v nativních IDE.
