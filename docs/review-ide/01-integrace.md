# Integrace do forku

Integrace je realistická. Code review Azure DevOps PR s AI drafty už ve forku z velké části je (TASK-51). Zbylé pohledy stavíme jako nový typ tabu v jádru forku, analýzu kódu v samostatném procesu a editor doplníme o language servery (viz [Editor](./02-editor.md)).

Vychází z větve `personal`, commit `78b825a4` (15. 10. 2026). Cesty jsou relativně k `src/`, renderer pod `renderer/src/`.

## Co fork už obsahuje

| Oblast | Co je ve forku | Kde | Použití |
| --- | --- | --- | --- |
| Code review Azure DevOps | Tab Pull requests, stránka PR, vlákna, inline drafty, AI review agent, publikace vybraných draftů, nabídka AI review nových PR, Android | `main/azure-devops/review`, `components/azure-devops-review`, `right-sidebar/AzureDevOpsPullRequestsPanel.tsx` | Code review a Nálezy na mých PR: rozšířit, ne stavět znovu |
| Editor | Monaco 0.55, TextMate gramatiky, diff editor, komentáře v diffu, autosave | `components/editor`, `lib/monaco-languages`, `components/diff-comments` | Základ editace; chybí doplňování, navigace a diagnostika |
| Diff po souborech | Sekce diffu, kombinovaný diff, limity velkých diffů, image diff | `components/editor/combined-diff`, `diff-section-types.ts` | Diff po celcích = jiné seskupení stejných sekcí |
| Projekty a worktrees | Skupiny projektů, sken vnořených repozitářů, folder workspaces s připojenými worktrees | `main/project-groups`, `shared/project-group-types.ts`, `shared/folder-workspace-types.ts` | Projekt přes víc platforem |
| Emulátory | Android i iOS simulátor v panelu, stream snímků, strom přístupnosti | `main/emulator`, `components/emulator-pane` | Náhledy obrazovek v navigačním grafu |
| Externí editor | Otevření složky ve VS Code, Cursoru nebo JetBrains IDE | `main/external-editor-launch.ts` | Doplnit otevření na řádku a Xcode |
| Nativní menu | File, Edit, Appearance, View, Help | `main/menu/register-app-menu.ts` | Hlavní menu |
| Pluginy | Sandboxované HTML panely, příkazy, události; API jen `workspace:read`, `terminal:send`, `notifications:show`, `storage` | `main/plugins`, `shared/plugins` | Na pohledy nestačí |
| Procesy na pozadí | Process host, worker threads, démon orcad | `packages/process-host`, `main/lazy-worker-thread-host.ts`, `main/orcad` | Analytické jádro |

## Analytické jádro

Všechny nové pohledy čtou jeden model kódu, který počítá samostatný proces. Model obsahuje moduly a vazby, obrazovky s intenty a přechody, controllery a akce, lokalizační klíče a metriky souborů.

- **Extraktory podle jazyka** s výstupem JSON ve společném schématu:
  - Kotlin: Gradle model projektu a Kotlin PSI (kotlin-compiler-embeddable) na JVM.
  - Swift: SwiftSyntax a `swift package describe`, sestavené stejně jako dnešní Swift helpery Orca Dev.
  - C#: Roslyn jako .NET nástroj.
- **Proces na pozadí** přes process host, aby analýza neblokovala hlavní proces ani UI.
- **Cache podle repozitáře a SHA.** Grafický diff = rozdíl dvou modelů (báze proti HEAD); necommitnuté změny se dopočítají inkrementálně.
- **Jedno API pro UI i agenty:** renderer přes RPC, agenti přes `orca model …` v CLI a MCP.
- **Pravidla mimo repozitář:** vrstvy, limity metrik a vlastní kontroly v nastavení projektu v Orce; do codebase jen na žádost.

## Funkce z prototypu

Velké pohledy jsou jeden nový typ tabu `code-view` s podtypem (graf, moduly, controllery, platformy, lokalizace, zdraví), přidaný do `TabContentType` v `shared/tab-types.ts` vedle `check-details`.

| Funkce | Kde v Orce | Jak | Navazuje na | Náročnost |
| --- | --- | --- | --- | --- |
| Hlavní menu | Nativní menu macOS | Nabídky Review, Lokalizace, Kód a pohledy ve View, se zkratkami | `main/menu`, `main/keybindings` | nízká |
| Projekt přes platformy | Skupina projektů | Funkce jako sada odkazů do repozitářů, viz [Projekty a Funkce](./04-projekty-a-funkce.md) | `project-groups`, folder workspaces | vysoká |
| Pull requesty a oznámení | Levý sidebar | Sekce Moje PR, nativní oznámení u nového PR s akcí Provést review | `AzureDevOpsPullRequestsPanel`, `AzureDevOpsAutoReviewHost`, `main/notifications` | nízká |
| Code review jako v Azure DevOps | Stránka PR | Záložka Diff po celcích, původ řádků, hlasování při publikaci | `components/azure-devops-review` | střední |
| Nálezy na mých PR | Stránka PR, kde jsem autor | Odpověď jako draft, agent připraví změnu ve feature worktree, pak commit, odpověď a vyřešení | drafty odpovědí z TASK-51, `pr-comments-resolution-prompt.ts` | střední |
| Diff po celcích | Záložka diffu a stránky PR | Agent seskupí hunky do celků s komentářem; šum (importy, formátování, `linguist-generated`) deterministicky; cache podle SHA | `combined-diff`, headless agent | střední |
| Původ změn | Okraj diffu | Zadání z navázaného úkolu; zápisy agenta z hooků (Edit, Write) jako rozsahy mapované na hunky; zbytek vývojář | `linkedTask`, `agent-hook-listener`, AI vault | vysoká |
| Navigační graf s náhledy | Tab `code-view` | Obrazovky, intenty a přechody z extraktoru; náhledy ze snapshot testů, jinak snímek z emulátoru | analytické jádro, `main/emulator` | vysoká |
| Moduly a vrstvy | Tab `code-view` | Matice závislostí a vrstvy z modelu, pravidla v nastavení projektu | analytické jádro | střední |
| Controllery a akce (.NET) | Tab `code-view` | Roslyn: trasy, atributy, odpovědi; klienti z párování endpointů | analytické jádro | střední |
| Funkce napříč platformami | Tab `code-view` | Párování podle endpointů, modelů a lokalizačních klíčů, ruční opravy párů | modely referencí Funkce | vysoká |
| Diff snapshotů | Záložka diffu | Změněné obrázky snapshot testů (Paparazzi, Roborazzi, swift-snapshot-testing) jako před, po a rozdíl | image diff a pixelový rozdíl | nízká |
| Lokalizace a POEditor | Tab `code-view`, nabídka Lokalizace | Parsery `strings.xml`, `xcstrings`, `resx`; čekající změny v Orce; klient POEditor s tokenem v safeStorage; stažení a odeslání jen na pokyn; upozornění na zastaralou kopii a stringy navíc | vzor připojení z `main/azure-devops` | střední |
| Zdraví kódu | Tab `code-view` | Lint projektu (detekt, ktlint, SwiftLint, analyzátory .NET) přes SARIF, vlastní kontroly a metriky, opravy lintu a chyb kompilace přes agenta, návrh integrace lintu do codebase | `pr-checks-fix-prompt.ts`, process host | střední |
| Přehled projektu | První tab projektu | Ikony pohledů, věci k řešení, workspaces | ostatní pohledy | nízká |

## Jádro forku, ne pluginy

Plugin API na pohledy nestačí: panel nemůže číst soubory, diff ani git, otevřít soubor v editoru ani přidat tab a extension pointy jsou experimentální. Stavíme do jádra a omezujeme konflikty s upstreamem:

- Nový kód ve vlastních adresářích (`main/code-model`, `main/language-servers`, `main/poeditor`, `components/code-view`); do existujících souborů jen registrace.
- UI jen z primitiv `components/ui` a tokenů z `main.css` podle `docs/STYLEGUIDE.md`. Vzhled prototypu je orientační.
- Extraktory a POEditor klient bez závislosti na Electronu.

## Pořadí realizace

1. **Rychlé výhry:** hlavní menu, „Otevřít v…“ na řádku, Moje PR s oznámením, diff snapshotů; ověřit review proti skutečné organizaci Azure DevOps.
2. **Review:** Diff po celcích, Nálezy na mých PR, hlasování při publikaci.
3. **Editor:** hostitel language serverů a most do Monaca; nejdřív Swift a C#, Kotlin po zkoušce kotlin-lsp.
4. **Analytické jádro:** model, cache, Moduly a vrstvy, Controllery a akce.
5. **Pohledy nad modelem:** navigační graf, funkce napříč platformami, zdraví kódu.
6. **Lokalizace a POEditor.**
7. **Projekt jako celek:** Funkce a reference, Přehled projektu, původ změn.

## Rizika

| Riziko | Dopad | Co s tím |
| --- | --- | --- |
| kotlin-lsp (alfa) nezvládne Android projekt s Gradle variantami | Kotlin jen se zvýrazněním syntaxe | Editace přes Android Studio na řádku; případně placené rozšíření JetBrains |
| Navigační graf závisí na konvencích architektury | Extraktor najde jen část obrazovek | Začít konvencemi vlastní aplikace, vzory do nastavení projektu |
| Konflikty při slučování upstreamu | Víc práce při každém merge | Vlastní adresáře, do sdílených souborů jen registrace |
| Paměť při více worktrees | JVM language server a extraktory na worktree | Servery jen pro aktivní worktree, uspávání, extraktory jednorázově |
| Cena a zpoždění AI seskupení diffu | Pomalé otevření PR | Počítat na pozadí při příchodu PR, cache podle SHA |
| Limity POEditor API | Pomalá synchronizace | Ověřit limity, odesílat dávkově |
