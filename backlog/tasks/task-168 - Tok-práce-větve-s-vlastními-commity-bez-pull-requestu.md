---
id: TASK-168
title: 'Tok práce: větve s vlastními commity bez pull requestu'
status: To Do
assignee: []
created_date: '2026-11-24T09:05:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-9
dependencies:
  - TASK-166
documentation:
  - docs/review-ide/10-tok-prace.md
priority: high
type: feature
ordinal: 152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Uživatel zapomíná z větve založit pull request. Hostitel, který repozitář vlastní, má o každém workspace říct, jestli jeho větev nese vlastní commity proti základní větvi, kdy vznikl poslední a jestli je větev odeslaná.

### Rozsah

- Fakta z gitu na hostiteli pro větve, které mají v Orce workspace; základní větev podle toho, co Orca u workspace už zná. Metoda runtime za novou schopností.
- Spojení s tím, co Orca o pull requestu větve ví (`linkedPR`, `linkedGitLabMR`, `hosted-review-branch-cache.ts`, seznam Azure DevOps).

### Mimo rozsah

- Větve bez workspace v Orce.
- Založení pull requestu; přehled jen otevře stávající cestu.

### Omezení

- Git 2.25 jako základ, příkazy přes stávající spouštěč gitu hostitele a `GitCapabilityCache` tam, kde je novější volba.
- Žádné procházení všech refů: jeden omezený dotaz na workspace.
- Primární workspace na základní větvi a folder workspace bez gitu nejsou jednotka práce.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pro workspace s větví, která má vlastní commity proti základní větvi a žádný pull request, hostitel vrátí počet commitů, čas posledního a jestli je větev odeslaná
- [ ] #2 Větev s otevřeným nebo dokončeným pull requestem, primární workspace na základní větvi a folder workspace bez gitu se jako bez pull requestu nehlásí
- [ ] #3 SSH worktree: fakta zjišťuje vzdálený hostitel; při ztrátě spojení jsou neznámá
- [ ] #4 Metoda je za novou schopností; starší klient i hostitel fungují dál a test to dokládá
- [ ] #5 Testy běží nad skutečným gitem ve smyšleném repozitáři včetně větve po rebase a větve sloučené squash merge
<!-- AC:END -->
