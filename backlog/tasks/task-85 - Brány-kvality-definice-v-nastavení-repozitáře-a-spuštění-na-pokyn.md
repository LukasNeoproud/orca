---
id: TASK-85
title: 'Brány kvality: definice v nastavení repozitáře a spuštění na pokyn'
status: To Do
assignee: []
created_date: '2026-11-18T15:17:00Z'
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
- [ ] #1 V nastavení repozitáře jde přidat, upravit, seřadit a odebrat bránu (název, příkaz, povinná nebo volitelná, časový limit); nastavení přežije restart a neukládá se do repozitáře
- [ ] #2 Tlačítko Spustit v nastavení a příkaz orca gates run spustí příkazy v kořeni zvoleného worktree na hostiteli, který ho vlastní, a u každé brány vrátí výsledek (prošla, selhala, vypršel limit, nešla spustit), návratový kód a konec výstupu
- [ ] #3 Záznam běhu nese commit a to, zda byl pracovní strom čistý; po dalším commitu nebo úpravě souboru stav hlásí, že výsledek je zastaralý
- [ ] #4 Běžící bránu jde zrušit a druhé spuštění téže brány ve stejném worktree se nezdvojí
- [ ] #5 SSH worktree spouští brány na vzdáleném hostiteli; ztráta spojení během běhu dá výsledek unverifiable, ne selhání; starší vzdálený hostitel vrátí nepodporováno
- [ ] #6 Folder workspace bez gitu brány spustit umí, jen bez vazby na commit
- [ ] #7 Na Windows se příkaz spouští podle pravidel AGENTS.md pro podřízené procesy; sestavení spuštění pro macOS, Linux a Windows pokrývají testy
- [ ] #8 Příkazy bran se nikdy nečtou z repozitáře ani z orca.yaml; pokrývá to test
- [ ] #9 Záznam rozhodnutí popisuje model brány a běhu, úložiště a vlastníka běhu u SSH; docs/review-ide/06-ai-a-review.md bod 3 uvádí stav po tomto tiketu
- [ ] #10 Runner, úložiště, RPC a CLI mají testy; nastavení je ověřené ve skrytém okně na smyšleném repozitáři
<!-- AC:END -->
