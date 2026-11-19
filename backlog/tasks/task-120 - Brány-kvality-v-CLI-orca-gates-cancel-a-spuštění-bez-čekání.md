---
id: TASK-120
title: 'Brány kvality v CLI: orca gates cancel a spuštění bez čekání'
status: To Do
assignee: []
created_date: '2026-11-19T05:26:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies:
  - TASK-85
priority: medium
type: feature
ordinal: 200800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Agent dnes bránu z příkazové řádky spustí a čeká na ni; nemůže ji zastavit ani pustit dlouhý build a mezitím pracovat. Metoda `qualityGates.cancel` na hostiteli už je.

### Rozsah

- `src/cli/specs/quality-gates.ts`, `src/cli/handlers/quality-gates.ts`, `src/cli/quality-gate-run-wait.ts`, `src/cli/quality-gate-format.ts` a jejich testy.

### Mimo rozsah

- Jakákoli změna hostitele nebo parametrů RPC.
- Definice nebo úprava brány z CLI: záměrně neexistuje (decision-11) a test v `src/main/runtime/rpc/methods/quality-gates.test.ts` to hlídá.

### Omezení

- Ukončení CLI běh nezastaví; to zůstává.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 orca gates cancel zastaví běžící brány workspace nebo jmenovanou bránu a vypíše, co zastavil; bez běžící brány skončí úspěšně s hláškou
- [ ] #2 orca gates run --no-wait vrátí hned identifikátory běhů; orca gates status pak ukáže průběh a výsledek
- [ ] #3 Oba příkazy mají výstup --json a nápovědu; nový přepínač je zapsaný v src/shared/cli-argument-boundary.ts
- [ ] #4 Starší hostitel bez bran vrátí srozumitelné nepodporováno; CLI má testy a nepřibyla žádná metoda RPC
<!-- AC:END -->
