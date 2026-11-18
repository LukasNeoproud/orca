---
id: decision-7
title: >-
  Funkce a agenti: reference jako přidané adresáře a seznam cest, ne složka se
  symbolickými odkazy
date: '2026-11-18T23:38:00Z'
status: proposed
---
## Context

Agent ve Funkci má vidět worktree vlastní platformy i reference ostatních platforem ([04-projekty-a-funkce.md](../../docs/review-ide/04-projekty-a-funkce.md), oddíl Agenti). Dokumentace nabízí dvě varianty: složku Funkce se symbolickými odkazy (`android/`, `ios/`, `api/`) jako pracovní adresář agenta, nebo seznam cest referencí předaný agentovi. TASK-57 obě vyzkoušel.

- **Nástroje:** Claude Code 2.1.327, model `claude-haiku-5-5`, macOS 27.0, git 2.54.0, ripgrep 15.2.0.
- **Pokus:** tři smyšlené repozitáře (`android-app`, `ios-app`, `api-server`), každý s jedním commitem a jedním worktree: `android-app-login` na větvi `feature/login` (vlastní platforma), `ios-app-ref` a `api-server-ref` s odpojeným HEAD (reference). Složka `feature/` s relativními odkazy `android`, `ios` a `api` na tyto worktrees, s vlastním `CLAUDE.md` a `.claude/settings.json`. Každý worktree má `CLAUDE.md` s jinou značkou, podle které jde poznat, co agent načetl.
- **Běhy:** 13 neinteraktivních běhů (`claude -p`), každý 2 až 8 kroků a 3 až 14 s; cena podle výpisu nástroje 0,023 USD za všechny. Bez uživatelského nastavení (`--setting-sources project,local`), bez MCP serverů, podagentů a webu, s nástroji Read, Edit, Write, Grep, Glob a Bash a s prostředím bez proměnných `ORCA_*`.
- **Neinteraktivní režim:** kde by se interaktivní relace zeptala na povolení, běh `-p` úkon zamítne. „Zamítnuto“ níže proto znamená „v terminálu by přišel dotaz“; výjimkou jsou zakazující pravidla v oddílu Reference jen pro čtení, ta zamítají vždy. Dialog důvěry ke složce se v `-p` nezobrazuje.
- **Hooky:** payload zachytil vlastní hook předaný přes `--settings`, přihlášený k událostem, které odebírají i spravované hooky Orky (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Stop), a navíc k CwdChanged. Hooky Orky samy neběžely, aby pokus nezapisoval do stavu běžící Orky; co Orca s payloadem udělá, je z kódu a z jejího extraktoru spuštěného nad zachycenými payloady.
- **Codex:** jen podle dokumentace čtené 2026-11-19, **neověřeno během**. Codex CLI se nespouštěl.
- **Windows, WSL a SSH:** jen podle dokumentace a kódu Orky, nezkoušeno.
- **Podklady:** skripty, přepisy běhů a payloady hooků jsou v `~/.cache/orca-review-ide/task-57` (`scripts/REPRODUCE.txt`), mimo repozitář. Označení běhů (a1 až a10, b1 až b3) odpovídá souborům v `runs/`.

Zdroje (čtené 2026-11-19; stránky Claude Code a Codexu neuvádějí datum změny):

- [cc-perm]: <https://code.claude.com/docs/en/permissions>, Claude Code: oprávnění, pracovní adresáře, symbolické odkazy
- [codex-cli]: <https://learn.chatgpt.com/docs/developer-commands?surface=cli>, Codex CLI: přepínače (přečteno prvních 100 tisíc znaků)
- [codex-sandbox]: <https://learn.chatgpt.com/docs/sandboxing>
- [codex-security]: <https://learn.chatgpt.com/docs/agent-approvals-security>
- [codex-agents]: <https://learn.chatgpt.com/docs/agent-configuration/agents-md>
- [codex-hooks]: <https://learn.chatgpt.com/docs/hooks>
- [codex-config]: <https://learn.chatgpt.com/docs/config-file/config-reference> (přečteno prvních 100 tisíc znaků)
- [ms-symlink]: <https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/security-policy-settings/create-symbolic-links>
- [node-fs]: <https://nodejs.org/api/fs.html>, `fs.symlink` a typ `junction`

Adresy `developers.openai.com/codex/…` přesměrovávají na `learn.chatgpt.com/docs/…`.

## Findings

### Složka odkazů jako pracovní adresář (Claude Code)

| Úkon | Podmínky | Výsledek | Běh |
| --- | --- | --- | --- |
| Čtení `ios/…` přes odkaz | Výchozí oprávnění | Zamítnuto, cíl odkazu je mimo pracovní adresáře | a1 |
| Čtení přes odkaz | Pravidlo `Read` na cestu složky s odkazy | Zamítnuto stejně | a2 |
| Čtení přes odkaz | `--add-dir` se skutečnými cestami worktrees | Funguje | a3 |
| Čtení přes odkaz | `--add-dir` s cestou odkazu (`feature/api`) | Zamítnuto | a9 |
| Úprava `android/…` přes odkaz | `--add-dir` skutečných cest, režim acceptEdits | Funguje, soubor se změní ve worktree Androidu | a3 |
| Grep bez cesty a s cestou `.` | S `--add-dir` i bez | Najde 1 soubor ze 4, jen ten přímo ve složce; odkazy neprochází | a2, a3, a10 |
| Grep s cestou `android` | Bez `--add-dir` zamítnuto, s ním funguje | Najde soubor ve worktree | a2, a3 |
| Glob `**/*.swift` a `ios/**/*.swift` | S `--add-dir` i bez | Nenajde nic | a2, a3 |
| Glob `**/*.swift` s cestou `ios` | `--add-dir` skutečných cest | Funguje | a10 |
| `cat api/…`, `ls api` v Bashi | Bez `--add-dir`, pravidla `Bash(cat:*)` a `Bash(ls:*)` | Zamítnuto, cíl je mimo pracovní adresáře | a8, a9 |
| `git status` ve složce | | Selže, složka není repozitář | a4 |
| `git -C android status` | `--add-dir`, pravidlo pro příkaz | Funguje: větev `feature/login` a změněný soubor | a4 |
| `cd android && git status` | `--add-dir` | Zamítnuto: změna adresáře před příkazem gitu vyžaduje schválení | a4 |
| `git -C android add -A` a `commit` | `--add-dir`, pravidla pro příkazy | Funguje: commit je na `feature/login` v repozitáři Androidu, ověřeno z hlavního checkoutu | a4 |

- **Znění zamítnutí:** „…/feature/ios/Sources/Demo/LoginClient.swift resolves through a symlink to …/worktrees/ios-app-ref/Sources/Demo/LoginClient.swift, which is outside the allowed working directories.“
- **Odkazy samy nic neotevřou.** Claude Code kontroluje cestu, o kterou agent žádá, i soubor, na který vede. Povolující pravidlo platí, jen když vyhovují obě ([cc-perm]). Skutečné cesty worktrees se proto musí přidat tak jako tak.
- **Nastavení složky nestačí.** `permissions.additionalDirectories` v `.claude/settings.json` složky nástroj přeskočil: „Ignoring 2 permissions.additionalDirectories entries from .claude/settings.json: this workspace has not been trusted.“ (a8, a9). Po přijetí dialogu důvěry by podle [cc-perm] platily; neměřeno.
- **Hledání odkazy neprochází.** Stejně se chová `rg` a `grep -r` spuštěné ve složce ručně (1 soubor ze 4); `rg -L` a `grep -rS` najdou všechny 4.
- **Po `cd` přes odkaz agent ze složky vypadne** (a10). `cd android && pwd` vypíše cestu odkazu, ale Claude Code si jako pracovní adresář zapíše skutečnou cestu `…/worktrees/android-app-login`. Další `pwd` vrátí ji, `cd ios/Sources` selže s „no such file or directory“ a hook hlásí událost CwdChanged ze složky do worktree.
- **Úprava bez `--add-dir`** se neměřila. Podle [cc-perm] se zápis, jehož cíl leží mimo pracovní adresáře, v režimu acceptEdits sám neschválí.
- **Instrukce:** `CLAUDE.md` složky se načte při startu (a1). `CLAUDE.md` z worktrees se načte, až když agent přes odkaz přečte soubor v daném worktree (a5). Nastavení z `.claude/settings.json` ve worktrees se nenačte v žádném běhu ze složky.
- **Pracovní adresář přímo v odkazu** (a7, spuštěno v `feature/android`): Claude Code cestu hned převede na skutečnou. Pracovní adresář, cesty souborů, payload hooků i složka přepisů nesou cestu worktree, načte se `CLAUDE.md` a nastavení worktree a `git status` funguje. `CLAUDE.md` složky se nenačte. Jen `pwd` v shellu vrací cestu odkazu.

### Seznam cest: worktree vlastní platformy a přidané adresáře (Claude Code)

Agent běží ve worktree Androidu, reference má přes `--add-dir` a jejich cesty v zadání (b1, b2).

| Úkon | Výsledek |
| --- | --- |
| Čtení souboru reference absolutní cestou | Funguje |
| Grep bez cesty | Hledá jen ve worktree vlastní platformy (1 soubor), reference nezahrne |
| Grep a Glob s cestou reference | Fungují |
| `git status` | Funguje bez dalších voleb: `feature/login` a změněný soubor |
| `git -C <reference> log` | Funguje |
| Úprava vlastního souboru, `git add -A`, `git commit` | Funguje, commit je na `feature/login` |
| `CLAUDE.md` a nastavení vlastní platformy | Načtou se při startu |
| `CLAUDE.md` referencí | Nenačte se ani po čtení souboru v referenci (b1); s `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` se načte při startu (b2) |

### Reference jen pro čtení

| Zakazující pravidlo | Pokus o zápis | Výsledek | Běh |
| --- | --- | --- | --- |
| `Edit` na skutečnou cestu reference | Edit přes odkaz ve složce | Zamítnuto | a6 |
| `Edit` na cestu odkazu ve složce | Edit přes odkaz | Zamítnuto | a6 |
| `Edit` na cestu odkazu ve složce | Edit skutečnou cestou | Zamítnuto | a6 |
| `Edit` na skutečnou cestu reference | Edit skutečnou cestou z worktree vlastní platformy | Zamítnuto | b2 |
| `Edit` na skutečnou cestu reference, k tomu povolené `Bash(sed:*)` | `sed -i` do souboru reference | Zamítnuto | b3 |

- Zakazující pravidlo platí, když vyhovuje cesta odkazu nebo jeho cíl ([cc-perm]); měření to potvrzuje v obou směrech.
- Samotná věta v `CLAUDE.md`, že reference jsou jen pro čtení, model v jednom běhu poslechl a zápis nezkusil (a5). To je chování modelu, ne ochrana.
- Nezkoušeno: zápis skriptem nebo příkazem, který Claude Code nepozná jako úpravu souboru, a příkazy gitu měnící worktree reference.

### Co hlásí hooky a jak to Orca přiřadí

| Situace | `cwd` v payloadu | `tool_input.file_path` u Read a Edit | Složka přepisů v `~/.claude/projects` |
| --- | --- | --- | --- |
| Složka odkazů, zápis přes odkaz (a3) | `…/feature` | `…/feature/android/app/…/LoginApi.kt`, cesta přes odkaz | `…-task-57-feature` |
| Složka odkazů po `cd android` (a10) | `…/worktrees/android-app-login` | | `…-task-57-feature`; 19 řádků přepisu nese složku, 16 worktree |
| Pracovní adresář je odkaz (a7) | `…/worktrees/android-app-login` | Skutečná cesta | `…-task-57-worktrees-android-app-login` |
| Worktree vlastní platformy a přidané adresáře (b2) | `…/worktrees/android-app-login` | Skutečná cesta, i u souboru reference | `…-task-57-worktrees-android-app-login` |

- Stejnou cestu jako `tool_input.file_path` nese i `tool_response.filePath`. U Bashe payload obsahuje jen příkaz (`git -C android commit …`), žádnou cestu.
- **Orca zápis nepřiřazuje podle cesty.** Worktree události je `ORCA_WORKTREE_ID` z prostředí panelu, ve kterém agent běží (`src/main/agent-hooks/hook-post-command.ts`, `src/shared/agent-hook-listener/hook-envelope.ts`). `cwd` z payloadu Orca u Claude nečte a `file_path` použije jen jako text náhledu u stavu agenta (`src/shared/agent-hook-listener/tool-input-preview.ts`); její extraktor nad payloadem z a3 vrátí cestu přes odkaz.
- **Ve složce odkazů** tak Orca zápis do worktree Androidu připíše workspace složky, ne worktree Androidu. Soubor se na disku změní ve skutečném worktree a jeho `git status` změnu ukáže, ale bez vazby na agenta.
- **Ve worktree vlastní platformy** přiřadí Orca zápis správně bez jakékoli úpravy, protože panel patří tomuto worktree.
- **Spotřeba** se přiřazuje podle `cwd` z přepisu a toho, který worktree ho obsahuje (`src/main/claude-usage/worktree-attribution.ts`, `src/main/usage/usage-worktree-resolver.ts`). Složka odkazů neleží v žádném worktree, takže spotřeba zůstane bez worktree; po `cd` přes odkaz se její část připíše worktree Androidu. Z kódu, neměřeno.
- **Relace** hledá Orca podle složky přepisů odvozené z cesty workspace (`src/main/ai-vault/claude-project-dir-encoding.ts`). Relace ze složky odkazů leží jinde než relace worktree.
- **Git ve složce odkazů chybí:** přepis nese větev `HEAD` místo `feature/login`.

### Co běhy zapsaly do ~/.claude

- V `~/.claude/projects` přibyly tři složky: `…-task-57-feature` (9 přepisů), `…-task-57-worktrees-android-app-login` (4 přepisy) a `…-task-57-repos-android-app` (prázdná `memory`; paměť worktree se váže na hlavní checkout repozitáře).
- `~/.claude/settings.json` má stejný otisk jako před pokusem. V `~/.claude.json` nepřibyl žádný projekt (103 před i po).
- Po bězích nezůstal žádný proces. Nic se nemazalo.

### Claude Code a Codex přes odkaz

| Úkon přes odkaz | Claude Code 2.1.327 (měřeno) | Codex (dokumentace, neověřeno během) |
| --- | --- | --- |
| Čtení | Jen s přidanou skutečnou cestou cíle; jinak dotaz | Čtení mimo workspace dokumentace neomezuje ani nepopisuje; chování přes odkaz nezjištěno |
| Úprava | Jen s přidanou skutečnou cestou cíle | Zápis jen do workspace a přidaných kořenů ([codex-security]); jestli zápis přes odkaz do cíle mimo workspace projde, nezjištěno |
| Hledání | Bez cesty odkazy neprochází; s cestou odkazu funguje | Nezjištěno |
| `git status` | Ve složce selže; `git -C android` funguje; `cd` a git se ptá | Složka není repozitář: doporučený režim je jen pro čtení a `codex exec` chce `--skip-git-repo-check` ([codex-security], [codex-cli]) |
| Commit | `git -C android commit` zapíše do správného repozitáře a větve | `.git` je v zapisovatelném kořeni jen pro čtení, ať je to složka, nebo soubor ([codex-security]); commit by tedy měl čekat na schválení |

Co dokumentace Codexu říká dál:

- **Adresáře:** `--cd` nastaví pracovní adresář. `--add-dir` dává dalším adresářům právo zápisu ([codex-cli]); přidaný adresář jen pro čtení dokumentace nezná. Totéž dělá klíč `sandbox_workspace_write.writable_roots` ([codex-config]).
- **Sandbox** platí i pro spuštěné příkazy, na macOS přes Seatbelt, na Linuxu a ve WSL2 přes bubblewrap, na Windows přes vlastní sandbox ([codex-sandbox]).
- **Symbolické odkazy** dokumentace nezmiňuje, kromě klíče `allow_symlinked_codex_home` pro domovskou složku Codexu ([codex-config]).
- **AGENTS.md** čte od kořene projektu, obvykle kořene gitu, dolů k pracovnímu adresáři; bez kořene jen z pracovního adresáře ([codex-agents]). Ve složce odkazů by tedy načetl jen její soubor, z worktree vlastní platformy soubory tohoto worktree. Soubory referencí nenačte v žádné variantě.
- **Hooky:** `cwd` je pracovní adresář relace; PreToolUse a PostToolUse pokrývají Bash i `apply_patch` a oba nesou `tool_input.command` ([codex-hooks]). Jestli jsou cesty v patchi absolutní, dokumentace neříká.

### Windows, WSL a SSH

Podle dokumentace a kódu Orky, nezkoušeno.

- **Vytvoření odkazu:** právo vytvářet symbolické odkazy mají na Windows ve výchozím stavu jen správci ([ms-symlink]). Orca proto jinde používá junction, který právo nepotřebuje (`src/main/claude-accounts/claude-profile-history.ts`). Junction umí jen adresáře a cíl musí být absolutní cesta ([node-fs]); relativní odkazy jako v pokusu nejdou a přesun worktree odkaz rozbije.
- **Kontrola oprávnění** Claude Code prochází symbolické odkazy i junction také na Windows ([cc-perm]). Skutečné cesty by se tedy musely přidat stejně jako na macOS.
- **Mazání:** kód Orky zná případy, kdy rekurzivní mazání na Windows prošlo junction a smazalo cíl (`src/main/pty/overlay-mirror.ts`), a Git for Windows do junction nevstupuje (`src/main/git/worktree-removal.ts`). Úklid složky odkazů by potřeboval stejnou opatrnost.
- **WSL a SSH:** složku odkazů by musel vytvořit, opravovat a uklízet stroj, na kterém worktrees leží, tedy distribuce WSL nebo vzdálený hostitel. Seznam cest potřebuje jen cesty platné na tom stroji a na disk nic nepřidává.
- **Seznam cest na Windows:** `--add-dir` bere běžné cesty a žádné právo nepotřebuje. Síťové cesty (UNC) jako pracovní adresář přidat nejdou ([cc-perm]).

### Porovnání variant

| Hledisko | Složka odkazů | Seznam cest z worktree vlastní platformy |
| --- | --- | --- |
| Přístup k souborům | Až s `--add-dir` skutečných cest; odkazy samy nic neotevřou | S `--add-dir` skutečných cest |
| Hledání napříč platformami | Bez cesty nenajde nic z platforem; je nutné jmenovat odkaz | Bez cesty jen vlastní platforma; je nutné jmenovat cestu reference |
| Stabilita cest | Po prvním `cd` přes odkaz relativní jména přestanou platit | Absolutní cesty platí celou relaci |
| Git | Složka není repozitář; jen `git -C`, `cd` a git se ptá | Vlastní platforma bez voleb, reference přes `git -C` |
| Instrukce a nastavení | `CLAUDE.md` složky; z platforem až po čtení souboru; nastavení platforem ne | Vlastní platforma při startu; reference volitelně proměnnou prostředí |
| Reference jen pro čtení | Zakazující pravidla fungují | Zakazující pravidla fungují |
| Přiřazení v Orce | Stav agenta, relace a spotřeba u složky, ne u worktree | Vše u worktree vlastní platformy stávajícími mechanismy |
| Codex (dokumentace) | Složka mimo git, `AGENTS.md` jen ze složky | Běžný worktree |
| Windows | Junction s absolutním cílem, opatrné mazání | Bez zásahu do disku |
| WSL a SSH | Složku udržuje vzdálený stroj | Jen cesty platné na tom stroji |
| Co Orca udržuje na disku | Složku, odkazy, jejich opravy a úklid | Nic |

## Decision

Návrh: seznam cest. Agent běží ve worktree vlastní platformy, tedy v běžném workspace Orky, a reference dostane jako přidané adresáře se skutečnými cestami a jako krátký seznam v kontextu. Složku se symbolickými odkazy Orca nevytváří.

- **Proč ne složka odkazů:** nic neušetří, protože skutečné cesty se musí přidat i s ní. Hledání bez cesty v ní nenajde nic z platforem, po prvním `cd` přes odkaz přestanou relativní jména platit a složka není repozitář.
- **Proč seznam cest:** čtení, hledání s cestou, `git status` i commit fungují bez zvláštních voleb a Orca zápisy, relace i spotřebu přiřadí worktree vlastní platformy tím, co už má.
- **Seznam v kontextu je nutný**, ne jen přidané adresáře: hledání bez cesty reference nezahrne, takže agent musí vědět, kde leží.
- **Reference jen pro čtení:** zakazující pravidlo `Edit` na cestu každé reference, předané relaci, ne zapsané do repozitáře. Věta v instrukcích nestačí.
- **`CLAUDE.md` referencí** se ve výchozím stavu nenačítá. Jsou to instrukce pro práci na cizí platformě a zabírají kontext; zapnout jdou proměnnou prostředí.
- **Review agent** nad cizím pull requestem dostane ostatní platformy stejně: pracovní adresář je review worktree, reference jsou přidané adresáře.
- **Codex a ostatní agenti** dostanou zatím jen seznam cest v kontextu. Přidaný adresář u Codexu znamená právo zápisu, což pro reference nechceme.

K rozhodnutí se vrátit, až půjde spustit Codex, a pokud by nástroje agentů začaly při hledání procházet symbolické odkazy.

## Consequences

Úpravy, které Orca potřebuje:

1. **Cesty referencí pro workspace:** pro workspace přiřazený k Funkci zjistit skutečné cesty worktrees referencí na stroji, kde agent poběží. Cesta přes odkaz jako přidaný adresář nefunguje.
2. **Claude ve strukturované relaci:** přidat cesty do `additionalDirectories` v `src/main/claude/claude-structured-launch-resolution.ts`. Dnes tam jdou adresáře z nastavení uživatele, složka příloh a složka vizuálů.
3. **Claude v terminálu:** přidat `--add-dir` do příkazu, kterým Orca agenta spouští.
4. **Ochrana referencí:** ke každé referenci zakazující pravidlo `Edit`, předané při spuštění relace.
5. **Seznam v kontextu:** role platformy, cesta, stav odkazu (větev, pull request, mergnuto, přišpendleno) a commit, s pokynem hledat s cestou reference.
6. **Změna členů Funkce za běhu:** běžící relace nové reference nevidí. Strukturovaná relace je dostane při dalším spuštění, terminálový agent po restartu nebo příkazem `/add-dir`.
7. **Blokování přepnutí reference:** dokumentace blokuje přepnutí, když ve worktree reference běží agent. V této variantě v něm agent neběží, jen z něj čte. Orca si proto musí pamatovat, kterým relacím referenci přidala; jestli jim přepnutí blokovat, je otázka pro návrh M7.
8. **Náhled u stavu agenta** ukáže u souboru reference absolutní cestu. Zkrácení na roli platformy je drobnost navíc.
9. **Codex:** nic nepřidávat. Strukturovaná relace Codexu dnes `--add-dir` z nastavení uživatele zahazuje (`src/main/codex/codex-structured-launch-args.ts`) a zapisovatelné kořeny nastavuje sama.

Co se nemění: hooky, přiřazení stavu agenta, relací a spotřeby, protože agent běží ve worktree jako dnes.

Další důsledky:

- U SSH a WSL musí reference ležet na stejném stroji jako worktree vlastní platformy. Jinak ji agent nevidí a Orca to má ukázat.
- Zakazující pravidla jsou ochrana na úrovni nástroje, ne systému. Skript spuštěný agentem do reference zapsat může.
- Příkaz `cd <reference> && git …` vyžaduje u Claude Code schválení; seznam v kontextu má doporučit `git -C`.
- Nezkoušeno: interaktivní relace a její dotazy, dialog důvěry, podagenti a přidané adresáře, `/add-dir` za běhu, Codex a další agenti, Windows, WSL, SSH, starší verze Claude Code (pravidla pro symbolické odkazy se podle [cc-perm] měnila ve verzi 2.1.268).
