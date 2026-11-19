---
id: TASK-70
title: Rozepsat tikety milníku M3 Editor
status: To Do
assignee: []
created_date: '2026-11-18T12:45:00Z'
updated_date: '2026-11-19T15:50:00Z'
labels:
  - review-ide
  - planovani
  - effort-xhigh
milestone: m-3
dependencies:
  - TASK-53
  - TASK-54
  - TASK-55
  - TASK-56
documentation:
  - docs/review-ide/02-editor.md
  - docs/review-ide/07-funkce-z-ide.md
priority: medium
type: task
ordinal: 300000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připravit tikety pro hostitele language serverů a most do Monaca v rozsahu, který potvrdily pokusy.

### Podklady

- `docs/review-ide/02-editor.md`; `docs/review-ide/07-funkce-z-ide.md`, body 1, 2, 3 a 10.
- Záznamy rozhodnutí z TASK-53 až TASK-56 a prototyp na větvi `review-ide-pokus-lsp-most`.

### Poznámky k rozsahu

- Jazyky zařaď podle výsledků pokusů; jazyk, který neprošel, dostane jen Otevřít v IDE.
- Počítej se SSH worktrees, s uspáváním serverů a s přístupem agentů přes CLI a MCP.

Tikety piš podle pravidel ve skillu `review-ide` (soubor `tikety.md`). Výchozí body v kódu ověř v aktuálním stromu, dokumentace vznikla nad starším commitem.

### Čeká na uživatele

Zařazení milníku do další vlny. Pořadí milníků po první vlně (M0 až M2) určuje uživatel podle výsledků pokusů; koordinátor mu ho předloží s doporučením.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Každá funkce milníku z dokumentace má tiket, nebo je výslovně odložená s důvodem v poznámkách tohoto tiketu
- [ ] #2 Každý tiket má odkaz na oddíl dokumentace, cíl, rozsah, mimo rozsah, výchozí body v kódu ověřené v aktuálním stromu, omezení, pozorovatelná akceptační kritéria a štítek effort
- [ ] #3 Každý tiket zvládne jeden worker v jednom běhu; větší celky jsou rozdělené na svislé řezy, které jdou samostatně ověřit
- [ ] #4 Závislosti jsou jen tam, kde je skutečné pořadí, a netvoří cyklus
- [ ] #5 Otázky pro uživatele k rozsahu, placeným službám a chování navenek jsou v poznámkách tiketu, každá s možnostmi a doporučením
- [ ] #6 Popis milníku v backlog/milestones odpovídá naplánovanému rozsahu
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Podklady z TASK-53 (2026-11-18): decision-1 navrhuje Kotlin v M3 bez language serveru. Pro hostitele language serverů počítat se signálem o stavu a selhání importu projektu (jinak prázdná odpověď vypadá jako soubor bez chyb) a s obsahem dokumentů mimo disk (workspace/textDocumentContent, URI jar:). Otázky pro uživatele: 1) přijmout návrh decision-1 (A bez language serveru, doporučeno; B experimentální režim za přepínačem; C odložit plánování Kotlinu); 2) nahlásit obě chyby JetBrains se smyšleným projektem (ven by šel jen smyšlený projekt a výpis chyby; doporučeno ano); 3) ponechat stažený server v ~/.cache/orca-review-ide/tools (1,1 GB) pro nový pokus.

Podklady z TASK-54 (2026-11-18): decision-2 navrhuje vlastní tenký most. Navazující práce pro plán M3: hostitel language serverů v runtime (relace na stroj, kořen worktree a jazyk, fronta, požadavky serveru, pád a restart, uspání); most v rendereru do produkční kvality (rušení dotazů, soubor ve dvou oknech, didSave, testy); modely zavřených souborů pro náhledy (Peek dnes ukáže prázdný náhled); aplikace úprav přes více souborů; dokumenty mimo disk jako taby jen pro čtení; workspace/didChangeWatchedFiles; stav relace v rozhraní; language servery přes SSH (metody v orcad, stream diagnostiky, vyjednaná schopnost). Otázky pro uživatele: 1) přijmout decision-2 (vlastní most, doporučeno); 2) smí hostitel dostat závislosti vscode-languageserver-protocol a vscode-jsonrpc (obě MIT; rozhodne koordinátor, volná licence).

Podklady z TASK-55 (2026-11-18): decision-3 navrhuje Swift přes xcode-build-server jen nad sestaveným worktree. Pro plán M3: podmínka připravenosti v katalogu serverů a stavy relace „není připraveno“ a „build je starší než zdroje“ s akcí Připravit Swift (příkaz z nastavení repozitáře); hostitel odpovídá na window/showMessageRequest nebo spouští server s --bypass-workspace-trust (v decision-2 chybí); hostitel počítá a uklízí i SourceKitService; buildServer.json do .git/info/exclude; server nejde zavřít do sandboxu a při otevření projektu Xcode jako balíčku stahuje závislosti ze sítě. Otázky pro uživatele: 1) kdo spouští build pro Swift (a jen na pokyn, doporučeno; b automaticky při otevření Swift souboru: dvě minuty všech jader a asi 2,9 GB na worktree); 2) jak se na stroj dostane xcode-build-server (a Orca stáhne připnutou verzi s kontrolním součtem, MIT, doporučeno; b každý si ho nainstaluje sám); 3) zkusit sourcekit-xcode-bsp před rozepsáním M3 (doporučeno ne); 4) ponechat 454 MB klonů veřejných závislostí v ~/Library/Caches/org.swift.swiftpm/repositories (doporučeno nechat).

Podklady z TASK-56 (2026-11-18): decision-4 navrhuje pro C# Roslyn language server jen nad worktree s obnovenými balíčky, csharp-ls jako zálohu. Pro plán M3: podmínka připravenosti (SDK podle global.json nainstalovaná, balíčky obnovené) a akce Připravit C#; spouštět s --telemetryLevel off a s false na projects.dotnet_enable_automatic_restore, jinak server sáhne na soukromé zdroje balíčků s uloženým přihlášením; úklid stromu procesů (BuildHost může server přežít) a hlídání zaseknutého načtení; most: diagnostika jen na vyžádání, zadržet dotazy do workspace/projectInitializationComplete, dokumenty mimo worktree přes workspace/textDocumentContent; v decision-2 chybí workspace/configuration, client/registerCapability a workspace/diagnostic/refresh. Otázky pro uživatele: 1) jak Orca server získá (a stáhne z nuget.org na počítači uživatele, 63 MB, doporučeno; b přibalit, potřebuje právní posouzení telemetrických knihoven; c ruční instalace přes dotnet tool); 2) vadí jen předběžné verze a identifikátor zařízení zapsaný do domovské složky i s vypnutou telemetrií (doporučeno nevadí; jinak csharp-ls); 3) zopakovat měření nad aktuálním backendem, což potřebuje restore se sítí a přihlášením (doporučeno až při ověřování M3); 4) má M3 umět i backend s projekty pro .NET Framework (doporučeno ne; jinak SDK 6 a Mono na počítačích týmu).

Odpověď uživatele 2026-11-19 (decision-12): decision-1 varianta B (Kotlin: experimentální režim language serveru za přepínačem), chyby JetBrains nehlásit; decision-2 přijat; decision-3: build jen na pokyn, xcode-build-server stahuje Orca připnutý s kontrolním součtem; decision-4: Roslyn z nuget.org, předběžné verze nevadí, měření nad aktuálním backendem až při ověřování M3, .NET Framework jako volba uživatele (SDK 6 a Mono doinstaluje, kdo chce hlubší integraci). Otevřené: druhý build server sourcekit-xcode-bsp (TASK-55) a zařazení milníku.

Odpověď uživatele 2026-11-19 (decision-12, doplnění): sourcekit-xcode-bsp před rozepsáním M3 nezkoušet, pokus později.

Odpověď uživatele 2026-11-19 (decision-12): pořadí milníků po M2 je M3, M4, M5, M6, M7, M8; milník se rozepíše až po rozepsání předchozího.
<!-- SECTION:NOTES:END -->
