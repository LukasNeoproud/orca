# Rozložení

Levý sidebar je navigace po celém projektu (co otevřít), pravý sidebar nástroje pro to, co je právě otevřené, hlavní plocha obsah.

## Tool windows

Taby pravého sidebaru (`STATIC_RIGHT_SIDEBAR_TABS` v `shared/rpc-contract/client-ui-params.ts`) zobecnit na tool windows s vlastností strany. Výchozí rozmístění podle tabulky; uživatel může panel přesunout a volba se uloží stejně jako dnešní tab pravého sidebaru.

| Panel | Výchozí strana | Proč |
| --- | --- | --- |
| Workspaces | vlevo | Navigace po workspaces projektu, agenti a terminály |
| Project view (dnes Explorer) | vlevo | Strom přes všechny platformy, jako v JetBrains |
| Pull requests | vlevo | Globální, nezávislý na aktivním workspace (TASK-51) |
| Backlog | vlevo | Úkoly celého projektu, z úkolu vzniká workspace |
| Vault (historie agentů) | vlevo | Sezení napříč workspaces projektu |
| Workspaces (připojené worktrees) | zrušit | Splyne s řádkem workspace vlevo |
| Source control | vpravo | Commit v aktuálním workspace, rozdělený po platformách |
| Checks, PR checks | vpravo | místní brány kvality, CI a stav PR aktuálního workspace |
| Search | vpravo | Hledání v aktuálním workspace s volbou rozsahu |
| Ports | vpravo | Běžící procesy aktuálního workspace |
| Panely pluginů | vpravo | Uživatel je může přesunout |
| Struktura (nový) | vpravo | Symboly otevřeného souboru |
| Nálezy (nový) | vpravo | Zdraví kódu pro otevřený soubor |
| Komentář AI a původ (nový) | vpravo | U vybraného celku v diffu |

Velké pohledy (navigační graf, moduly, lokalizace, zdraví kódu) jsou taby v hlavní ploše, otevírané z levého panelu nebo z menu.

## Režimy

Úzká lišta ikon vlevo přepíná obsah levého panelu. Režim určuje i výchozí rozložení, které si Orca pamatuje pro každý workspace.

| Režim | Zkratka | Levý panel | Hlavní plocha |
| --- | --- | --- | --- |
| Workspaces | CmdOrCtrl+0 | Projekty → Funkce → workspaces, agenti, terminály | Terminál nebo chat agenta |
| Projekt | CmdOrCtrl+1 | Project view | Editor a taby pohledů |

V režimu Projekt zůstává dole v Project view proužek se stavem agentů aktuálního workspace. Mezi workspaces se přepíná rozbalovacím seznamem nahoře nebo paletou worktrees.

## Project view

- Kořen = aktuální workspace, pod ním uzly platforem: vlastní platforma (editovatelná) a reference ostatních platforem (jen pro čtení, viz [Projekty a Funkce](./04-projekty-a-funkce.md)).
- Přepínač pohledu:
  - **Moduly:** Gradle moduly, SPM targety, `.csproj` z analytického jádra, se značkami změn a nálezů.
  - **Soubory:** dnešní průzkumník s více kořeny.
  - **Změny:** změny proti bázi seskupené po celcích.
  - **Funkce:** obrazovky a funkce spárované napříč platformami.
- Výběr se synchronizuje s otevřeným souborem; drobečková navigace v editoru ukazuje platformu a modul.
- Projekt s jedním repozitářem má jediný kořen.
