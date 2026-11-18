# Projekty a Funkce

Platformy vyvíjejí různí vývojáři, takže stejná větev napříč repozitáři není realistická. Uživatel pracuje na jedné platformě (např. Android) a ostatní platformy potřebuje jako referenci při vývoji a pro code review. Proto zavádíme **Funkci**: pojmenovanou sadu odkazů do repozitářů, kde každý odkaz může mít jiný název větve a v čase se posouvá.

> Nahrazuje dřívější návrh sestavy se slotem na platformu a společnou větví.

## Skupina projektů

Repozitáře už nesou `projectGroupId` (`shared/repo-types.ts`). Každý repozitář ve skupině dostane:

- **roli:** Android, iOS, Backend, sdílená knihovna;
- **příznak hlavní / podpůrný:** podpůrný (design systém, sdílené kontrakty) se zobrazí, ale nepočítá se do pohledů napříč platformami;
- **výchozí IDE** pro „Otevřít v…“;
- **vlastní platformu uživatele:** repozitáře, ve kterých uživatel vyvíjí; ostatní jsou reference.

## Funkce

Člen Funkce = repozitář + odkaz, který prochází stavy:

| Stav odkazu | Na co ukazuje | Přechod |
| --- | --- | --- |
| Větev | `origin/<větev>`, libovolný název | Po založení PR na PR |
| Pull request | zdrojová větev PR | Po mergi na merge commit v cílové větvi |
| Mergnuto | merge commit v `main` | Zůstává, případně sleduje `main` |
| Přišpendleno | konkrétní commit nebo tag | Nemění se |

Odkaz jde kdykoli ručně přepnout na jinou větev, PR nebo commit. Smazání větve po mergi odkaz nerozbije.

### Vlastní platforma

Normální Orca workspace (worktree, agenti) přiřazený k Funkci; může jich být víc.

### Reference

- Bez worktree k editaci: sdílený worktree s odpojeným HEAD na commitu odkazu, stejný mechanismus jako review worktree z TASK-51 (`main/azure-devops/review/azure-devops-review-worktree.ts`).
- Soubory jsou na disku, takže funguje navigace přes language servery, analytický model i „Otevřít v Xcode“.
- Aktualizují se samy po fetchi. Orca ukáže, co přibylo od posledního zobrazení, a pohled napříč platformami umí zobrazit právě tyto změny.
- Pokud ve worktree reference běží agent, přepnutí se zablokuje.

### Vznik Funkce

- Ručně: výběr větve, PR nebo commitu pro každý repozitář.
- Automaticky z pracovní položky Azure DevOps: PR ze všech repozitářů nalinkované na stejnou položku se nabídnou jako členové. Ověřit API a konzistenci linkování v týmu.

## Kde se Funkce projeví

- **Levý sidebar:** Projekt → Funkce → workspaces vlastní platformy; u Funkce štítky referencí (např. „iOS · PR #229 otevřený“, „API · main (mergnuto)“).
- **Code review kolegova PR:** pokud PR patří k Funkci, review dostane ostatní platformy jako kontext. Review agent ověří např. volání endpointu proti definici backendu ve stejné Funkci. Samotné review dál běží ve sdíleném review worktree.
- **Funkce napříč platformami:** porovnává rozpracovanou vlastní platformu s referencemi a u každé ukazuje odkaz a commit.

## Agenti

Agent workspace má vidět vlastní platformu i reference. Varianty:

1. Složka Funkce se symbolickými odkazy (`android/`, `ios/`, `api/`) jako pracovní adresář agenta.
2. Seznam cest referencí předaný agentovi v kontextu.

Návrh po pokusu TASK-57 je varianta 2: agent běží ve worktree vlastní platformy, reference dostane jako přidané adresáře se skutečnými cestami (u Claude Code `--add-dir`), jako seznam v kontextu a se zákazem úprav. Složka odkazů nic neušetří: Claude Code přes odkaz čte a zapisuje, až když má skutečné cesty přidané, hledání bez cesty odkazy neprochází a Orca by zápisy, relace i spotřebu připsala složce místo worktree. Měření, Codex podle dokumentace a seznam úprav Orky jsou v [decision-7](../../backlog/decisions/decision-7%20-%20Funkce-a-agenti-reference-jako-přidané-adresáře-a-seznam-cest-ne-složka-se-symbolickými-odkazy.md).
