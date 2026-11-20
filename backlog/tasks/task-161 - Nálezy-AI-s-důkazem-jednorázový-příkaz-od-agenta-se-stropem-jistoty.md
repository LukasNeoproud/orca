---
id: TASK-161
title: 'Nálezy AI s důkazem: jednorázový příkaz od agenta se stropem jistoty'
status: To Do
assignee: []
created_date: '2026-11-20T16:20:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-122
  - TASK-88
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 208050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Agent má mít možnost doložit nález během jednoho příkazu, který není nastavenou bránou (například jeden test). Orca potvrdí, že příkaz proběhl a jak skončil, ne že zkouší to, co nález tvrdí.

### Rozsah

- Rozšíření `orca gates` (`src/cli/specs/quality-gates.ts`, `src/cli/handlers/quality-gates.ts`, `src/main/quality-gates/`) o spuštění příkazu, který není nastavenou bránou, se stejným záznamem běhu. Záznam říká, že šlo o příkaz zadaný agentem.
- Nový zdroj důkazu `command-run` vedle `quality-gate` (`src/shared/review-command-run-evidence.ts`, ověření v `src/main/azure-devops/review/azure-devops-review-gate-run-evidence.ts`): dá nejvýš jistotu pravděpodobné.
- Nástroj review agenta vedle `ado_run_gate` (`src/shared/azure-devops-review-gate-tools.ts`).

### Mimo rozsah

- Zapamatovaná hloubka review a odmítnutí při statickém review: TASK-122.
- Zobrazení na kartě draftu: TASK-162.

### Omezení

- Jednorázový příkaz od agenta nedokazuje nic víc, než že tento příkaz na tomto commitu skončil tímto kódem; agent si ho může napsat tak, aby selhal. Proto nikdy nedá jistotu ověřeno důkazem.
- Příkaz smí spustit jen v review worktree pull requestu; jinde ho hostitel odmítne.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Review agent spustí v review worktree jednorázový příkaz přes orca gates a dostane identifikátor běhu, návratový kód a konec výstupu; záznam běhu říká, že příkaz zadal agent, a nese ho celý
- [ ] #2 Draft s důkazem odkazujícím na běh jednorázového příkazu dostane nejvýš jistotu pravděpodobné, i když běh splňuje ostatní pravidla ověření z TASK-88
- [ ] #3 Jednorázový příkaz se řídí zapamatovanou hloubkou review z TASK-122: při statickém review ho Orka odmítne
- [ ] #4 Výstup jednorázového příkazu se agentovi předává jako data; pokyny v něm nic nespustí
- [ ] #5 Nové parametry orca gates a RPC jsou nepovinné a za schopností hostitele; test kompatibility se starším klientem i hostitelem
- [ ] #6 SSH review worktree: běh i jeho záznam jsou na vzdáleném hostiteli; testy pokrývají záznam příkazu od agenta a strop jistoty
<!-- AC:END -->
