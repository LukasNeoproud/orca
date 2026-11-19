---
id: TASK-140
title: >-
  Oprava nálezů kontroly před akceptací M1: kotvy vláken, Open in diff,
  mezipaměť řádků a gutter Annotate
status: Done
assignee: []
created_date: '2026-11-19T22:17:00Z'
updated_date: '2026-11-19T22:52:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-1
dependencies: []
priority: high
type: bug
ordinal: 100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Nezávislá kontrola změn před akceptací M1 (2026-11-19) našla čtyři neověřené nálezy v review Azure DevOps a v Annotate. Ověř je a potvrzené oprav.

### Nálezy

1. src/main/azure-devops/review/azure-devops-review-thread-tracking.ts (kolem řádku 139 a 186): když se verze souboru nenačte (vyčerpaný rozpočet požadavků, chyba sítě, binární nebo velký soubor), vlákno přijde o kotvu a označí se jako outdated, i když se kód nezměnil.
2. src/renderer/src/components/azure-devops-review/AzureDevOpsReviewFiles.tsx (kolem řádku 161) a use-azure-devops-review-diff-reveal.ts: požadavek Open in diff se nevymaže, skok na řádek se opakuje při návratu k souboru nebo přepnutí záložky.
3. src/main/azure-devops/review/azure-devops-review-file-line-cache.ts (řádek 29): remember() přičítá znaky i při přepisu existujícího klíče, počítadlo roste nad skutečnou velikost a mezipaměť pak vyhazuje vše.
4. src/renderer/src/components/git-annotate/git-annotate-gutter-html.ts (řádek 80): commit.id jde do HTML gutteru bez escapování; u vzdáleného hostitele klient tvar odpovědi git.blame nekontroluje.

### Omezení

- Do Azure DevOps se nezapisuje. Vzdálený hostitel může být starší nebo novější; kontrola odpovědi nesmí odmítnout platnou odpověď staršího hostitele.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Každý ze čtyř nálezů je ověřený reprodukcí nebo testem; nepotvrzený je zapsaný s důvodem
- [x] #2 Vlákno, jehož verzi souboru se nepodařilo načíst, zůstane na původní kotvě a není označené jako outdated
- [x] #3 Skok Open in diff proběhne jednou; návrat k souboru ani přepnutí záložky ho neopakuje
- [x] #4 Počítadlo velikosti mezipaměti řádků souborů odpovídá obsahu i při přepisu téhož klíče
- [x] #5 Identifikátor commitu v gutteru Annotate je escapovaný a odpověď git.blame od vzdáleného hostitele se před použitím kontroluje
- [x] #6 Každá oprava má test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker): u každého nálezu nejdřív test, který na současném kódu selže, pak oprava.
1. Kotvy: loader odliší chybějící soubor ('missing') od verze, která se nenačetla (null); nenačtená verze nechá vlákno beze změny.
2. Open in diff: stránka požadavek po provedeném skoku (nebo vzdání) vymaže; počítadlo požadavků roste dál, aby nový požadavek nesplynul se starým.
3. Mezipaměť: remember() při přepisu klíče odečte znaky předchozího záznamu.
4. Annotate: commit.id v atributu escapovaný; odpověď git.blame z RPC hostitele ověřená schématem (otevřené pro další pole).

Hotovo: nález 3 (mezipaměť) potvrzen testem a opraven; nález 1 (kotvy) potvrzen testem a opraven, doplněna věta do 05-funkce.md. Zbývá: nález 2 (Open in diff), nález 4 (Annotate), brány.

Hotovo: nález 2 (Open in diff) potvrzen testem hooku a opraven (finishReveal, monotónní počítadlo); nález 4 (Annotate) potvrzen testy a opraven (escapování atributu, schéma runtime-git-blame-result.ts pro obě cesty klienta). Brány: tc, oxlint, check:code-quality:changed, audit:anti-slop, ratchety prochází. Rozpracováno: e2e tests/e2e/pull-request-open-in-diff-once.spec.ts ve skrytém okně.

Hotovo (worker 2026-11-19). Všechny čtyři nálezy potvrzené testem, který na původním kódu selhal, a opravené.
1. Kotvy: loader vrací 'missing' pro chybějící soubor a null pro nenačtenou verzi; nenačtená verze nechá vlákno beze změny (thread-tracking.test: keeps a thread where Azure DevOps put it...). Doplněna věta do 05-funkce.md.
2. Open in diff: finishReveal po skoku nebo vzdání, monotónní počítadlo (diff-reveal.test: jumps once...). E2E tests/e2e/pull-request-open-in-diff-once.spec.ts: s opravou 1 passed, se starým kódem selže na návratu k souboru. Snímky ~/.cache/orca-review-ide/task-140/01..03-*.png.
3. Mezipaměť: remember() odečte nahrazený záznam (file-line-cache.test: counts a version stored twice...).
4. Annotate: atribut escapovaný (gutter-html.test), odpověď git.blame ověřená zod schématem runtime-git-blame-result.ts v obou cestách klienta; nová pole pouští, odpověď hostitele této verze přijme (runtime-git-annotate-client.test). E2E git-annotate.spec.ts 1 passed.
Brány: pnpm tc 0, oxlint 0, check:code-quality:changed 0 nálezů, audit:anti-slop 0, focus-read a layout-writer ratchety OK, 89 souborů / 626 testů souvisejících sad prochází.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Všechny čtyři nálezy nezávislé kontroly potvrzeny testem a opraveny. Vlákno, jehož verzi souboru se nepodařilo načíst, zůstává na řádku z Azure DevOps a není zastaralé (smazaný soubor zastaralý zůstává). Skok Open in diff se po provedení spotřebuje a neopakuje se při návratu k souboru ani k záložce. Počítadlo mezipaměti řádků odečítá přepsaný záznam. Identifikátor commitu v gutteru Annotate je escapovaný a odpověď git.blame prochází schématem. Neověřeno: Annotate přes SSH hostitele, skutečná organizace Azure DevOps. Ověřeno: tc, 33 testů, brána změněných řádků, anti-slop, e2e Open in diff ve skrytém okně.
<!-- SECTION:FINAL_SUMMARY:END -->
