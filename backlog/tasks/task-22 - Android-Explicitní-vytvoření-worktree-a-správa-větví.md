---
id: TASK-22
title: 'Android: Explicitní vytvoření worktree a správa větví'
status: To Do
assignee: []
created_date: '2026-09-23 10:50'
labels: []
dependencies:
  - TASK-21
references:
  - mobile/src/components/NewWorktreeModal.tsx
  - src/main/runtime/rpc/methods/worktree.ts
  - src/main/runtime/rpc/methods/git.ts
priority: medium
type: feature
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Desktop přidal jednodušší vytváření worktree, volbu umístění a kontrolované operace s větví. Mobilní formulář tyto repo volby nezná a používá pouze starší vytvoření podle názvu a base ref.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mobil zobrazí dostupné výchozí umístění a volby vytvoření, před potvrzením nabídne náhled a neignoruje konflikt se stávajícím worktree.
- [ ] #2 Explicitní volba umístění se nikdy tiše neztratí na starším hostu; nepodporovaná metoda vede k požadavku na aktualizaci bez vytvoření jinde.
- [ ] #3 Správa větve ukáže dopad akce před potvrzením a po úspěchu obnoví stav projektu a workspace.
- [ ] #4 Zachová se současné idempotentní vytváření, práce s folder workspaces a bezpečné chování při SSH odpojení.
<!-- AC:END -->
