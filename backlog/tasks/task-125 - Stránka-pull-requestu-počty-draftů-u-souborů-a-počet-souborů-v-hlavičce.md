---
id: TASK-125
title: 'Stránka pull requestu: počty draftů u souborů a počet souborů v hlavičce'
status: Done
assignee: []
created_date: '2026-11-19T09:37:00Z'
updated_date: '2026-11-19T09:49:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
priority: medium
type: feature
ordinal: 220900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Recenzent má ve stromu souborů vidět, u kterých souborů už má nepublikované drafty a které z nich napsal agent, a v hlavičce stránky, kolik souborů pull request mění. Je to jen rozhraní nad daty, která renderer už má.

### Rozsah

- Data: `detail.changes` a `detail.drafts` z `AzureDevOpsReviewDetail` (`src/shared/azure-devops-review-types.ts`); draft nese `filePath`, `author.kind` (`user` nebo `agent`) a `state`. Žádné nové pole ani metoda RPC.
- Strom souborů v `src/renderer/src/components/azure-devops-review/AzureDevOpsReviewFiles.tsx` a `AzureDevOpsReviewAllChanges.tsx` (sdílený `CombinedDiffFileTree` v `src/renderer/src/components/editor/combined-diff/browse-files/`).
- Hlavička: `PullRequestMeta` v `src/renderer/src/components/azure-devops-review/AzureDevOpsPullRequestPage.tsx`.

### Mimo rozsah

- Revieweři, stav kontrol a přidané a odebrané řádky z lokálního gitu: TASK-99.
- Stav kontrol a počty vláken na řádku seznamu: TASK-102.

### Omezení

- `CombinedDiffFileTree` sdílí i souhrnný diff, GitHub a GitLab; zásah do něj musí být nepovinný a obecně pojmenovaný.
- Vzhled podle `docs/STYLEGUIDE.md`, texty v šesti jazycích.
- Do testů ani snímků nepatří data ze skutečných pull requestů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Strom souborů v záložce Files ukazuje u souboru počet nepublikovaných draftů a rozliší drafty od agenta
- [x] #2 Hlavička stránky pull requestu ukazuje počet změněných souborů
- [x] #3 Strom souborů souhrnného diffu, GitHubu a GitLabu vypadá a chová se jako dosud; nová vlastnost CombinedDiffFileTree je nepovinná
- [x] #4 Tiket nemění typy detailu ani parametry RPC; starší hostitel a starší mobilní klient se nedotknou
- [x] #5 Výpočet počtů má jednotkový test; strom i hlavička jsou ověřené ve skrytém okně proti smyšlenému serveru se snímkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker 2026-11-19): (1) čistá funkce countAzureDevOpsReviewFileDrafts v azure-devops-review-file-draft-counts.ts – nepublikované drafty (state !== published) s filePath, po cestě celkem/agent; jednotkový test. (2) CombinedDiffFileTree dostane nepovinný renderFileAnnotation(entry) protažený přes rows do row; bez něj stejné markup. (3) AzureDevOpsReviewFileDraftCount (ikona MessageSquareDashed pro moje, Bot pro agenta, tooltip) v obou stromech Files. (4) PullRequestMeta: počet změněných souborů; Meta přesunu do vlastního souboru kvůli délce stránky. (5) Klíče v 6 jazycích, e2e spec proti smyšlenému serveru se snímkem.

Hotovo (worker 2026-11-19): počty v obou stromech Files (all changes i po souboru) přes nepovinný renderFileAnnotation v CombinedDiffFileTree; hlavička 'Changed files: N' v AzureDevOpsPullRequestMeta (přesunuto ze stránky). Počítají se jen drafty s filePath (inline, file); odpovědi ve vláknech a obecné drafty ne, stejně jako seznam komentářů u souboru. Ověřeno: unit testy, e2e tests/e2e/pull-request-file-draft-counts.spec.ts + ostatní pull-request-*.spec.ts, snímky ~/.cache/orca-review-ide/task-125. Zbývá: nic.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Strom souborů pull requestu (pohled po souboru i se všemi změnami) ukazuje u souboru počet nepublikovaných draftů k řádku nebo souboru a zvlášť kolik z nich napsal agent; hlavička stránky ukazuje počet změněných souborů. Data jdou z detail.changes a detail.drafts, typy detailu ani RPC se nezměnily. Sdílený CombinedDiffFileTree dostal nepovinnou vlastnost renderFileAnnotation; bez ní je markup stejný, což hlídá test. PullRequestMeta se přesunula do vlastního souboru. Ověřeno jednotkovými testy výpočtu a stromu a e2e ve skrytém okně proti smyšlenému serveru; všech deset specy pull requestu prošlo. Odpovědi ve vláknech se u souboru nepočítají, protože nemají filePath. Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
