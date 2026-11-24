---
id: TASK-171
title: 'Tok práce: skládání jednotek práce na hostiteli a metoda pro klienty'
status: To Do
assignee: []
created_date: '2026-11-24T09:05:00Z'
updated_date: '2026-11-24T10:38:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-9
dependencies:
  - TASK-167
  - TASK-168
  - TASK-169
  - TASK-170
documentation:
  - docs/review-ide/10-tok-prace.md
priority: high
type: feature
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Fakta z TASK-167 až TASK-170 má Orca složit do seznamu jednotek práce s fází a váznutím podle modelu z TASK-166 a dát ho klientům jednou metodou, aby přehled, karta workspace, stránka Tasks i oznámení četly totéž.

### Rozsah

- Služba v hlavním procesu podle rozhodnutí o architektuře z TASK-166: skládání, obnova, oznámení o změně klientům.
- Metoda runtime a schopnost; klient v rendereru.

### Mimo rozsah

- Rozhraní (TASK-172 až TASK-174) a oznámení na ploše (TASK-175).

### Omezení

- Zdroj, který neodpověděl, nesmí shodit ostatní: jednotka nese, co je známé, a u zbytku důvod.
- Čtenáři drží jen prezentaci; fázi a váznutí počítá služba.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Metoda vrací jednotky práce uživatele napříč repozitáři s tiketem, větví, pull requestem, fází, časem vstupu do fáze, váznutím a stavem vydání
- [ ] #2 Výpadek jednoho zdroje (Jira, poskytovatel pull requestů, hostitel repozitáře) nechá ostatní jednotky a fakta beze změny a u dotčených řekne důvod
- [ ] #3 Klient se o změně dozví bez dotazování po krátkém intervalu; obnova má strop požadavků na kolo
- [ ] #4 SSH repozitář a folder workspace: jednotky z repozitáře jiného hostitele se skládají podle rozhodnutí z TASK-166; při ztrátě spojení je jejich fáze neznámá
- [ ] #5 Metoda je za schopností; test kompatibility pokrývá staršího klienta i staršího hostitele
- [ ] #6 Testy nad smyšlenými zdroji pokrývají každou fázi z dokumentace a přechody mezi nimi
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Z TASK-166 (decision-17): čtečka odpovědi tolerantní k neznámým hodnotám (důvod, fáze, stav vydání se čtou jako neznámé), zápis workFlow: 'host' do HOST_OPERATION_OWNERSHIP, parametr scope ('host' výchozí, 'all' jen pro okno a spárovaného klienta) a sloučení jednotek se stejným označením z více hostitelů.

Z TASK-167: fakta Azure DevOps čti z azureDevOpsWorkFacts.snapshot() a onChanged (src/main/azure-devops/review/azure-devops-work-facts-store.ts); repozitář, který ve snímku není, ještě nebyl přečten (not-loaded). Převod na model: workPullRequestFromAzureDevOps (src/shared/work-flow/azure-devops-work-facts.ts).
<!-- SECTION:NOTES:END -->
