---
id: TASK-77
title: Stránkovat seznam pull requestů a dohledání dokončených pull requestů
status: Done
assignee: []
created_date: '2026-11-18T13:20:00Z'
updated_date: '2026-11-19T03:08:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/01-integrace.md
priority: medium
type: bug
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Obě čtení seznamu pull requestů berou jen první stránku a o oříznutí mlčí. Uživatel pak ve filtru Vše nevidí starý otevřený pull request a úklid větví nepozná starou větev sloučenou přes squash.

### Rozsah

- `src/main/azure-devops/review/azure-devops-review-client.ts` (`listAzureDevOpsRepositoryPullRequests`, `$top=100`) a `azure-devops-review-service.ts` (`listAzureDevOpsReviewPullRequests`): stav `all` nesmí ztratit aktivní pull requesty; výsledek nese příznak oříznutí na repozitář.
- `src/renderer/src/components/right-sidebar/AzureDevOpsPullRequestsPanel.tsx`: sdělení o oříznutí a načtení dalších.
- `src/main/azure-devops/completed-pull-request-heads.ts` (`PAGE_SIZE = 500`): stránkování přes `$skip`.
- Zjištění z TASK-67 proti skutečné organizaci: `$top=500` i `$skip=500` API přijímá, `$top=1000` vrátí víc než 500 položek; repozitář se stovkami dokončených pull requestů do jedné cílové větve je běžný; ve filtru Vše chyběl aktivní pull request starý několik měsíců.

### Mimo rozsah

- Mazání větví a jeho důkazy v `src/main/git/merged-branch-cleanup.ts`.
- Řazení a seskupení seznamu (TASK-63).

### Omezení

- Šetřit počet dotazů: další stránky uzavřených pull requestů až na žádost uživatele.
- Starší mobilní klient dostane stejný tvar odpovědi; příznak oříznutí je volitelné pole.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Filtr Vše ukáže každý aktivní pull request, který ukazuje filtr Aktivní, i když je starší než sto novějších uzavřených
- [x] #2 Když Azure DevOps vrátí plnou stránku a seznam je oříznutý, panel to řekne a nabídne načtení dalších
- [x] #3 Dohledání dokončených pull requestů pro úklid větví projde další stránky do rozumného stropu a najde i pull request starší než pět set novějších
- [x] #4 Testy pokrývají plnou stránku, poslední neúplnou stránku, strop počtu stránek a selhání druhé stránky (výsledek první zůstane použitelný)
- [x] #5 Repozitář jiného poskytovatele než Azure DevOps a SSH repozitář se chovají jako dosud
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker): 1) klient seznamu dostane $top/$skip; nový modul review/azure-devops-review-pull-request-pages.ts čte stránky: aktivní vždy celé do stropu, uzavřené jen tolik stránek, kolik si klient řekl nepovinným parametrem pages metody azureDevOpsReview.list; stav all = dotaz active + dotaz all, sloučené podle id. 2) Výsledek nese nepovinné truncatedRepoKeys (jen když je co hlásit); starší hostitel pole neposílá, takže klient načtení dalších nenabídne. 3) Panel: sdělení o oříznutí a tlačítko načíst starší; store drží počet stránek. 4) completed-pull-request-heads: stránky přes $skip do stropu, selhání další stránky nechá první použitelnou. 5) Testy vitest, kontraktní test parametrů, rozšíření podvrženého serveru o stránkování a nový e2e spec.

Průběh (worker): hostitel, protokol, store, panel, CLI varování, lokalizace a vitest testy jsou hotové, pnpm tc prochází. Zbývá: brány (oxlint, code-quality, ratchety, katalog), e2e spec tests/e2e/pull-request-list-pages.spec.ts ve skrytém okně a ostatní pull-request-* specy, dokumentace.

Dokončeno workerem 2026-11-19, čeká na ověření koordinátorem. Hotovo vše z plánu. Otevřené PR se čtou celé do stropu 10 stránek po 100, uzavřené po jedné stránce a další až na žádost (parametr pages, strop 20); výsledek nese truncatedRepoKeys jen při oříznutí. Panel: AzureDevOpsPullRequestListTruncation pod řádky, store drží hloubku. Úklid větví: stránky po 500 do stropu 10. CLI vypíše oříznutí jako varování. Testy: azure-devops-review-pull-request-pages.test.ts, azure-devops-review-service-list.test.ts, completed-pull-request-heads.test.ts, azure-devops-review-params.test.ts, AzureDevOpsPullRequestsPanel.pages.test.tsx, azure-devops-format.test.ts; e2e tests/e2e/pull-request-list-pages.spec.ts a 6 dosavadních pull-request-* speců ve skrytém okně prošlo. Snímky a logy: ~/.cache/orca-review-ide/task-77. Neověřeno proti skutečné organizaci: pořadí seznamu od nejnovějších u status=all se stránkováním. Mobilní klient oříznutí neukazuje (návrh navazujícího tiketu).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Filtr Vše v panelu Pull requests už neztrácí starý otevřený pull request za stovkou novějších uzavřených: otevřené se čtou vždy celé (do stropu deseti stránek) a uzavřené po stránkách na žádost. Když je seznam oříznutý, panel to pod řádky řekne a nabídne Načíst starší pull requesty; za stropem dvaceti stránek odkáže do Azure DevOps. Dohledání dokončených pull requestů pro úklid větví prochází další stránky po 500 do stropu deseti stránek, takže najde i pull request starší než pět set novějších; selhání další stránky ponechá, co je načtené. Příznak oříznutí a počet stránek jsou nepovinná pole existující metody: starší hostitel příznak nepošle, klient pak další stránky nenabídne, a starší klient dostane stejný tvar odpovědi. orca ado vypíše oříznutí jako varování. Vědomé důsledky: filtr Vše stojí dva dotazy na repozitář místo jednoho, repozitář s více než stovkou otevřených pull requestů stojí při každé obnově dotazy navíc a načtení další stránky čte znovu i předchozí. Ověřeno testy hostitele, protokolu a panelu a e2e ve skrytém okně proti podvrženému serveru. Neověřeno proti skutečné organizaci: pořadí seznamu se stavem all při stránkování a parametr skip u stránky po 100 (zapsáno k TASK-68). Mobilní klient příznak oříznutí zatím ignoruje; CLI a MCP si další stránku vyžádat neumí.
<!-- SECTION:FINAL_SUMMARY:END -->
