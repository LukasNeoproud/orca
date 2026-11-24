---
id: TASK-167
title: 'Tok práce: fakta o mých pull requestech a obnova seznamu na pozadí'
status: Done
assignee: []
created_date: '2026-11-24T09:05:00Z'
updated_date: '2026-11-24T10:39:00Z'
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
- [x] #1 U každého otevřeného pull requestu uživatele jsou známí revieweři s hlasy, čas poslední verze, počet nevyřešených vláken od jiných lidí a čas poslední připomínky
- [x] #2 U dokončeného pull requestu uživatele je známý čas sloučení a commit sloučení v cílové větvi, i při squash merge
- [x] #3 Fakta se obnovují na pozadí bez zapnutého automatického review, se stropem požadavků; test dokládá, že obnova nic nezapisuje
- [x] #4 GitHub a GitLab: fakta, která poskytovatel přes stávající rozhraní dává, se vyplní, ostatní jsou neznámá; test
- [x] #5 Starší klient i starší hostitel: nová pole jsou nepovinná a test kompatibility to dokládá
- [x] #6 Ověřeno testy se smyšlenými odpověďmi a jedním čtením proti skutečné organizaci přes připojení uložené v Orce
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Z TASK-166 (decision-17): doplnit commit a čas sloučení i pro GitHub a GitLab (bez nich je sloučený pull request mimo Azure DevOps ve fázi neznámé), příznak povinného reviewera a to, jestli pull request založil uživatel; model je čte jako required, createdByUser, mergeCommit, mergedAt (src/shared/work-flow/work-unit-facts.ts).

Plán (worker, 2026-11-24): 1) sdílené typy: nepovinné workFacts u pull requestu v azureDevOpsReview.list (revieweři s hlasy a povinností, čas a commit sloučení z odpovědi seznamu; activity = čas poslední verze, nevyřešená vlákna cizích, poslední připomínka z vláken a iterací), createdByMe i jako false; 2) src/shared/work-flow: převod pull requestu Azure DevOps na WorkPullRequest, chybějící nebo zastaralé pole = neznámé; 3) hlavní proces: obnova každých 15 min (seznam mých PR po projektech, podrobnosti jen otevřených, strop 30 požadavků, bez sítě neběží, opakování 1 až 15 min), registrace v desktopu i orcad; 4) GitHub a GitLab: mergedAt a commit sloučení do HostedReviewInfo ze stávajících dotazů; 5) testy vč. kompatibility a testu, že obnova posílá jen GET; 6) čtení proti skutečné organizaci.

Stav (worker): hotové sdílené typy (src/shared/azure-devops-pull-request-work-facts.ts, work-flow/azure-devops-work-facts.ts), mapper a odvození z vláken (review/azure-devops-pull-request-list-facts.ts, -activity.ts), úložiště, kolo obnovy a plánovač (review/azure-devops-work-facts-{store,refresh,schedule}.ts), registrace v main-process-runtime-service.ts a orcad-entry.ts, připojení activity v azureDevOpsReview.list, mergedAt a mergeCommitOid pro GitHub a GitLab; testy activity, mapperu, kola a plánovače prochází. Zbývá: test kompatibility, testy GitHub a GitLab, čtení proti skutečné organizaci, dokumentace, brány.

Dokončeno workerem 2026-11-24, čeká na ověření koordinátorem. Hotovo vše z plánu. Testy: azure-devops-pull-request-activity.test.ts, azure-devops-work-facts-refresh.test.ts (vč. jen GET a stropu 30), azure-devops-work-facts-schedule.test.ts, azure-devops-work-facts.compat.test.ts (starší klient i hostitel), src/shared/work-flow/azure-devops-work-facts.test.ts, src/main/source-control/forge-review-merge-facts.test.ts. Čtení proti skutečné organizaci: jedno kolo skutečného kódu ve druhé skryté instanci Orca Dev (izolovaný profil, záloha a shodné otisky sdílených souborů ~/.orca), jen GET; 20 pull requestů uživatele, u otevřeného sedí počet nevyřešených vláken s vlákny přečtenými zvlášť, 19 commitů sloučení je v cílové větvi lokálního gitu. Neověřeno na skutečných datech: squash (ve vzorku jen merge commity) a blokující hlas. Data a skripty: ~/.cache/orca-review-ide/task-167 (obsahují skutečná data). Odchylka od decision-17: vlákna se čtou v každém kole u všech otevřených pull requestů uživatele, protože seznam Azure DevOps nový komentář neprozradí; strop 30 platí pro dotazy na vlákna a iterace, seznam stojí dva dotazy na projekt. Popsáno v docs/review-ide/10-tok-prace.md (Fakta o pull requestech).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Azure DevOps: u pull requestů uživatele nepovinné workFacts (revieweři s hlasem a povinností, čas a commit sloučení, activity = poslední verze, nevyřešená vlákna cizích, poslední připomínka), createdByMe nově i false. Obnova v hlavním procesu desktopu i orcad každých 15 minut, strop 30 dotazů na vlákna a iterace, jen GET, úložiště v paměti; azureDevOpsReview.list přibalí activity. GitHub a GitLab: mergedAt a mergeCommitOid v HostedReviewInfo (gh pr view čte dvě pole navíc). Odchylka od decision-17: vlákna se čtou každé kolo u všech otevřených pull requestů uživatele, protože seznam nový komentář neprozradí. Ověřeno: pnpm tc, 128 testů změněných souborů včetně kompatibility, brána změněných řádků, anti-slop, čtení proti skutečné organizaci ve skryté instanci (jen GET, otisky sdílených souborů shodné). Neověřeno na skutečných datech: squash merge a blokující hlas (TASK-176); plánovač neběžel v živé aplikaci.
<!-- SECTION:FINAL_SUMMARY:END -->
