---
id: decision-2
title: 'Language servery v editoru: vlastní tenký most do Monaca, ne monaco-vscode-api'
date: '2026-11-18T17:59:00Z'
status: proposed
---
## Context

Editor v M3 má dostat language servery ([02-editor.md](../../docs/review-ide/02-editor.md)). Otevřené bylo, jak je propojit s Monacem: vlastním tenkým mostem, nebo knihovnou `@codingame/monaco-vscode-api`. TASK-54 to ověřil prototypem a zkouškou knihovny.

- **Prototyp:** hostitel v hlavním procesu spouští sourcekit-lsp přes `spawnProcess` z `@orca/process-host`, renderer registruje providery Monaca pro Swift. Je uložený jako commit `02ada22cc7` na místní větvi `review-ide-pokus-lsp-most`; pracovní větev ho neobsahuje.
- **Projekt:** smyšlený Swift balíček se třemi soubory; pro více kořenů složka se dvěma smyšlenými balíčky.
- **Server:** sourcekit-lsp z toolchainu Xcode (Swift 6.4), macOS na Apple silicon.
- **Ověření v Orce:** sestavení ze zdrojáků, skryté okno, izolovaný domovský adresář, Playwright (`tests/e2e/language-server-swift-spike.spec.ts` v commitu prototypu), čtyři úspěšné běhy se shodnými výsledky.
- **Knihovna:** `@codingame/monaco-vscode-api` 37.6.0, na které stojí `monaco-languageclient` 11.0.3 (nejnovější verze knihovny je 39.0.5). Nainstalovaná mimo repozitář a sestavená stejným bundlerem jako Orca; spuštěná nebyla.
- **Podklady:** skripty, výsledky a snímky jsou v `~/.cache/orca-review-ide/task-54`, mimo repozitář.

## Findings

### Prototyp vlastního mostu

Všech pět funkcí z tiketu funguje v editoru Orky a definice v jiném souboru se otevře jako tab.

| Funkce | API Monaca | Čas v Orce |
| --- | --- | --- |
| Symboly souboru | `registerDocumentSymbolProvider` (rychlý přehled Monaca) | 30 ms |
| Hover | `registerHoverProvider` | 0,4 až 0,9 s od najetí myší, včetně prodlevy Monaca |
| Diagnostika | `editor.setModelMarkers` | 1,4 s od začátku psaní chyby, včetně psaní a čekání 150 ms |
| Doplňování | `registerCompletionItemProvider` | 0,3 až 0,4 s |
| Definice v jiném souboru | `registerDefinitionProvider` a `editor.registerEditorOpener` | 33 ms do otevření tabu |

- **Start:** server běží za 0,63 s, soubor je připraven 1,24 s po otevření.
- **Rozsah:** renderer 581 řádků (7,8 kB po minifikaci, 3,6 kB gzip), hlavní proces s preloadem a typy 954 řádků. `pnpm tc` s prototypem prošel.
- **Úklid:** po ukončení aplikace neběží sourcekit-lsp ani jeho potomci.

### Co musí most zvládnout

- **Prázdné odpovědi při načítání.** Po úspěšném `initialize` vrací hover ještě 1,8 až 2,5 s `null` (2 až 8 dotazů). Reference a hledání symbolů jsou prázdné, dokud není hotový index: na balíčku s hotovým buildem 5,6 s po startu, na čistém balíčku ještě po 17 s (déle skript nečekal). Je to stejný jev jako u kotlin-lsp ([decision-1](decision-1%20-%20Kotlin-v-editoru-M3-kotlin-lsp-zatím-ne-jen-Otevřít-v-Android-Studiu.md)), jen kratší. Stav načítání oznamuje server přes `$/progress`, kotlin-lsp vlastní notifikací.
- **Požadavky serveru na klienta.** sourcekit-lsp si dynamicky registruje diagnostiku na vyžádání a sledování souborů (`client/registerCapability`) a zakládá průběh (`window/workDoneProgress/create`). Klient na ně musí odpovídat.
- **Dva modely diagnostiky.** Když klient ohlásí diagnostiku na vyžádání, server žádnou neposílá sám a klient se musí ptát (`textDocument/diagnostic`); odezva 0,06 až 0,55 s. Bez ní server posílá `publishDiagnostics` zhruba 1,3 s po změně. Server hlásí závislosti mezi soubory, takže po změně jednoho souboru se klient musí znovu zeptat i na ostatní otevřené.
- **Náhled definice (Peek) pro zavřený soubor nefunguje.** Widget se otevře, náhled zůstane prázdný a Monaco vyhodí `Model not found`. Jakmile má cílový soubor model, funguje to. Náhled referencí používá stejný widget, takže ho čeká totéž (nezkoušeno).
- **Dokumenty mimo disk.** Definice do SDK vede buď na dočasný soubor mimo worktree, nebo (s experimentální schopností klienta) na URI `sourcekit-lsp://`, jehož obsah vrací `workspace/getReferenceDocument`. kotlin-lsp má totéž jako `workspace/textDocumentContent` a URI `jar:`. Čtení souborů mimo povolené kořeny Orca podle kódu odmítá (`filesystem-auth.ts`), takže obsah musí dodat hostitel.
- **Zápis do worktree.** Server spouští `swift build` a zapisuje do `.build/index-build` balíčku. Paměť na smyšleném balíčku: server 42 až 65 MB, kompilátor při indexaci 280 MB.

### Knihovna @codingame/monaco-vscode-api

- **Nestaví na balíčku `monaco-editor`, nahrazuje ho.** Instaluje se `monaco-editor` jako alias na `@codingame/monaco-vscode-editor-api`, sestavený přímo ze zdrojáků VS Code. Verze 37.6.0 obsahuje VS Code 1.138.0, což podle README `monaco-languageclient` odpovídá `monaco-editor` 0.57.0; hlavní větev knihovny je už na VS Code 1.145. Orca má připnutý `monaco-editor` 0.55.1.
- **Hluboké importy Orky.** Z 19 cest `monaco-editor/esm/…` a `min/…`, které Orca používá, zůstanou 4 beze změny, 7 balíček neexportuje (mimo jiné Monarch lexer, widget referencí a `editor.main.css`) a 8 se přeloží na prázdný modul, protože jazyky a workery jsou v samostatných balíčcích `monaco-vscode-standalone-*`. Monaco importuje 82 souborů rendereru.
- **Jediná inicializace.** `initialize` se volá jednou před prvním editorem; služby pak nejde změnit ani uvolnit.
- **Vydání.** Nová hlavní verze vychází jednou až dvakrát měsíčně podle vydání VS Code (od ledna do listopadu 2026 verze 25 až 39).
- **Co nedodá:** spouštění procesů, SSH ani přístup agentů. Klient LSP by žil v rendereru, takže hostitel v hlavním procesu je potřeba tak jako tak.

Velikost bundlu, stejný bundler jako Orca (`rolldown-vite` 7.3.1), vstup napodobuje importy `monaco-setup.ts`:

| Varianta | JS bez workerů | Totéž po gzipu | Workery | Celkem |
| --- | --- | --- | --- | --- |
| `monaco-editor` 0.55.1 (dnešní stav) | 4 043 kB | 1 068 kB | 9 139 kB | 13 615 kB |
| Náhrada knihovnou, bez přepsaných služeb | 7 938 kB | 2 199 kB | 9 649 kB | 18 085 kB |
| Knihovna se službami pro klienta LSP a `vscode-languageclient` | 9 456 kB | 2 600 kB | 9 649 kB | 19 604 kB |

Služby, které knihovna přináší:

- **Vždy s jádrem:** base, host, extensions, files (virtuální souborový systém), quickaccess, environment, layout.
- **Potřebné pro klienta LSP:** languages, model (reference na modely, tedy i náhledy zavřených souborů), editor (otevření jiného souboru přes zpětné volání hostitelské aplikace), configuration, k tomu rozšiřující API `vscode` a `vscode-languageclient`.
- **Volitelné:** dalších zhruba 35 přepisů služeb (témata, TextMate, klávesové zkratky, notifikace, dialogy, pohledy, workbench, terminál, ladění a další). TextMate vypíná gramatiky Monarch, které Orca používá.

Licence: knihovna, `monaco-languageclient` i `vscode-languageclient` jsou MIT. Do bundlu se dostane `jschardet` pod LGPL-2.1+ (326 kB) a `dompurify` v jiné verzi, než jakou si Orca vynucuje.

### Porovnání

| Hledisko | Vlastní most | `@codingame/monaco-vscode-api` |
| --- | --- | --- |
| Slučitelnost s připnutým Monacem | Používá veřejné API verze 0.55.1, závislosti se nemění | Neslučitelná: vymění Monaco za jiné sestavení a rozbije 15 z 19 hlubokých importů |
| Nárůst bundlu rendereru | 8 kB | 5 413 kB JS (1 532 kB gzip) a 510 kB workerů |
| Služby | Jen to, co napíšeme | Model, soubory, editor, konfigurace a všechny funkce LSP z `vscode-languageclient` |
| Licence | Vlastní kód | MIT, v bundlu navíc LGPL `jschardet` |
| Agenti a SSH | Stav klienta drží hostitel, sdílí ho editor, CLI i vzdálený stroj | Klient je v rendereru; hostitel pro agenty a SSH se píše zvlášť |
| Údržba | Každou další funkci LSP mapujeme ručně | Verze Monaca je svázaná s knihovnou, která vydává novou hlavní verzi jednou až dvakrát měsíčně |
| Odhad práce na M3 | 9 až 10 tiketů (níže) | Stejné tikety hostitele, SSH, stavu a agentů, navíc migrace Monaca (velký tiket) a napojení souborového systému knihovny na soubory Orky včetně SSH; ušetří zhruba dva středně velké tikety mapování |

Odhady práce jsou úsudek z prototypu, ne měření.

### Metody LSP pro M3 a API Monaca

Stav: **P** ověřeno v prototypu v Orce, **S** ověřeno skriptem proti serveru, **N** nezkoušeno.

| Metoda LSP | API Monaca nebo místo v Orce | Stav |
| --- | --- | --- |
| `initialize`, `initialized`, `shutdown`, `exit` | Hostitel | P |
| `client/registerCapability`, `client/unregisterCapability` | Hostitel | P registrace, N zrušení |
| `window/workDoneProgress/create`, `$/progress` | Hostitel, stav relace v rozhraní Orky | P odpověď, N zobrazení |
| `workspace/configuration`, `workspace/workspaceFolders` | Hostitel | N (hostitel odpovídá, sourcekit-lsp se neptal) |
| `$/cancelRequest` | `CancellationToken` providerů | N (prototyp ruší jen po vypršení času) |
| `textDocument/didOpen`, `didChange`, `didClose` | `editor.onDidCreateModel`, `model.onDidChangeContent`, `editor.onWillDisposeModel` | P, `didClose` N |
| `textDocument/didSave` | Ukládání v Orce | N |
| `workspace/didChangeWatchedFiles` | Sledování souborů Orky | S |
| `textDocument/publishDiagnostics`, `textDocument/diagnostic` | `editor.setModelMarkers` | P na vyžádání, S posílané |
| `textDocument/definition` | `registerDefinitionProvider`, `editor.registerEditorOpener` | P |
| `textDocument/hover` | `registerHoverProvider` | P |
| `textDocument/completion`, `completionItem/resolve` | `registerCompletionItemProvider` | P, `resolve` N |
| `textDocument/documentSymbol` | `registerDocumentSymbolProvider`, panel Struktura | P |
| `textDocument/references` | `registerReferenceProvider`, Find Usages | S |
| `textDocument/prepareRename`, `textDocument/rename` | `registerRenameProvider` | S |
| `textDocument/codeAction`, `codeAction/resolve`, `workspace/executeCommand`, `workspace/applyEdit` | `registerCodeActionProvider` | N |
| `workspace/symbol` | Monaco API nemá; vlastní hledání v Orce a CLI | S |
| `workspace/getReferenceDocument`, `workspace/textDocumentContent` | Model jen pro čtení přes `editor.createModel` | S u sourcekit-lsp; kotlin-lsp podle TASK-53 |
| Stav importu (`intellij/workspaceImportState` u kotlin-lsp) | Hostitel, stav relace | N |

### Synchronizace dokumentů

- **Živý model je otevřený dokument.** Synchronizují se modely se schématem `file`, bez vlastníka ve fragmentu URI a s jazykem, pro který server existuje. Modely diffu (`diff:`) se neposílají.
- **Verze.** Číslo verze LSP je `versionId` modelu. Diagnostiku pro starší verzi zahodí hostitel i renderer.
- **Pořadí.** Renderer řadí zprávy jednoho dokumentu za sebe, hostitel má jednu frontu na relaci; dotaz čeká na odeslání předchozích změn.
- **Přírůstky.** Když server chce přírůstkové změny, posílají se rozsahy z události Monaca, jinak celý text. Pozice jsou na obou stranách v UTF-16.
- **Nedořešeno v prototypu:** tentýž soubor ve dvou oknech (hostitel musí dokumenty počítat), úpravy více kurzory, `didSave`.

### Úpravy zavřených souborů

- Přejmenování vrací úpravy více souborů najednou (ověřeno skriptem: dva soubory, tvar `changes`).
- Monaco bez knihovny umí aplikovat jen textové úpravy souborů, které mají model; jinak vyhodí `bad edit - model not found` a operace se soubory nepodporuje vůbec.
- Návrh: úpravy otevřených souborů provede Monaco (zůstane krok zpět), zavřené soubory a operace se soubory provede hostitel stejnou cestou, jakou Orca soubory zapisuje. Monaco na to má přepis služeb při vytvoření prvního editoru (`IEditorOverrideServices`: `bulkEditService`, pro náhledy `textModelService`). Nezkoušeno, patří do prvního tiketu M3.
- Změny mimo editor (agent, git) se serveru hlásí přes `workspace/didChangeWatchedFiles`. Bez toho server v režimu posílané diagnostiky změnu zavřeného souboru nezaznamená.

### Více kořenů

- Jeden server s kořenem ve složce nad dvěma balíčky obslouží oba: hover, definice i diagnostika fungují a balíček se načte při otevření prvního souboru (0,9 až 3,2 s).
- Soubor mimo kořen serveru dostane prázdné odpovědi bez chyby, včetně diagnostiky.
- Návrh: jedna relace na trojici stroj, kořen worktree (nebo folder workspace) a jazyk. Značky projektu (`Package.swift`) rozhodují jen o tom, jestli má smysl server spustit. Prototyp bral za kořen nejbližší `Package.swift`, což by v repozitáři s více balíčky znamenalo server na balíček.

### SSH worktree

Server poběží na vzdáleném stroji jako potomek `orcad`, který obsahuje `@orca/process-host` i stejný kód hlavního procesu. Lokálně běžet nemůže: soubory, toolchain i výstupy buildu jsou na vzdáleném stroji. Zjištěno čtením kódu, na SSH nezkoušeno. Chybí:

- **Hostitel v runtime.** Prototyp je napojený jen na IPC Electronu; hostitel musí být ve vrstvě, kterou sdílí hlavní proces a `orcad`.
- **RPC metody.** V `ALL_RPC_METHODS` není nic pro language servery ani obecné spouštění procesu se stdio. Potřeba jsou metody pro otevření, změnu a zavření dokumentu a pro dotaz, a streamovaná metoda pro diagnostiku a stav (vzor `files.watch`).
- **Vyjednání schopnosti.** Nový řetězec v `RUNTIME_CAPABILITIES` a kontrola na klientovi; starší `orcad` metodu nezná.
- **Adresování.** Vzdálené RPC adresují soubory jako worktree a relativní cestu, ne absolutní cestou; hostitel je překládá na URI vzdáleného stroje a zpět.
- **Směrování v rendereru.** Most musí volit IPC, nebo RPC podle stroje otevřeného souboru a synchronizovat i modely se vzdáleným vlastníkem.
- **Server na vzdáleném stroji.** `orcad` žádný language server nepřibaluje; hledání serveru musí běžet vzdáleně a jeho absence je stav relace, ne chyba.
- **Ztráta spojení.** Stav relace musí používat slovník `live` / `unverifiable` / `exited` a po obnovení spojení znovu poslat otevřené dokumenty.

## Decision

Návrh: napsat vlastní tenký most a knihovnu `@codingame/monaco-vscode-api` nepoužít.

- **Proč ne knihovna:** vymění připnuté Monaco za jiné sestavení, rozbije většinu hlubokých importů Orky, přidá 5,4 MB do rendereru a neřeší hostitele, SSH ani agenty. Ušetřené mapování je nejjednodušší část práce.
- **Stav klienta LSP drží hostitel na stroji, kde běží kód.** Renderer posílá události dokumentů a volá vyjmenované metody; surový JSON-RPC do rendereru nepouštět. Díky tomu sdílí stejnou relaci editor, CLI pro agenty i vzdálený stroj.
- **Hostitel sjednocuje rozdíly serverů:** oba modely diagnostiky do jedné události s verzí, stav načítání a selhání importu do stavu relace, dokumenty mimo disk do jednoho čtení obsahu.
- **Prázdná odpověď není výsledek.** Dokud relace není připravená, editor to ukáže a providery výsledek neukládají.
- **Kdy se k rozhodnutí vrátit:** když mapování v rendereru přeroste orientačně 3 000 řádků (prototyp má 581), nebo když budeme chtít část workbenche VS Code (náhled refaktoringu, rozšíření).

## Consequences

Tikety M3, které z toho plynou (velikost je odhad):

1. Hostitel v runtime: relace, fronta, požadavky serveru, pád a restart, uspání, katalog serverů (velký).
2. Most v rendereru: synchronizace, definice, hover, doplňování, symboly, diagnostika; rušení dotazů, více oken (střední, prototyp pokrývá většinu).
3. Reference s Find Usages a modely zavřených souborů pro náhledy (střední).
4. Přejmenování a rychlé opravy včetně aplikace úprav zavřených souborů (velký).
5. Dokumenty mimo disk jako taby jen pro čtení (střední).
6. Hlášení změn souborů serveru a `didSave` (malý).
7. Stav relace v rozhraní: startuje, načítá, selhal import, server chybí, skončil (střední).
8. SSH: RPC metody, stream, schopnost, směrování (velký).
9. Panel Struktura nad symboly souboru a `orca lsp` pro agenty podle původního plánu.

Další důsledky:

- Každou další funkci LSP (sémantické zvýraznění, inlay hinty, hierarchie volání) přidáváme ručně.
- Typy protokolu lze vzít z balíčku `vscode-languageserver-protocol` (MIT) a rámování z `vscode-jsonrpc`; prototyp má rámování vlastní (220 řádků). Rozhodnout v prvním tiketu M3.
- sourcekit-lsp zapisuje do worktree a spouští build, stejně jako kotlin-lsp. U worktree s běžícím agentem to ověřit v TASK-55.
- Nezkoušeno: Windows a Linux, projekt s `.xcodeproj` (TASK-55), C# (TASK-56), SSH v provozu, přejmenování a rychlé opravy v Monacu, běh knihovny v Orce.
