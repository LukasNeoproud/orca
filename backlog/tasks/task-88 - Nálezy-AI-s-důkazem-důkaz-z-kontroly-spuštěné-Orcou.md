---
id: TASK-88
title: 'Nálezy AI s důkazem: důkaz z běhu nastavené brány'
status: Done
assignee: []
created_date: '2026-11-18T15:17:00Z'
updated_date: '2026-11-24T07:49:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-84
  - TASK-85
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 208000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Nález, který stojí na selhaném buildu, lintu nebo testu, má nést výsledek běhu, který provedla Orca, ne text, který agent opsal. Jen takový nález smí mít jistotu „ověřeno důkazem“; recenzent ho může publikovat bez vlastního ověřování.

### Rozsah

- Nový druh důkazu v modelu nálezu z TASK-84 (`src/shared/review-finding.ts`): odkaz na záznam běhu brány z TASK-85. Druh navrhni tak, aby TASK-122 mohl doplnit běh jednorázového příkazu.
- Ověření důkazu v hlavním procesu při ukládání a při zobrazení draftu: běh existuje, patří k review worktree pull requestu (`src/main/azure-devops/review/azure-devops-review-worktree-registry.ts`), commit sedí s commitem draftu, strom byl čistý a výsledek odpovídá tvrzení.
- Nástroje agenta a prompt: `src/shared/azure-devops-review-tools.ts`, `src/shared/azure-devops-review-prompt.ts` a texty hloubky v `src/shared/azure-devops-review-options.ts` (`build`, `build-and-test`) vedou agenta k tomu, aby build a testy pouštěl přes Orku.
- Draft předává rendereru výsledek ověření důkazu a důvod, proč jistotu nedal, jako data; zobrazení dodá TASK-159.

### Mimo rozsah

- Karta draftu: zobrazení důkazu, otevření výstupu a průchod ve skrytém okně: TASK-159.
- Jednorázový příkaz zadaný agentem přes `orca gates`, zapamatovaná hloubka review na hostiteli a odmítnutí spuštění při statickém review: TASK-122.
- Důkazy z language serveru (M3), z emulátoru (M8) a z kontraktu jiné platformy (M7).
- Rozbor výstupu testů na jednotlivé případy.
- Publikace důkazu do Azure DevOps.

### Omezení

- V review worktree běží kód autora pull requestu. Prompt a nástroje vedou ke spuštění jen při hloubce, kterou uživatel zvolil; `static` nespouští nic. Vynucení na hostiteli dodá TASK-122.
- SSH review worktree: běh i jeho záznam jsou na vzdáleném hostiteli.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Review agent spustí v review worktree nastavenou bránu přes Orku a dostane identifikátor běhu, návratový kód a konec výstupu
- [x] #2 Draft s důkazem odkazujícím na běh brány nastavené uživatelem, který patří k review worktree tohoto pull requestu, proběhl na commitu draftu s čistým stromem a selhal, má jistotu ověřeno důkazem
- [x] #3 Odkaz na neexistující běh, na běh z jiného commitu nebo worktree, nebo na běh, který prošel, jistotu ověřeno důkazem nedá a karta řekne proč
- [x] #4 Po přesunu draftu na novější iteraci je důkaz ze staršího commitu označený jako zastaralý a jistota klesne
- [x] #5 Výstup brány se agentovi i v rozhraní předává jako data; pokyny v něm nic nespustí
- [x] #6 Testy pokrývají všechna pravidla ověření a nástroj agenta; draft nese výsledek ověření a důvod pro renderer
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rozděleno 2026-11-19 podle pravidla velikosti: TASK-122 převzal jednorázový příkaz zadaný agentem přes orca gates, zapamatovanou hloubku review na hostiteli a odmítnutí spuštění při statickém review.

Rozděleno 2026-11-20 podle pravidla velikosti: kartu draftu s důkazem, otevření výstupu a průchod ve skrytém okně převzal TASK-159.

Plán workera (2026-11-20): (1) src/shared/review-finding.ts: druh důkazu command-run se zdrojem quality-gate a id běhu, shrnutí běhu a nové důvody v kontrole důkazu, potvrzený běh dokazuje verified. (2) hlavní proces: čistá pravidla v azure-devops-review-gate-run-evidence.ts (běh existuje, patří k review worktree PR, brána je dál v řádku repozitáře se stejným příkazem, commit = commit draftu = poslední iterace, čistý strom, status failed), napojení do describeAzureDevOpsReviewDraftFindings přes hostitele review; služba bran dostane findRun. (3) nástroje agenta ado_list_gates, ado_run_gate, ado_get_gate_run nad stávajícími qualityGates.*; prompt a texty hloubky. (4) schopnost azure-devops-review.gate-run-evidence.v1, testy kompatibility oběma směry, dokumentace a decision-10.

Stav (worker): hotový model důkazu (review-command-run-evidence.ts), pravidla ověření v hlavním procesu (azure-devops-review-gate-run-evidence.ts) napojená do popisu draftů, findRun ve službě bran, nástroje ado_list_gates/ado_run_gate/ado_get_gate_run, prompt a texty hloubky, schopnost a testy včetně kompatibility. Zbývá: formát, lint, brány kvality kódu, širší běh testů, dokumentace a decision-10, odškrtnutí kritérií.

Hotovo (worker, 2026-11-20). Důkaz command-run (zdroj quality-gate, id běhu) v src/shared/review-command-run-evidence.ts; potvrzený dokazuje verified. Ověření v hlavním procesu: azure-devops-review-gate-run-evidence.ts, pravidla a důvody v decision-10 (oddíl Ověření běhu brány). Běh, který nic nedokazuje, je vždy unchecked s důvodem, nikdy refuted (i když prošel): starší klient popisuje refuted textem o citátu. Přísnější než tiket: commit draftu musí být commitem poslední iterace a brána musí být dál v řádku repozitáře se stejným příkazem. Nástroje agenta ado_list_gates, ado_run_gate, ado_get_gate_run nad stávajícími qualityGates.list/run/output, bez nové metody RPC; katalog parametrů beze změny. Schopnost azure-devops-review.gate-run-evidence.v1. Renderer jsem neměnil: karta do TASK-159 ukáže u důkazu druh command-run a u potvrzeného běhu stávající text „In the file“. Ověření: pnpm tc, oxlint, check:code-quality:changed, audit:anti-slop bez nálezu; čistý běh (Node 24.21.0, Bun 1.4.2) nad src/shared, src/cli, src/main/azure-devops, src/main/quality-gates, src/main/runtime/rpc a testy rendereru a mobilu k review: 2900 souborů prošlo, selhal jen známý host-operation-ownership (androidAppRun, mimo Review IDE).

Otevřené otázky na uživatele (položeny 2026-11-20): běh, který prošel, dává nejisté místo rozporné; úprava příkazu brány zneplatní starší důkazy; ověření nerozliší selhání způsobené PR od selhání, které je i v cílové větvi, a nevidí stav skrytý gitu (ignorované soubory, skip-worktree). Do odpovědi platí stav z tohoto tiketu.

Rozhodnutí uživatele 2026-11-24: decision-15 (stav z tohoto tiketu platí).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Nález AI může nést důkaz command-run: odkaz na běh brány, který provedla Orca. Agent pošle jen id běhu; hostitel ze svých záznamů ověří, že běh patří k review worktree pull requestu, brána je v nastavení repozitáře se stejným příkazem, běh proběhl na commitu draftu, který je poslední iterací, strom byl čistý a příkaz selhal. Jen pak má nález jistotu ověřeno důkazem; jinak draft nese důvod. Review agent má nástroje ado_list_gates, ado_run_gate a ado_get_gate_run a prompt ho vede pouštět build a testy přes Orku podle zvolené hloubky. Schopnost azure-devops-review.gate-run-evidence.v1; kompatibilita se starším klientem i hostitelem má test. Karta draftu je TASK-159.
<!-- SECTION:FINAL_SUMMARY:END -->
