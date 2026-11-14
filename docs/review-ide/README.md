# Review IDE v Orca Dev

Dokumentace k rozšíření Orca Dev o bohaté pohledy na codebase a review kódu generovaného AI pro Android (Kotlin), iOS (Swift) a .NET (C#).

## Problém

- AI generuje velké množství kódu, který se špatně reviduje autorovi i ostatním vývojářům.
- IDE nemají bohaté zobrazení codebase (navigace, moduly, vazby, API).
- Diffy jsou textová porovnání s kontextem roztroušeným v popisu PR a komentářích.

## Dokumenty

| Dokument | Obsah |
| --- | --- |
| [Integrace do forku](./01-integrace.md) | Co fork už má, analytické jádro, funkce z prototypu, jádro vs. pluginy, pořadí a rizika |
| [Editor](./02-editor.md) | Monaco s language servery, otevření v externím IDE, zamítnutý code-server |
| [Rozložení](./03-rozlozeni.md) | Levý a pravý sidebar, režimy Workspaces a Projekt, Project view |
| [Projekty a Funkce](./04-projekty-a-funkce.md) | Skupina projektů, Funkce jako sada odkazů do repozitářů, reference jen pro čtení |
| [Popis funkcí](./05-funkce.md) | Účel, chování a pravidla všech funkcí z prototypu se snímky obrazovek |
| [AI a review](./06-ai-a-review.md) | Plán v pohledech, review během práce agenta, brány kvality, hodnocení nálezů, spustitelné review a další |
| [Funkce převzaté z IDE](./07-funkce-z-ide.md) | Funkce Android Studia, Rideru a Xcode seřazené podle praktičnosti, s přínosem AI a realizovatelností |
| [Zařízení, inspektory a hlas](./08-zarizeni-inspektory-hlas.md) | Build a nasazení na zařízení, umístění emulátoru, inspektory sítě a dat, přístupnost, hlasové zadávání a oznámení |

## Přijatá rozhodnutí

- Funkce se integrují přímo do jádra forku, opinionated způsobem. Otevřený plugin systém pro ně nestavíme; případné pluginy později nad celým Orca Dev.
- Editor je Monaco doplněné o language servery. Code-server ani jiný vložený VS Code workbench nepoužijeme.
- Ladění, build, Compose Preview a simulátory se předávají do Android Studia, Xcode nebo VS Code otevřením na konkrétním řádku.
- Levý sidebar je navigace po celém projektu, pravý sidebar nástroje pro to, co je právě otevřené, hlavní plocha obsah.
- Stejná větev napříč platformami není realistická. Ostatní platformy jsou reference jen pro čtení, svázané přes Funkci.
- Agent dostává zpětnou vazbu z bran kvality a opravuje kód dřív, než práci ohlásí jako hotovou.
- Nálezy mají závažnost, jistotu, četnost, dopad a prioritu; nálezy AI nesou důkaz.

## Otevřené otázky

- [ ] Linkuje tým PR na pracovní položky Azure DevOps konzistentně? Rozhoduje o automatickém zakládání Funkcí.
- [ ] Zvládne kotlin-lsp Android projekt s Gradle variantami?
- [ ] Vlastní most LSP → Monaco, nebo `@codingame/monaco-vscode-api`?
- [ ] Pracují Claude Code a ostatní agenti správně ve složce se symbolickými odkazy na více worktrees?
- [ ] Limity POEditor API pro dávkové odesílání.

## Podklady

- Klikací prototyp: [`examples/review-ide-prototype`](../../examples/review-ide-prototype/) (původně Claude Design, soukromý: <https://claude.ai/artifact/4W8rbrgX5ZwbU8gDJeDXZw>)
- Původní návrh integrace (Claude Docs): <https://claude.ai/artifact/Hf6441Qb4kwJPcbKpee99g>
- Navazuje na [TASK-51](../../backlog/tasks/task-51%20-%20Integrovat-Azure-DevOps-pull-requesty-s-review-a-drafty-komentářů.md) (Azure DevOps review).
