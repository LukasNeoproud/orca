---
id: TASK-104
title: 'Brány kvality: stav u pull requestu a před jeho založením'
status: To Do
assignee: []
created_date: '2026-11-18T15:25:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-86
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 224000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Stav bran kvality má být vidět i tam, kde se rozhoduje o pull requestu: autor před založením ví, že posílá kód, který neprošel, a recenzent na stránce pull requestu vidí, jestli brány na jeho commitu prošly.

### Rozsah

- Stránka pull requestu (`src/renderer/src/components/azure-devops-review/AzureDevOpsPullRequestPage.tsx`): stav bran pro worktree pull requestu (`reviewWorktree` v detailu, workspace větve autora z `src/main/azure-devops/review/azure-devops-feedback-worktree.ts`), porovnaný s commitem pull requestu (`sourceCommit`).
- Formulář založení pull requestu (`src/renderer/src/components/right-sidebar/CreateHostedReviewComposer.tsx`): stav bran aktivního workspace a upozornění.
- Data z RPC `qualityGates.*` (TASK-85) a zobrazení komponentami z `src/renderer/src/components/quality-gates/` (TASK-86); do stránky a formuláře jen registrace.

### Mimo rozsah

- Zápis stavu bran do Azure DevOps jako stav pull requestu: otázka pro uživatele v TASK-69; do rozhodnutí zůstává stav jen v Orce.
- Automatické spuštění bran při otevření pull requestu nebo před založením.
- Stav bran na stránkách pull requestů GitHubu a GitLabu; tam ho ukazuje oddíl v panelu Checks z TASK-86.

### Omezení

- Formulář založení je společný pro všechny poskytovatele; zásah musí být malý a nezávislý na poskytovateli.
- Upozornění nic neblokuje; rozhoduje uživatel.
- Texty v šesti jazycích, stavové barvy ze stávajících tokenů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Stránka pull requestu Azure DevOps ukazuje stav místních bran, když pro pull request existuje workspace větve nebo review worktree; stav platí jen pro běh na commitu pull requestu, jinak hlásí, že pro tento commit brány neběžely
- [ ] #2 Formulář založení pull requestu ukazuje stav bran workspace; při selhané, zastaralé nebo nespuštěné povinné bráně zobrazí upozornění s akcí Spustit brány a založení neblokuje
- [ ] #3 Upozornění ve formuláři funguje stejně pro Azure DevOps, GitHub i GitLab; workspace bez nastavených bran nic neukazuje
- [ ] #4 Workspace na SSH hostiteli ukazuje stav ze svého hostitele; při ztrátě spojení je stav unverifiable a upozornění to řekne
- [ ] #5 Do Azure DevOps ani jiné služby se stav bran neodesílá; pokrývá to test, že tok nevolá žádný zápis
- [ ] #6 Komponenty mají testy a obě místa jsou ověřená ve skrytém okně se snímkem
<!-- AC:END -->
