---
id: TASK-99
title: >-
  Stránka pull requestu: revieweři, stav kontrol, rozsah změn a počty draftů u
  souborů
status: To Do
assignee: []
created_date: '2026-11-18T15:21:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
priority: medium
type: feature
ordinal: 221000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Stránka pull requestu neukazuje to, co recenzent v Azure DevOps vidí hned: kdo už hlasoval, jestli prošly kontroly a jak velká změna je. Bez toho se rozhoduje naslepo, jestli má review smysl začínat.

### Rozsah

- Revieweři: surový pull request je už nese (`RawReviewPullRequest.reviewers` v `src/main/azure-devops/review/azure-devops-review-mappers.ts`), dnes se z nich čte jen vlastní hlas. Přidej je do `AzureDevOpsReviewDetail` (`src/shared/azure-devops-review-types.ts`) jako nepovinné pole.
- Kontroly: stavy pull requestu už čte kód pro kartu workspace (`getPullRequestStatuses` v `src/main/azure-devops/client.ts`, `deriveAzureDevOpsStatus` v `src/main/azure-devops/pull-request-mappers.ts`). Znovu ho použij; sdílené typy stavu jsou `CheckStatus` (`src/shared/github/pull-request-types.ts`) a `src/shared/provider-check-summary.ts`. Vyhodnocení pravidel větve (sestavení jako podmínka sloučení) dnes nečte nic; zjisti z dokumentace API, kde se výsledek sestavení objevuje, a doplň ho.
- Rozsah: počet souborů z `detail.changes`; řádky z lokálního gitu, když existuje review worktree nebo vlastní workspace s commitem pull requestu.
- Rozhraní: `PullRequestMeta` a hlavička v `src/renderer/src/components/azure-devops-review/AzureDevOpsPullRequestPage.tsx`, strom souborů v `AzureDevOpsReviewFiles.tsx` a `AzureDevOpsReviewAllChanges.tsx` (sdílený `CombinedDiffFileTree`).

### Mimo rozsah

- Stav kontrol a počty vláken na řádku seznamu: navazující tiket.
- Jednotlivé kontroly Azure DevOps v panelu Checks, jejich opakované spuštění a logy.
- Navázané pracovní položky: vlastní tiket.
- Změna reviewerů.

### Omezení

- Jen čtení z Azure DevOps. Ověření proti skutečné organizaci smí worker dělat jen s potvrzeným oprávněním v `CLAUDE.local.md`; jinak ověř proti smyšleným odpovědím a neověřené části zapiš.
- Šetři limity API: žádný požadavek na soubor nebo vlákno.
- Obecné pojmy (kontrola, reviewer) nepojmenovávej podle Azure DevOps; `CombinedDiffFileTree` sdílí i GitHub a GitLab, zásah do něj musí být nepovinný.
- Do tiketu, testů ani dokumentace nepatří data ze skutečných pull requestů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hlavička stránky pull requestu ukazuje reviewery s jejich hlasem a označením povinného reviewera
- [ ] #2 Hlavička ukazuje souhrnný stav kontrol (prošly, selhaly, běží, žádné) a seznam kontrol s názvem a stavem; selhaná kontrola jde otevřít v prohlížeči
- [ ] #3 Hlavička ukazuje rozsah změn: počet souborů vždy, přidané a odebrané řádky, když je commit pull requestu dostupný lokálně
- [ ] #4 Strom souborů v záložce Files ukazuje u souboru počet nepublikovaných draftů a rozliší drafty od agenta
- [ ] #5 Načtení stránky nepřidá víc než pevný počet požadavků na Azure DevOps bez ohledu na počet souborů a vláken; počet je doložený testem
- [ ] #6 Starší mobilní klient i starší hostitel detail dál načtou; nová pole jsou nepovinná
- [ ] #7 Mapování reviewerů a kontrol má testy; hlavička je ověřená ve skrytém okně proti smyšlenému serveru se snímkem
- [ ] #8 Která volání Azure DevOps nesou výsledek sestavení z pravidel větve, je zapsané v poznámkách tiketu spolu s tím, zda to bylo ověřeno čtením proti skutečné organizaci
<!-- AC:END -->
