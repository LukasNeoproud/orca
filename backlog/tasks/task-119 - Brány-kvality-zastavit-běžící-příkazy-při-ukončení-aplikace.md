---
id: TASK-119
title: 'Brány kvality: zastavit běžící příkazy při ukončení aplikace'
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
type: bug
ordinal: 200700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Po TASK-85 ukončení aplikace běžící příkaz brány nezastaví: dlouhý build běží dál bez dozoru a jeho záznam je po startu neověřitelný. Brány se spouštějí na pokyn a výsledek bez záznamu nemá cenu, proto se běh při řádném ukončení zastaví.

### Rozsah

- `src/main/quality-gates/quality-gate-service.ts` a `quality-gate-command-run.ts`: zrušení všech běhů při ukončení aplikace stejnou cestou jako zrušení na pokyn (celý strom procesů) a zápis výsledku do úložiště dřív, než proces skončí.
- Napojení na existující úklid při ukončení hlavního procesu; najdi, kde ho registrují jiné služby.
- `quality-gate-launch.ts`: na Windows vlastní hláška pro příkaz začínající `#!` místo textu určeného pro setup skripty.

### Mimo rozsah

- Převzetí běžícího příkazu novou instancí aplikace.
- Ověření na skutečném Windows a ve WSL; tam jen testy sestavení spuštění.

### Omezení

- Ukončení aplikace nesmí čekat déle než krátký pevný limit; co se do něj nestihne, zůstane unverifiable.
- Podřízené procesy podle AGENTS.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Po ukončení aplikace neběží žádný proces spuštěný bránou ani jeho potomek; pokrývá to test služby se skutečným procesem na macOS a Linuxu
- [ ] #2 Záznam takového běhu má po dalším startu výsledek zastaveno s důvodem ukončení aplikace, ne unverifiable
- [ ] #3 Běh, o kterém hostitel po pádu aplikace neví, zůstává unverifiable
- [ ] #4 Na Windows dostane příkaz začínající #! hlášku určenou pro brány; sestavení spuštění pokrývá test
- [ ] #5 decision-11 uvádí chování při ukončení aplikace
<!-- AC:END -->
