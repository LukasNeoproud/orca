---
id: TASK-85
title: 'Brány kvality: definice v nastavení repozitáře a spuštění na pokyn'
status: Done
assignee: []
created_date: '2026-11-18T15:17:00Z'
updated_date: '2026-11-19T05:25:00Z'
labels:
  - review-ide
  - effort-xhigh
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Orca dnes neví, jak v repozitáři spustit lint, build nebo testy. Uživatel si je nastaví jako brány kvality a Orca je umí na pokyn spustit a zapamatovat si výsledek. Na tom stojí zpětná vazba agentovi, důkazy u nálezů AI a stav u pull requestu.

### Rozsah

- Nový subsystém ve vlastních adresářích: typy ve `src/shared/` (například `quality-gate-types.ts`), `src/main/quality-gates/`, rozhraní v `src/renderer/src/components/quality-gates/`. Do existujících souborů jen registrace.
- Definice brány: název, příkaz, povinná nebo volitelná, časový limit. Ukládá se do nastavení repozitáře v Orce (`Repo` v `src/shared/repo-types.ts`, zápis přes `repos:update` v `src/main/ipc/repos/repo-update-handler.ts`). Sekce v `src/renderer/src/components/settings/RepositoryPane.tsx` vedle `RepositoryHooksSection.tsx`.
- Spuštění příkazu ve worktree už existuje dvakrát: `runAutomationPrecheck` v `src/main/automations/precheck-runner.ts` (lokálně i přes SSH, limit, oříznutý výstup) a `runHook` v `src/main/hooks.ts` (setup skripty). Jedno z nich zobecni, třetí runner nestav.
- Záznam běhu: brána, worktree, commit, čistota stromu, výsledek, návratový kód, konec výstupu, časy. Úložiště v hlavním procesu hostitele, který worktree vlastní; přežije restart a staré záznamy promazává.
- RPC `qualityGates.*` (seznam, spuštění, stav, výstup, zrušení) v `src/main/runtime/rpc/methods/` a CLI `orca gates list|run|status` (`src/cli/specs/`, `src/cli/handlers/`) s výstupem `--json` pro agenty.

### Mimo rozsah

- Stav bran u workspace v sidebaru a panel výsledků: navazující tiket.
- Spuštění po kroku agenta a posílání nálezů agentovi: navazující tiket.
- Rozbor výstupu na nálezy se souborem a řádkem a srozumitelné chyby Gradle, xcodebuild a dotnet build (M3); diagnostika language serveru (M3), pravidla vrstev (M4), vlastní kontroly a SARIF (M5).

### Omezení

- Příkazy zadává jen uživatel v Orce. Kdyby se četly z repozitáře, určil by autor pull requestu, co se spustí na počítači recenzenta.
- Windows: podřízené procesy podle AGENTS.md (`@orca/process-host`, žádné `shell: true`, žádné `cmd.exe /c` s volným textem). `precheck-runner.ts` volá `spawn` se `shell: true` přímo; než ten vzor převezmeš, ověř, co dovolí `check:code-quality:changed`.
- Hostitel vlastní vše, co se týká spuštění: u SSH a WSL worktree běží příkaz i úložiště tam. Slovník výsledků při ztrátě spojení je `live`, `unverifiable`, `exited`.
- Nová metoda RPC musí být pro starší protějšek rozpoznatelná jako nepodporovaná, ne jako chyba.
- Výstup příkazu je nedůvěryhodný text; zobrazuj ho jako text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 V nastavení repozitáře jde přidat, upravit, seřadit a odebrat bránu (název, příkaz, povinná nebo volitelná, časový limit); nastavení přežije restart a neukládá se do repozitáře
- [x] #2 Tlačítko Spustit v nastavení a příkaz orca gates run spustí příkazy v kořeni zvoleného worktree na hostiteli, který ho vlastní, a u každé brány vrátí výsledek (prošla, selhala, vypršel limit, nešla spustit), návratový kód a konec výstupu
- [x] #3 Záznam běhu nese commit a to, zda byl pracovní strom čistý; po dalším commitu nebo úpravě souboru stav hlásí, že výsledek je zastaralý
- [x] #4 Běžící bránu jde zrušit a druhé spuštění téže brány ve stejném worktree se nezdvojí
- [x] #5 SSH worktree spouští brány na vzdáleném hostiteli; ztráta spojení během běhu dá výsledek unverifiable, ne selhání; starší vzdálený hostitel vrátí nepodporováno
- [x] #6 Folder workspace bez gitu brány spustit umí, jen bez vazby na commit
- [x] #7 Na Windows se příkaz spouští podle pravidel AGENTS.md pro podřízené procesy; sestavení spuštění pro macOS, Linux a Windows pokrývají testy
- [x] #8 Příkazy bran se nikdy nečtou z repozitáře ani z orca.yaml; pokrývá to test
- [x] #9 Záznam rozhodnutí popisuje model brány a běhu, úložiště a vlastníka běhu u SSH; docs/review-ide/06-ai-a-review.md bod 3 uvádí stav po tomto tiketu
- [x] #10 Runner, úložiště, RPC a CLI mají testy; nastavení je ověřené ve skrytém okně na smyšleném repozitáři
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker 2026-11-19):
- Vlastník: hostitel, který worktree vlastní. SSH hostitele obsluhuje jeho orcad jako runtime:<env>, takže klient volá qualityGates.* přímo tam; lokální runtime worktree cizího hostitele odmítne (stejně jako backlog-target).
- Model: src/shared/quality-gate-types.ts (definice, běh, zdrojový stav, čerstvost). Definice v Repo.qualityGates, zápis jen přes IPC repos:update; schéma RPC repo.update pole nezná, runtime socket ho tedy zapsat nemůže.
- Runner: tenká vrstva nad @orca/process-host runProcess (strom procesů, limit, AbortSignal, konec výstupu) a nad runWslProcess jako runHook; na Windows příkaz v .cmd souboru jako setup runner, žádný volný text za cmd.exe /c.
- Úložiště běhů: JSON v userData hostitele, promazávání, běhy přerušené restartem jako unverifiable.
- RPC qualityGates.list|run|status|output|cancel + schopnost quality-gates.v1; CLI orca gates list|run|status.
- Rozhraní: sekce v RepositoryPane, e2e ve skrytém okně.
Pořadí: model a úložiště, runner, RPC a CLI, rozhraní.

Hotovo a otestováno (2026-11-19): src/shared/quality-gate-types.ts (definice, běh, zdrojový stav, čerstvost), src/main/quality-gates/ run-store, source-state, launch, command-run, service (fronta na worktree, zdvojení, zrušení, unverifiable po restartu), target; Repo.qualityGates a zápis přes repos:update; wsl-runner umí signal a konec výstupu. Zbývá: RPC + schopnost + katalog, CLI, rozhraní, e2e, záznam rozhodnutí, dokumentace.

Hotovo a otestováno (2026-11-19, 2. část): quality-gate-host (jedna služba na proces), RPC qualityGates.list|run|status|output|cancel + schopnost quality-gates.v1 + katalog + kontraktní test; bezpečnostní testy (žádná metoda nezapisuje definici, repo.update zahodí qualityGates pro všechny druhy volajících, nic se nečte z orca.yaml ani z worktree); CLI orca gates list|run|status (specs/quality-gates, handlers/quality-gates, quality-gate-format, quality-gate-run-wait) s testy. Zbývá: rozhraní v nastavení repozitáře, e2e ve skrytém okně, záznam rozhodnutí, docs/review-ide/06 bod 3.

Průběh 3: nastavení v rozhraní hotové (components/quality-gates, registrace v RepositoryPane a repository-search, 64 klíčů qualityGates.* v šesti jazycích). Ověřeno ve skrytém okně: tests/e2e/quality-gates-settings.spec.ts (electron-headless, 1 worker, izolovaný HOME, 1 passed) nad smyšleným repozitářem a složkou bez gitu: přidání, validace, řazení, úprava, odebrání, spuštění, zdvojení, zrušení, výstup, zastaralý výsledek po úpravě souboru a po commitu, restart. Snímky v ~/.cache/orca-review-ide/task-85/01..06-*.png. Zbývá: záznam rozhodnutí, docs/review-ide/06 bod 3, závěrečné brány.

Průběh 4 (dokončeno workerem 2026-11-19, čeká na ověření koordinátorem): decision-11 (model brány a běhu, úložiště, vlastník běhu, volba spouštění, co záznam nese pro pozdější důkaz), docs/review-ide/06-ai-a-review.md bod 3 se stavem po TASK-85. Doplněno: test spuštění pro Windows (.cmd runner) a WSL nad náhradou hostitele procesů (quality-gate-command-run-windows-wsl.test.ts), registrace jmenného prostoru qualityGates v host-operation-ownership.ts, skutečné volání orca gates run a gates status ze sestaveného CLI proti e2e aplikaci (startedBy local-cli). Brány: pnpm tc 0, oxlint 0 (58 souborů), check:code-quality:changed 0 nálezů, check:dead-classes 0, check:max-lines-ratchet OK, check:process-host-imports ok, katalog RPC bez rozdílu, 271 souborů testů (1 pád mimo tiket: host-operation-ownership neklasifikuje androidAppRun.*, známé z TASK-112), e2e 1 passed. Neověřeno na Windows ani proti skutečnému vzdálenému hostiteli. Otevřené: zápis definic pro repozitář u jiného hostitele (otázka pro uživatele), gates cancel a --no-wait v CLI, ukončení běžících příkazů při konci aplikace.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Orca umí brány kvality: v nastavení repozitáře jde přidat, upravit, seřadit a odebrat bránu (název, příkaz, povinná nebo volitelná, časový limit) a spustit je ve zvoleném workspace tlačítkem nebo příkazem orca gates list, run a status s výstupem --json. Definice se ukládají jen do nastavení repozitáře v Orce; z repozitáře ani z orca.yaml se nečtou a ze socketu runtime, z CLI ani ze spárovaného zařízení je nejde zapsat ani podstrčit (pět metod qualityGates.* jen čte, spouští a ruší; repo.update pole zahodí). Běh patří hostiteli, který worktree vlastní: jeho záznam nese bránu, workspace, commit, čistotu stromu, otisk stavu, kdo běh spustil, příkaz tak, jak běžel, výsledek, návratový kód, konec výstupu a časy, přežije restart a staré záznamy se promazávají. Po dalším commitu nebo úpravě souboru stav hlásí zastaralý výsledek; složka bez gitu brány spustí bez vazby na commit. Běh jde zrušit včetně potomků a druhé spuštění téže brány se nezdvojí. Příkaz běží přes runProcess, na Windows ze souboru .cmd ve tvaru setup runneru a ve WSL přes wsl.exe --exec; runHook se nepoužil, protože neumí zrušení a na Windows posílá volný text na řádek cmd.exe. Schopnost quality-gates.v1; starší hostitel odpoví method_not_found a klient to čte jako nepodporováno; ztráta spojení dá unverifiable. Model, úložiště a vlastníka běhu popisuje decision-11. Ověřeno testy runneru, úložiště, služby, RPC, CLI a klienta a e2e ve skrytém okně na smyšleném repozitáři včetně restartu. Neověřeno na Windows ani proti skutečnému SSH hostiteli, jen testy nad náhradami. Známé: ukončení aplikace běžící příkaz nezastaví a jeho záznam je po startu unverifiable (TASK-119); CLI nemá gates cancel a --no-wait (TASK-120); repozitář jiného hostitele má brány v desktopu jen ke čtení a spuštění; stav v nastavení se po změně souboru neobnoví sám.
<!-- SECTION:FINAL_SUMMARY:END -->
