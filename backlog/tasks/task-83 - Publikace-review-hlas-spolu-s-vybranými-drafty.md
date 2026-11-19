---
id: TASK-83
title: 'Publikace review: hlas spolu s vybranými drafty'
status: Done
assignee: []
created_date: '2026-11-18T15:16:00Z'
updated_date: '2026-11-19T15:37:00Z'
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
- [x] #1 Dialog publikace na stránce cizího otevřeného pull requestu nabízí Hlas neměnit (výchozí), Schválit, Schválit s připomínkami, Čekat na autora a Zamítnout a říká, co přesně odejde do Azure DevOps
- [x] #2 Publikace odešle vybrané drafty a potom hlas; když některý draft selže, hlas se neodešle a uživatel vidí, co odešlo a co ne
- [x] #3 Hlas jde odeslat i bez vybraných draftů
- [x] #4 Na vlastním, dokončeném nebo opuštěném pull requestu se hlas nenabízí; pull request z forku hlasovat umí, i když pro něj nejde založit review worktree
- [x] #5 Po úspěšném hlasu stránka i panel Pull requests ukazují nový hlas bez ruční obnovy a pull request opustí skupinu Čeká na moje review
- [x] #6 CLI orca ado, MCP server ani Pi rozšíření hlasovat neumí; pokrývá to test seznamu nástrojů
- [x] #7 Proti hostiteli bez podpory hlasu se volba nenabídne a publikace draftů funguje jako dosud; starší mobilní klient publikuje jako dosud
- [x] #8 Testy pokrývají převod hlasu na hodnoty API, pořadí drafty a pak hlas, částečné selhání a dvojí kliknutí; dialog je ověřený ve skrytém okně proti smyšlenému serveru
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker, 2026-11-19):
1. Hostitel a protokol: hlas jako volitelné pole `vote` v `azureDevOpsReview.publishDrafts` (prázdné `draftIds` jen s hlasem), výsledek nese `vote` se stavem sent/skipped/failed; schopnost `azure-devops-review.vote.v1`; hostitel hlas odmítne od volajícího `local-cli` (CLI, MCP, Pi) a na vlastním nebo neotevřeném PR. Zápis hlasu: PUT .../pullRequests/{id}/reviewers/{reviewerId}, tělo {vote, id}, api-version jako ostatní volání (7.1). Dokumentace: https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-reviewers/create-pull-request-reviewer?view=azure-devops-rest-7.1
2. Testy hostitele: převod hlasu, pořadí drafty a pak hlas, částečné selhání, souběžné volání, kontrakt parametrů, seznam nástrojů bez hlasu.
3. Renderer: dialog publikace s výběrem hlasu (Select), volba jen když hostitel hlásí schopnost, výsledek v dialogu při neúplném odeslání, obnova detailu a řádku v seznamu.
4. Podvržený server: přijetí hlasu a draftů, záznam pořadí požadavků; e2e spec a snímky do ~/.cache/orca-review-ide/task-83.
5. Lokalizace nových klíčů v šesti jazycích.

Stav 1/3 (hostitel a protokol hotové, testy procházejí): src/shared/azure-devops-review-vote.ts (hlasy, převod na čísla API, překážky hlasu, výsledek), src/main/azure-devops/review/azure-devops-review-vote-cast.ts (kontrola volajícího, kontrola PR před odesláním čehokoli, PUT hlasu po draftech), publishAzureDevOpsReviewDrafts(…, vote?), parametr vote v AzureDevOpsReviewPublishParams, schopnost azure-devops-review.vote.v1. Testy: azure-devops-review-publish-vote.test.ts, azure-devops-review-vote.test.ts, rpc-contract/azure-devops-review-params.test.ts, rpc/methods/azure-devops-review-vote-caller.test.ts, cli/azure-devops-review-agent-surfaces.test.ts. Zbývá: renderer (dialog, schopnost, obnova seznamu), podvržený server + e2e, lokalizace, brány.

Dokončeno workerem 2026-11-19, čeká na ověření koordinátorem. Hotovo vše z plánu: hostitel a protokol, dialog publikace (AzureDevOpsReviewPublishDialog + AzureDevOpsReviewPublishReport), nabídka hlasu jen při schopnosti hostitele a na cizím otevřeném PR (use-azure-devops-review-vote-offered), hlas v hlavičce stránky, obnova seznamu po odeslaném hlasu, podvržený server (přijímá nová vlákna a hlas, zaznamenává požadavky, volitelně odpovídá na seznam PR), e2e tests/e2e/pull-request-publish-vote.spec.ts, lokalizace 33 klíčů v 6 jazycích, docs/review-ide/05-funkce.md. Ověření: pnpm tc, oxlint, check:code-quality:changed, mobile typecheck a lint, 62 souborů testů kolem Azure DevOps (385 testů), e2e 5 specifikací ve skrytém okně (nová + 4 dosavadní pull-request-*). Snímky a logy: ~/.cache/orca-review-ide/task-83. Vědomá rozhodnutí: hostitel přijme hlas jen od volajícího desktop nebo paired-device a odmítne ho z lokálního socketu (CLI, MCP, Pi); hlas na vlastním nebo zavřeném PR zastaví celou publikaci dřív, než odejde komentář; zrušení hlasu (bez hlasu) Orca neumí; hlas se nikde neukládá. Body k ověření proti skutečné organizaci jsou v poznámkách TASK-68.

Otázky pro uživatele (2026-11-19): 1) smí hlas odeslat i spárované zařízení (webový klient, vzdálený desktop, později mobil)? Současný stav ano; hostitel odmítá hlas jen z místního socketu, kterým mluví CLI, MCP a agentní rozšíření. Přísnější varianta je jen okno aplikace. 2) má Orca umět hlas zrušit? Teď ne (doporučeno nechat). Navržené navazující práce bez tiketu: výběr hlasu v mobilním potvrzení publikace (hostitel i schopnost jsou připravené); množné číslo v textech publikace.

Odpověď uživatele 2026-11-19 (decision-12, doplnění): hlas z okna Orky i ze spárovaného zařízení, vždy po ručním potvrzení uživatelem, agent nikdy. Odpovídá současnému stavu.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Publikace review cizího pull requestu teď jedním potvrzením odešle vybrané drafty i hlas. Dialog nabízí Hlas neměnit (výchozí), Schválit, Schválit s připomínkami, Čekat na autora a Zamítnout a vypisuje, co přesně do Azure DevOps odejde; hlas jde odeslat i bez draftů. Hlas odchází až po draftech a jen když všechny prošly; při selhání draftu se neodešle a dialog ukáže, co odešlo a co ne, bez automatického opakování. Na vlastním nebo zavřeném pull requestu se hlas nenabízí a hostitel ho odmítne dřív, než odejde první komentář. Po hlasu stránka i panel ukazují nový hlas a pull request opustí skupinu Čeká na moje review. Agent hlasovat nemůže: CLI, MCP ani Pi rozšíření hlas nenabízejí a hostitel ho z místního socketu odmítne celým požadavkem. Hlas je vyjednaná schopnost hostitele, proti staršímu hostiteli se nenabídne a publikace draftů funguje jako dosud; pole hlasu v parametrech i ve výsledku je nepovinné. Zrušení hlasu Orca neumí. Ověřeno testy hostitele, protokolu a dialogu a e2e ve skrytém okně proti podvrženému serveru; do Azure DevOps při vývoji neodešel žádný požadavek. Neověřeno proti skutečné organizaci (TASK-68): jestli identifikátor přihlášeného uživatele je identifikátor reviewera, co udělá zápis hlasu pro uživatele mimo reviewery a jestli zachová příznak povinného reviewera.
<!-- SECTION:FINAL_SUMMARY:END -->
