---
id: TASK-120
title: 'Brány kvality v CLI: orca gates cancel a spuštění bez čekání'
status: Done
assignee: []
created_date: '2026-11-19T05:26:00Z'
updated_date: '2026-11-19T05:43:00Z'
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
- [x] #1 orca gates cancel zastaví běžící brány workspace nebo jmenovanou bránu a vypíše, co zastavil; bez běžící brány skončí úspěšně s hláškou
- [x] #2 orca gates run --no-wait vrátí hned identifikátory běhů; orca gates status pak ukáže průběh a výsledek
- [x] #3 Oba příkazy mají výstup --json a nápovědu; nový přepínač je zapsaný v src/shared/cli-argument-boundary.ts
- [x] #4 Starší hostitel bez bran vrátí srozumitelné nepodporováno; CLI má testy a nepřibyla žádná metoda RPC
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: (1) spec+handler 'gates cancel [<gate>...] [--run <id>]' nad existující qualityGates.cancel, jména bran přes stejné rozlišení jako run, výpis zastavených běhů / hláška bez běžící brány s kódem 0; (2) 'gates run --no-wait' vrátí výsledek qualityGates.run hned (id běhů, stav), 'gates status' doplní id běhu, aby šel spárovat; (3) 'no-wait' do CLI_BOOLEAN_FLAGS, kořenová nápověda a 06-ai-a-review.md bod 3 + decision-11; (4) testy CLI (index-quality-gates), parse testu přepínače; (5) e2e proti aplikaci ve skrytém okně.

Hotovo: CLI gates cancel, run --no-wait, id běhu na řádku a doba běžící brány ve status, no-wait v cli-argument-boundary, kořenová nápověda, docs 06 bod 3 a decision-11, unit testy (src/cli/index-quality-gates-cancel.test.ts). Zbývá: e2e proti aplikaci ve skrytém okně.

Ověřeno: pnpm tc 0; oxlint 0; check:code-quality:changed 0 nálezů; testy src/cli (175 souborů, 1995 passed) + cli-launch-redirect + cli-argument-boundary + RPC quality-gates (guard test beze změny prochází); e2e tests/e2e/quality-gates-cli-cancel.spec.ts a quality-gates-settings.spec.ts (electron-headless, 1 worker, izolovaný HOME) 2 passed; snímek ~/.cache/orca-review-ide/task-120/01-cancelled-from-cli.png; po běhu žádný proces sleep ani e2e aplikace.
<!-- SECTION:NOTES:END -->
