---
id: TASK-125
title: 'Stránka pull requestu: počty draftů u souborů a počet souborů v hlavičce'
status: To Do
assignee: []
created_date: '2026-11-19T09:37:00Z'
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
- [ ] #1 Strom souborů v záložce Files ukazuje u souboru počet nepublikovaných draftů a rozliší drafty od agenta
- [ ] #2 Hlavička stránky pull requestu ukazuje počet změněných souborů
- [ ] #3 Strom souborů souhrnného diffu, GitHubu a GitLabu vypadá a chová se jako dosud; nová vlastnost CombinedDiffFileTree je nepovinná
- [ ] #4 Tiket nemění typy detailu ani parametry RPC; starší hostitel a starší mobilní klient se nedotknou
- [ ] #5 Výpočet počtů má jednotkový test; strom i hlavička jsou ověřené ve skrytém okně proti smyšlenému serveru se snímkem
<!-- AC:END -->
