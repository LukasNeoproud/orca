---
id: TASK-167
title: 'Tok práce: fakta o mých pull requestech a obnova seznamu na pozadí'
status: To Do
assignee: []
created_date: '2026-11-24T09:05:00Z'
updated_date: '2026-11-24T10:16:00Z'
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
ordinal: 151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Aby Orca poznala, že review trvá dlouho nebo že čekají opravy, potřebuje u pull requestů uživatele vědět, kdo je reviewer a jak hlasoval, kdy vznikla poslední verze, kolik vláken od jiných lidí je nevyřešených a kdy přišla poslední připomínka, a u dokončených commit sloučení. Seznam dnes tato fakta nenese a na pozadí se obnovuje jen se zapnutým automatickým review.

### Rozsah

- Azure DevOps: `src/main/azure-devops/` (`client.ts`, `pull-request-mappers.ts`, `review/azure-devops-review-service.ts`, `review/azure-devops-review-thread-tracking.ts`), typy v `src/shared/azure-devops-review-types.ts`. Fakta jen pro pull requesty, které uživatel založil, včetně nedávno dokončených.
- Obnova na pozadí nezávislá na automatickém review (dnes `AzureDevOpsAutoReviewHost.tsx`), v hlavním procesu.
- Ostatní poskytovatelé: co dá `HostedReviewInfo`; co nedá, je neznámé.

### Mimo rozsah

- Zobrazení reviewerů a vláken na stránce a v seznamu pull requestů: TASK-99 a TASK-102, které tato fakta použijí.
- Jakýkoli zápis do Azure DevOps.

### Omezení

- Šetři požadavky: fakta čti dávkou a jen pro pull requesty uživatele; obnova má strop požadavků na kolo a neběží, když je aplikace bez spojení.
- Nová pole jsou nepovinná; starší klient i hostitel fungují dál.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 U každého otevřeného pull requestu uživatele jsou známí revieweři s hlasy, čas poslední verze, počet nevyřešených vláken od jiných lidí a čas poslední připomínky
- [ ] #2 U dokončeného pull requestu uživatele je známý čas sloučení a commit sloučení v cílové větvi, i při squash merge
- [ ] #3 Fakta se obnovují na pozadí bez zapnutého automatického review, se stropem požadavků; test dokládá, že obnova nic nezapisuje
- [ ] #4 GitHub a GitLab: fakta, která poskytovatel přes stávající rozhraní dává, se vyplní, ostatní jsou neznámá; test
- [ ] #5 Starší klient i starší hostitel: nová pole jsou nepovinná a test kompatibility to dokládá
- [ ] #6 Ověřeno testy se smyšlenými odpověďmi a jedním čtením proti skutečné organizaci přes připojení uložené v Orce
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Z TASK-166 (decision-17): doplnit commit a čas sloučení i pro GitHub a GitLab (bez nich je sloučený pull request mimo Azure DevOps ve fázi neznámé), příznak povinného reviewera a to, jestli pull request založil uživatel; model je čte jako required, createdByUser, mergeCommit, mergedAt (src/shared/work-flow/work-unit-facts.ts).
<!-- SECTION:NOTES:END -->
