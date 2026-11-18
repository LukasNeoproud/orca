---
id: TASK-83
title: 'Publikace review: hlas spolu s vybranými drafty'
status: To Do
assignee: []
created_date: '2026-11-18T15:16:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
priority: high
type: feature
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Review cizího pull requestu dnes v Orce končí publikací komentářů; hlasovat musí recenzent v prohlížeči. Publikace má jedním krokem odeslat vybrané drafty i hlas, jak popisuje oddíl 5 (Code review s AI).

### Rozsah

- `src/main/azure-devops/review/azure-devops-review-client.ts`: zápis hlasu přihlášeného uživatele jako reviewera (identitu dává `getAzureDevOpsReviewIdentity`). Klient dnes zapisuje jen vlákna, odpovědi a stav vlákna.
- `src/main/azure-devops/review/azure-devops-review-draft-actions.ts` (`publishAzureDevOpsReviewDrafts`): hlas se odešle až po draftech a jen když všechny prošly.
- RPC `azureDevOpsReview.*` (`src/main/runtime/rpc/methods/azure-devops-review.ts`, `src/shared/rpc-contract/azure-devops-review-params.ts`). Typ `AzureDevOpsReviewVote` a pole `myVote` už v `src/shared/azure-devops-review-types.ts` jsou, hlas se zatím jen čte.
- `src/renderer/src/components/azure-devops-review/AzureDevOpsReviewDrafts.tsx`: potvrzovací dialog publikace s výběrem hlasu a publikace samotného hlasu.
- Po publikaci obnovit detail i seznam; skupina Čeká na moje review se řídí `myVote` (`src/shared/azure-devops-review-groups.ts`).

### Mimo rozsah

- Hlasování z mobilní aplikace; tady jen kompatibilita protokolu.
- Dokončení a opuštění pull requestu, automatické dokončení, správa reviewerů.
- Ověření proti skutečné organizaci: patří do TASK-68 a publikuje vždy uživatel.

### Omezení

- Agent nesmí hlasovat. `src/shared/azure-devops-review-tools.ts`, `orca ado` (`src/cli/specs/azure-devops.ts`) ani Pi rozšíření hlas nedostanou a prompty ho dál zakazují.
- Starší hostitel neznámé pole parametrů tiše zahodí a hlas by se ztratil bez chyby. Hlas proto musí být vyjednaný: schopnost v `src/shared/host-feature-runtime-capabilities.ts`, nebo vlastní metoda. Klient bez podpory hostitele volbu nenabídne.
- Při vývoji do Azure DevOps nic nezapisuj; testy běží proti smyšleným odpovědím (vzor `tests/e2e/pull-request-review-groups.spec.ts`).
- Změna parametrů RPC: přegenerovaný katalog a kontraktní test; pro `azure-devops-review-params.ts` zatím žádný není.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dialog publikace na stránce cizího otevřeného pull requestu nabízí Hlas neměnit (výchozí), Schválit, Schválit s připomínkami, Čekat na autora a Zamítnout a říká, co přesně odejde do Azure DevOps
- [ ] #2 Publikace odešle vybrané drafty a potom hlas; když některý draft selže, hlas se neodešle a uživatel vidí, co odešlo a co ne
- [ ] #3 Hlas jde odeslat i bez vybraných draftů
- [ ] #4 Na vlastním, dokončeném nebo opuštěném pull requestu se hlas nenabízí; pull request z forku hlasovat umí, i když pro něj nejde založit review worktree
- [ ] #5 Po úspěšném hlasu stránka i panel Pull requests ukazují nový hlas bez ruční obnovy a pull request opustí skupinu Čeká na moje review
- [ ] #6 CLI orca ado, MCP server ani Pi rozšíření hlasovat neumí; pokrývá to test seznamu nástrojů
- [ ] #7 Proti hostiteli bez podpory hlasu se volba nenabídne a publikace draftů funguje jako dosud; starší mobilní klient publikuje jako dosud
- [ ] #8 Testy pokrývají převod hlasu na hodnoty API, pořadí drafty a pak hlas, částečné selhání a dvojí kliknutí; dialog je ověřený ve skrytém okně proti smyšlenému serveru
<!-- AC:END -->
