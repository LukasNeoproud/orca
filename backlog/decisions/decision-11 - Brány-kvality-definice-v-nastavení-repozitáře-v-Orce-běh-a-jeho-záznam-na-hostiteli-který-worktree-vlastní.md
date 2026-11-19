---
id: decision-11
title: >-
  Brány kvality: definice v nastavení repozitáře v Orce, běh a jeho záznam na
  hostiteli, který worktree vlastní
date: '2026-11-19T05:12:00Z'
status: accepted
---
## Context

Bod 3 v [06-ai-a-review.md](../../docs/review-ide/06-ai-a-review.md) žádá brány kvality: kontroly (lint, build, testy), jejichž výsledek dostane agent i reviewer. TASK-85 staví první část: uživatel si brány nastaví u repozitáře v Orce a spustí je na pokyn, tlačítkem nebo příkazem `orca gates run`.

- **Co už existovalo:** setup a archive skripty (`runHook`), které se čtou z `orca.yaml` nebo z nastavení repozitáře; `.cmd` runner setup skriptů na Windows (`buildWindowsRunnerScript`); sdílený hostitel procesů `@orca/process-host`; `runWslProcess` pro příkazy v distribuci WSL; řádek repozitáře v datech aplikace; RPC s vyjednanými schopnostmi.
- **Omezení:**
  - Příkaz brány je volný text od uživatele a běží v shellu worktree.
  - Runtime socket je cesta, kterou do Orky volá CLI i agent.
  - Klient a hostitel se aktualizují nezávisle.
  - Spuštění vlastní hostitel, který worktree vlastní, a ztráta spojení není důkaz, že proces skončil (`live` / `unverifiable` / `exited`).
- **Nerozhodnuto jinde:** jestli se brány mají spouštět samy po kroku agenta a jestli se jejich stav má zapisovat do Azure DevOps. Tento tiket nic z toho nestaví ani nepřipravuje.

## Findings

### Model brány

Definice je ve sdíleném kódu (`src/shared/quality-gate-types.ts`).

| Pole | Význam | Meze |
| --- | --- | --- |
| `id` | stabilní označení, odvozené z názvu při založení; přejmenování ho nemění | `[A-Za-z0-9_-]`, 1 až 64 znaků |
| `name` | název pro člověka | 1 až 80 znaků |
| `command` | volný text pro shell | 1 až 4 000 znaků, bez znaku NUL |
| `required` | povinná brána rozhoduje o výsledku, volitelná jen informuje | výchozí povinná |
| `timeoutSeconds` | časový limit jednoho běhu | 5 s až 4 h, výchozí 600 s |

- **Pořadí** bran v seznamu je pořadí spuštění. Repozitář má nejvýš 20 bran.
- **Vadná položka se zahodí, neopravuje.** Seznam se normalizuje při zápisu i při každém čtení, protože řádek mohlo zapsat jiné sestavení.

### Kde definice žije a kdo ji smí psát

- **Úložiště:** pole `qualityGates` na řádku repozitáře v datech Orky na stroji, který repozitář vede, vedle `hookSettings`. Přežije restart a do repozitáře se nic nezapisuje.
- **Zápis jen z okna aplikace**, kanálem `repos:update`. Žádná metoda `qualityGates.*` definici nepíše, schéma `repo.update` pole nezná a zahazuje ho, a CLI nemá příkaz ani přepínač, který by bránu založil nebo změnil.
- **Proč ne přes RPC ani CLI:** runtime socketem volá agent. Kdyby směl bránu definovat, kontroloval by svou práci příkazem, který si sám napsal, a výsledek „prošla“ by nic neříkal. Spustit bránu, kterou nastavil uživatel, agent smí; to je záměr.
- **Proč ne z repozitáře:** soubor v checkoutu mění agent i cizí pull request. Brána načtená z `orca.yaml` by v review worktree spustila kód autora změny.
- **Testy:**
  - Existuje právě pět metod `qualityGates.*` a žádná nepíše.
  - `command` nebo `gates` podstrčené do požadavku na spuštění se ignorují.
  - `repo.update` pole zahodí u volajícího z runtime socketu, z okna i ze spárovaného zařízení.
  - Zdrojáky RPC schémat, CLI a runtime pole `qualityGates` nejmenují.
  - Brány zapsané v `orca.yaml`, `.orca/quality-gates.json` nebo `package.json` ve worktree se nevypíší ani nespustí.
- **Co se nemění:** `repo.update` z runtime socketu dál přijímá `hookSettings`, jak to dělá upstream. Na brány to vliv nemá.

### Model běhu

Každé spuštění jedné brány je jeden záznam.

| Pole | Význam |
| --- | --- |
| `id`, `gateId` | běh a brána |
| `gate` | název, příkaz, povinnost a limit tak, jak běžely; pozdější úprava v nastavení záznam nepřepíše |
| `repoId`, `worktreeId`, `worktreePath` | kde příkaz běžel |
| `startedBy` | kdo běh spustil: `desktop`, `local-cli` nebo `paired-device` s id zařízení |
| `source` | `head` (commit), `clean` (strom bez změn) a `fingerprint` (otisk necommitnutého stavu), přečtené ve chvíli startu příkazu |
| `status` | viz níže |
| `requestedAt`, `startedAt`, `finishedAt` | časy |
| `exitCode`, `error`, `outputTruncated` | návratový kód, důvod nespuštění nebo nepozorovaného konce, příznak zkráceného výstupu |

Hostitel si k záznamu navíc drží konec výstupu (posledních 16 KiB z každého z proudů stdout a stderr) a označení procesu, který příkaz spustil.

- **Kdo spustil** odvozuje hostitel z transportu, ne z parametrů. Volající, kterého transport nepojmenoval, nespustí nic.

| Stav | Kdy | Živost |
| --- | --- | --- |
| `queued`, `running` | čeká ve frontě nebo běží | `live` |
| `passed` | návratový kód 0 | `exited` |
| `failed` | jiný návratový kód | `exited` |
| `timed-out` | vypršel limit; strom procesů je ukončen a kód se neuvádí | `exited` |
| `not-started` | shell příkaz nenašel nebo nespustil (126 a 127, v `cmd.exe` 9009), proces nešel založit, worktree neexistuje, na Windows příkaz začíná `#!` | `exited` |
| `cancelled` | zastavila ho Orca na pokyn, nebo proto, že se ukončovala (důvod v `error`); kód se neuvádí | `exited` |
| `unverifiable` | nikdo, koho se dá zeptat, neví, jestli příkaz běží | `unverifiable` |

### Zastaralý výsledek

Čerstvost se počítá při čtení a neukládá se.

| Čerstvost | Kdy |
| --- | --- |
| `current` | commit, otisk stromu i příkaz brány jsou stejné jako při běhu |
| `stale` | od běhu přibyl commit (`head-changed`), změnil se soubor (`tree-changed`) nebo příkaz brány (`gate-changed`) |
| `unlinked` | workspace nemá git, výsledek se neváže na commit |
| `unknown` | strom nešel přečíst |

- **Otisk:** výpis `git status --porcelain=v1 -z --untracked-files=all` a u každé změněné cesty velikost a čas změny (nejvýš u 2 000 cest). Druhá úprava už změněného souboru výpis nezmění, velikost a čas ano.
- **Ignorované soubory se nepočítají**, takže výstup buildu výsledek nezastará.
- **Git:** `rev-parse --verify HEAD` a `status --porcelain=v1 -z --untracked-files=all` jsou starší než Git 2.25, záložní cesta není potřeba.
- **Opatrně:** stav se čte před startem příkazu. Brána, která sama upraví sledovaný soubor (formátovač), má výsledek hned zastaralý.

### Fronta, zdvojení a zrušení

- **Jedna fronta na worktree.** Brány běží jedna po druhé v pořadí z nastavení, protože build a testy sdílejí jeden adresář. Různé worktrees běží souběžně.
- **Zdvojení:** žádost o bránu, která ve stejném worktree čeká nebo běží, vrátí běžící záznam s `started: false` a nový proces nezaloží.
- **Zrušení:** podle běhu, podle brány nebo všeho ve worktree. Běžící příkaz se ukončí i se svými potomky, čekající se nespustí. Stav je `cancelled`, ne `failed`.

### Ukončení aplikace

- **Kdy:** při řádném ukončení, tedy v desktopové Orce ve `will-quit` (až když už ukončení nemůže zrušit okno) a v `orcad` mezi úklidy při zastavení. Hostitel zastaví všechny své běhy stejnou cestou jako zrušení na pokyn: čekající se nespustí, běžícímu se ukončí celý strom procesů.
- **Záznam:** `cancelled` s textem v `error` „Stopped because Orca quit while the gate was running.“ Do úložiště se zapíše dřív, než ukončení pokračuje. Nová hodnota stavu ani pole nepřibyly, takže starší klient dostane platný záznam a důvod ukáže jako text chyby, stejně jako u vypršeného limitu.
- **Limit:** ukončení čeká na brány nejvýš 5 s. Strom dostane SIGTERM a po 2 s ho hostitel procesů ukončí natvrdo. Běh, jehož konec se do limitu nepotvrdí, zůstane v souboru živý a po dalším startu je `unverifiable`.
- **Po začátku ukončování** hostitel nový běh odmítne chybou.
- **Pád a vynucené ukončení** (SIGKILL, vynucené ukončení v systému) tuto cestu nespustí. Záznam zůstane živý a po startu je `unverifiable`; příkaz může doběhnout bez záznamu výsledku.
- **Ověření:** test služby se skutečným procesem, jeho potomkem a vnukem (macOS, na Linuxu v CI) a e2e test, který Orcu ukončí uprostřed běhu a po startu čte záznam. Windows a WSL ověřené nejsou; tam se ukončení spoléhá na stejnou cestu jako zrušení na pokyn.

### Úložiště běhů

- **Soubor** `quality-gate-runs.json` v datech aplikace na hostiteli, který příkaz spustil, verze 1. Zapisuje se přes dočasný soubor.
- **Dvě sestavení nad stejnými daty:** každé volání soubor před zápisem přečte, takže záznamy druhého sestavení zůstanou.
- **Retence:** 5 dokončených běhů na bránu a worktree, 30 dní, 300 záznamů celkem. Živý záznam starší než 7 dní se zahodí.
- **Nečitelný soubor** se čte jako prázdný, vadný záznam se zahodí.
- **Restart hostitele:** jestli živý příkaz ještě běží, ví jen proces, který ho spustil. Živý záznam jiného procesu se ukáže jako `unverifiable`, v souboru se nepřepisuje a bránu jde spustit znovu.

### Vlastník běhu a SSH

Hostitel, který worktree vlastní, bere brány ze svého nastavení repozitáře, spustí příkaz, přečte stav gitu a drží záznam. Klient se jen ptá.

| Worktree | Kde příkaz běží |
| --- | --- |
| `local` | v tomto procesu Orky |
| WSL na Windows | uvnitř distribuce, která worktree drží |
| `runtime:<env>` (Orca na jiném stroji, tak se obsluhuje i stroj dosažený přes SSH) | klient volá `qualityGates.*` přímo na tom hostiteli; tam je worktree `local` |
| `ssh:<target>` | nikde: tento proces SSH cíl neobsluhuje a vrátí `SshHostNotServedError`, stejně jako Backlog |

- **Hostitel cizí workspace odmítne.** Dotaz na workspace jiného hostitele skončí chybou, příkaz se lokálně nespustí.
- **Ztráta spojení:** běh pokračuje na hostiteli. Klient ukáže poslední známé živé běhy jako `unverifiable`, nikdy jako selhání. `orca gates run` to udělá po pěti dotazech bez odpovědi za sebou a skončí kódem 1 s výsledkem `unverifiable`.
- **Starší hostitel:** kdo brány umí, hlásí schopnost `quality-gates.v1`. Desktop se na ni zeptá dřív, než nabídne spuštění. CLI přeloží `method_not_found` na „This Orca host does not support quality gates yet“.
- **Definice u cizího hostitele:** brány repozitáře, který vede jiný hostitel, se nastavují v Orce na něm. Desktop je ukáže jen ke čtení a umí je spustit.

### Spuštění příkazu

| Hostitel | Jak příkaz startuje |
| --- | --- |
| macOS, Linux | `/bin/bash -c <příkaz>` přes `runProcess`, v kořeni worktree |
| Windows | příkaz se zapíše do souboru `.cmd` v datech aplikace (`buildWindowsRunnerScript`: `call` na každý řádek, konec při první chybě); `runProcess` spustí soubor bez argumentů a po skončení ho smaže |
| WSL | `runWslProcess`: `wsl.exe --exec`, bash, `cd` do worktree uvnitř hosta |

- **Proč ne `runHook`:**
  - Nativní skript startuje přes `spawn(script, { shell })` z `node:child_process`. Na Windows tak volný text jede na řádku `cmd.exe /d /s /c`, což AGENTS.md pro nový kód uvádí mezi signály pro EDR.
  - Nové importy `child_process` hlídá `check:process-host-imports`.
  - Neumí zrušení ani konec výstupu a nese proměnné setup skriptů.
  - Je to soubor upstreamu, který fork pravidelně slučuje.
- **Co je s ním společné:** bash jako interpret na POSIX i ve WSL, blokování dotazů na přihlášení (`promptGuardShellEnv`), tvar runneru na Windows a to, že do hosta WSL projdou jen proměnné blokující dotazy.
- **Windows a EDR:** `runProcess` sestaví `/d /v:off /s /c ""<cesta>.cmd""`. Na řádku je jen cesta k souboru, žádný text od uživatele. Nepoužívá se PowerShell, `-ExecutionPolicy Bypass`, `-EncodedCommand` ani `Add-Type`, a jeden běh brány je jeden proces.
- **Strom procesů:** `terminationBarrier` ukončí při limitu a při zrušení i potomky, protože buildy a testy se větví.
- **Bez obsluhy:** dotaz na přihlášení by visel do časového limitu, proto je vypnutý.
- **`runWslProcess`** dostal dvě nepovinné volby, `signal` a `outputCapture: 'tail'`. Kdo je neposílá, volá ho stejně jako dřív.

### RPC a CLI

- **Metody:** `qualityGates.list`, `run`, `status`, `output`, `cancel`, oprávnění `workspace`. Parametry jsou jen výběr workspace, id bran a id běhu; neznámá pole schéma zahazuje.
- **CLI:** `orca gates list`, `orca gates run [<brána>...]`, `orca gates status`, `orca gates cancel [<brána>...]`. Bez `--worktree` se bere workspace, ve kterém příkaz běží. Brána se jmenuje id nebo jednoznačným názvem. Řádek běhu končí jeho id.
- **`orca gates run` čeká** a u každé brány vypíše výsledek, návratový kód a konec výstupu. Skončí kódem 0, jen když prošly všechny povinné brány; volitelná brána výsledek nemění. Ukončení CLI běh nezastaví.
- **`orca gates run --no-wait`** vypíše běhy hned, jak je hostitel zařadil (id, stav, případně že brána už běžela), a skončí kódem 0. Průběh a výsledek pak ukáže `orca gates status` (u běžící brány i dosavadní dobu).
- **`orca gates cancel`** zastaví čekající i běžící brány workspace, nebo jen jmenované (jedno volání `qualityGates.cancel` na bránu), a vypíše zastavené běhy. Když nic neběželo, řekne to a skončí kódem 0. Běh, jehož konec hostitel do 15 s nepotvrdí, vypíše s upozorněním a odkazem na `status`. (TASK-120; metody RPC ani jejich parametry se nezměnily.)

### Co záznam nese pro pozdější důkaz

[decision-10](./decision-10%20-%20N%C3%A1lezy-AI-v-review-z%C3%A1va%C5%BEnost-d%C5%AFkazy-a-jistota-odvozen%C3%A1-hostitelem-ov%C4%9B%C5%99en%C3%A1-citace-k%C3%B3du-znamen%C3%A1-jen-pravd%C4%9Bpodobn%C3%BD-n%C3%A1lez.md) vyhrazuje jistotu „ověřeno“ důkazu, který Orca sama spustila. Záznam běhu má, co k tomu bude potřeba:

- **commit a čistota stromu** (`source.head`, `source.clean`, `source.fingerprint`), aby šlo říct, že brána běžela nad commitem nálezu a ne nad rozpracovaným stromem,
- **kdo běh spustil** (`startedBy`), aby šlo odlišit běh z okna aplikace od běhu, který si spustil agent,
- **příkaz tak, jak běžel**, stav, návratový kód, časy a id běhu, na které se důkaz odkáže.

Druh důkazu ani pravidlo, kdy běh brány dává „ověřeno“, tento tiket nestaví (TASK-88).

## Decision

Brány kvality jsou seznam příkazů na řádku repozitáře v Orce. Píše je jen uživatel v okně aplikace. Spouští je na pokyn hostitel, který worktree vlastní, a ten také drží záznam běhu s commitem, čistotou stromu a tím, kdo běh spustil.

- **Proč definice u repozitáře v Orce:** platí pro všechny worktrees repozitáře, přežije restart a nedostane se do commitu ani do cizího pull requestu.
- **Proč zápis jen z okna:** výsledek brány má cenu jen tehdy, když příkaz nenapsal ten, koho brána hlídá.
- **Proč běh vlastní hostitel worktree:** jen on má soubory, git a proces. Klient, který by si stav držel sám, by po ztrátě spojení hádal.
- **Proč `unverifiable` místo selhání:** neznámý konec není chyba kódu. Selhání by agenta nebo reviewera poslalo opravovat něco, co se možná nerozbilo.
- **Proč sdílený hostitel procesů a ne `runHook`:** drží pravidla pro Windows z AGENTS.md, umí limit, zrušení celého stromu a konec výstupu, a nezasahuje do souboru upstreamu.
- **Proč fronta na worktree:** dva buildy ve stejném adresáři si navzájem přepisují výstup a výsledek by nešel přičíst jedné bráně.
- **Proč se čerstvost neukládá:** zastarala by s každou úpravou souboru; hostitel ji spočítá z uloženého stavu a ze stavu teď.

## Consequences

- **Brány se samy nespouštějí.** Stav v postranním panelu (TASK-86), spuštění po kroku agenta (TASK-87) a běh brány jako důkaz nálezu (TASK-88) navazují.
- **Repozitář u jiného hostitele** má brány jen ke čtení; nastavit je jde v Orce na tom hostiteli. Zápis na dálku by potřeboval cestu, kterou agent nepoužije, a tu zatím nikdo nerozhodl.
- **Řádné ukončení aplikace běžící příkaz zastaví** i s potomky a záznam říká proč. Po pádu nebo vynuceném ukončení je záznam `unverifiable` a proces může doběhnout bez záznamu výsledku. Převzetí běžícího příkazu novou instancí se nestaví.
- **Zrušení ve WSL** ukončí `wsl.exe`; že skončí i potomci uvnitř hosta, ověřené není.
- **Windows a skutečný vzdálený hostitel** ověřené nejsou. Sestavení spuštění pro Windows a WSL a chování klienta při ztrátě spojení pokrývají testy nad náhradami.
- **Příkaz začínající `#!` na Windows** se nespustí. Záznam je `not-started` s hláškou, že brány na Windows běží přes `cmd.exe` a skript je potřeba zavolat přes jeho interpret. Ve WSL ho bash čte jako komentář.
- **Výsledek brány, která mění soubory,** je hned zastaralý.
- **CLI umí běh zrušit i nečekat** (`gates cancel`, `--no-wait`, TASK-120).
- **Výstup je jen konec,** 16 KiB z každého proudu. Celý log buildu Orca nedrží.
