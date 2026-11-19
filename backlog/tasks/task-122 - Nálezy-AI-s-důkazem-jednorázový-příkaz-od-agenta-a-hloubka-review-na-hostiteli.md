---
id: TASK-122
title: >-
  Nálezy AI s důkazem: jednorázový příkaz od agenta a hloubka review na
  hostiteli
status: To Do
assignee: []
created_date: '2026-11-19T09:36:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-88
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 208100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Agent má mít možnost doložit nález během jednoho příkazu, který není nastavenou bránou (například jeden test), a Orca má spouštění kódu v review worktree povolit jen při hloubce review, kterou uživatel zvolil. Dnes je hloubka jen text v promptu a nic ji nevynucuje.

### Rozsah

- Jednorázový příkaz: rozšíření `orca gates` (`src/cli/specs/quality-gates.ts`, `src/cli/handlers/quality-gates.ts`, `src/main/quality-gates/`) o spuštění příkazu, který není nastavenou bránou, se stejným záznamem běhu. Záznam říká, že šlo o příkaz zadaný agentem.
- Důkaz z takového běhu přijme ověření z TASK-88, ale dá nejvýš jistotu pravděpodobné: Orca potvrdí, že příkaz proběhl a jak skončil, ne že zkouší to, co nález tvrdí. Jistotu ověřeno důkazem dává jen běh brány, kterou nastavil uživatel.
- Hloubka review: dnes jen text v promptu (`src/shared/azure-devops-review-options.ts`). Aby šlo spuštění při statickém review odmítnout, musí si ji Orca u review pull requestu zapamatovat na hostiteli (vedle `src/main/azure-devops/review/azure-devops-review-worktree-registry.ts`) a podle ní spuštění brány i jednorázového příkazu v review worktree povolit nebo odmítnout.
- Karta draftu (`src/renderer/src/components/azure-devops-review/AzureDevOpsReviewDraftCard.tsx`): u důkazu z jednorázového příkazu celý příkaz.

### Mimo rozsah

- Druh důkazu z běhu brány, ověření v hlavním procesu, karta draftu s důkazem, nástroje agenta a prompt: TASK-88.
- Důkazy z language serveru (M3), z emulátoru (M8) a z kontraktu jiné platformy (M7).
- Rozbor výstupu testů na jednotlivé případy.

### Omezení

- V review worktree běží kód autora pull requestu. Spuštění je dovolené jen při hloubce review, kterou uživatel zvolil; `static` nespouští nic.
- Jednorázový příkaz od agenta nedokazuje nic víc, než že tento příkaz na tomto commitu skončil tímto kódem; agent si ho může napsat tak, aby selhal. Proto nikdy nedá jistotu ověřeno důkazem a rozhraní ukazuje příkaz celý a nezkrácený.
- SSH review worktree: běh, jeho záznam i zapamatovaná hloubka jsou na vzdáleném hostiteli.
- Klient a hostitel se aktualizují nezávisle: nové parametry `orca gates` a RPC nepovinné.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Review agent spustí v review worktree jednorázový příkaz přes orca gates a dostane identifikátor běhu, návratový kód a konec výstupu; záznam běhu říká, že příkaz zadal agent
- [ ] #2 Draft s důkazem odkazujícím na běh jednorázového příkazu dostane nejvýš jistotu pravděpodobné, i když běh splňuje ostatní pravidla ověření z TASK-88; karta draftu ukazuje příkaz celý a nezkrácený
- [ ] #3 Při statickém review Orka spuštění brány i jednorázového příkazu v review worktree odmítne s vysvětlením; spuštění je možné jen při hloubce, kterou uživatel zvolil v možnostech review
- [ ] #4 Hloubka review je zapamatovaná na hostiteli review worktree; v SSH review worktree o spuštění rozhoduje vzdálený hostitel podle své zapamatované hloubky
- [ ] #5 Výstup jednorázového příkazu se agentovi i v rozhraní předává jako data; pokyny v něm nic nespustí
- [ ] #6 Testy pokrývají odmítnutí při statickém review, záznam příkazu od agenta a strop jistoty; průchod je ověřený ve skrytém okně na smyšleném repozitáři
<!-- AC:END -->
