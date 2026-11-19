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
| [Model kódu](./09-model-kodu.md) | Schéma verze 0: moduly a závislosti, fakta o souborech, obrazovky, controllery, lokalizační klíče a klíč cache |

## Přijatá rozhodnutí

- Funkce se integrují přímo do jádra forku, opinionated způsobem. Otevřený plugin systém pro ně nestavíme; případné pluginy později nad celým Orca Dev.
- Editor je Monaco doplněné o language servery. Code-server ani jiný vložený VS Code workbench nepoužijeme.
- Ladění, build, Compose Preview a simulátory se předávají do Android Studia, Xcode nebo VS Code otevřením na konkrétním řádku.
- Levý sidebar je navigace po celém projektu, pravý sidebar nástroje pro to, co je právě otevřené, hlavní plocha obsah.
- Stejná větev napříč platformami není realistická. Ostatní platformy jsou reference jen pro čtení, svázané přes Funkci.
- Agent dostává zpětnou vazbu z bran kvality a opravuje kód dřív, než práci ohlásí jako hotovou.
- Nálezy mají závažnost, jistotu, četnost, dopad a prioritu; nálezy AI nesou důkaz.

## Otevřené otázky

- [x] Linkuje tým PR na pracovní položky Azure DevOps konzistentně? Ne: z posledních 455 dokončených pull requestů pěti repozitářů ve dvou organizacích nemá navázanou položku žádný, žádný commit položku nenese a zásada, která by vazbu vyžadovala, není nastavená. Token uložený v Orce pracovní položky číst nesmí, takže opačný směr a podíl položek s pull requesty z více repozitářů zůstaly neověřené. Návrh: Funkce v M7 zakládat jen ručně, viz [decision-8](../../backlog/decisions/decision-8%20-%20Funkce-z-pracovní-položky-Azure-DevOps-v-M7-jen-ručně-pull-requesty-ve-vzorku-na-položky-navázané-nejsou.md).
- [x] Zvládne kotlin-lsp Android projekt s Gradle variantami? Zatím ne: import běžné Android aplikace selže a třída `R` se v knihovních modulech nenajde. Návrh je nechat Kotlin v M3 bez language serveru, viz [decision-1](../../backlog/decisions/decision-1%20-%20Kotlin-v-editoru-M3-kotlin-lsp-zatím-ne-jen-Otevřít-v-Android-Studiu.md).
- [x] Vlastní most LSP → Monaco, nebo `@codingame/monaco-vscode-api`? Návrh: vlastní tenký most. Prototyp se sourcekit-lsp funguje; knihovna by vyměnila připnuté Monaco za jiné sestavení, přidala 5,4 MB do rendereru a neřeší hostitele, SSH ani agenty, viz [decision-2](../../backlog/decisions/decision-2%20-%20Language-servery-v-editoru-vlastní-tenký-most-do-Monaca-ne-monaco-vscode-api.md).
- [x] Funguje sourcekit-lsp na iOS projektu s `.xcodeproj`? Ano, přes build server a jen nad sestaveným worktree: po buildu fungují všechny funkce bez falešných chyb, bez něj dostane každý soubor falešnou chybu. Návrh: lehkou část přípravy udělá Orca, build spustí uživatel nebo agent, viz [decision-3](../../backlog/decisions/decision-3%20-%20Swift-v-editoru-M3-sourcekit-lsp-přes-build-server-jen-nad-sestaveným-worktree.md).
- [x] Který language server pro C#, Roslyn language server, nebo csharp-ls? Návrh: Roslyn language server, stažený z nuget.org na počítači uživatele a jen nad worktree s obnovenými balíčky. Po `dotnet restore` fungují všechny funkce bez falešných chyb i bez buildu, bez něj má chybu 47 ze 60 souborů. Oba servery jsou pod MIT a aplikace mimo produkty Microsoftu je používat smí; csharp-ls zůstává zálohou, viz [decision-4](../../backlog/decisions/decision-4%20-%20C-v-editoru-M3-Roslyn-language-server-nad-obnoveným-worktree-csharp-ls-jako-záloha.md).
- [x] Pracují Claude Code a ostatní agenti správně ve složce se symbolickými odkazy na více worktrees? Claude Code jen s výhradami: přes odkaz čte a zapisuje, až když dostane skutečné cesty worktrees jako přidané adresáře, hledání bez cesty odkazy neprochází a po prvním `cd` přes odkaz relativní jména přestanou platit; commit přes `git -C` jde do správného repozitáře. Codex jen podle dokumentace, neověřeno během. Návrh: agent běží ve worktree vlastní platformy a reference dostane jako přidané adresáře a seznam cest, složku odkazů Orca nevytváří, viz [decision-7](../../backlog/decisions/decision-7%20-%20Funkce-a-agenti-reference-jako-přidané-adresáře-a-seznam-cest-ne-složka-se-symbolickými-odkazy.md).
- [x] Limity POEditor API pro dávkové odesílání. Podle dokumentace (neověřeno proti živému API): Free 100 požadavků za minutu a 2 000 za hodinu, upload 1 za 20 s, strop dávky neuvedený. Návrh: JSON metody API místo nahrávání souborů, jeden požadavek za druhým, nejvýš 1 za sekundu a 100 položek v dávce, viz [decision-6](../../backlog/decisions/decision-6%20-%20POEditor-v-M6-synchronizace-přes-JSON-metody-API-jeden-požadavek-za-druhým-pod-limity-tarifu-Free.md).
- [x] Jsou extraktory pro Kotlin, Swift a C# proveditelné bez buildu a jak má vypadat společné schéma? Ano: prototypy složí model skutečného projektu za 0,4 až 1,8 s bez buildu, synchronizace i sítě a statické čtení build souborů dává stejné moduly a hrany jako Gradle Tooling API a MSBuild. Návrh: schéma verze 0 podle [09-model-kodu.md](./09-model-kodu.md), statické čtení jako výchozí a cache podle obsahu souborů; přechody a použití lokalizačních klíčů prototypy neověřily a distribuci extraktorů rozhodne uživatel, viz [decision-9](../../backlog/decisions/decision-9%20-%20Model-kódu-schéma-verze-0-a-statické-čtení-build-souborů-jako-výchozí-distribuce-extraktorů-k-rozhodnutí.md).

## Podklady

- Klikací prototyp: [`examples/review-ide-prototype`](../../examples/review-ide-prototype/) (původně Claude Design, soukromý: <https://claude.ai/artifact/4W8rbrgX5ZwbU8gDJeDXZw>)
- Původní návrh integrace (Claude Docs): <https://claude.ai/artifact/Hf6441Qb4kwJPcbKpee99g>
- Navazuje na [TASK-51](../../backlog/tasks/task-51%20-%20Integrovat-Azure-DevOps-pull-requesty-s-review-a-drafty-komentářů.md) (Azure DevOps review).
