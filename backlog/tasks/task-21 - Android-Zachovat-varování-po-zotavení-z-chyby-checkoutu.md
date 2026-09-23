---
id: TASK-21
title: 'Android: Zachovat varování po zotavení z chyby checkoutu'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 11:57'
labels: []
dependencies: []
references:
  - mobile/src/tasks/worktree-create-retry.ts
  - src/shared/worktree/create-types.ts
  - src/main/runtime/orca-runtime-create-managed-worktree.ts
priority: high
type: bug
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Runtime umí zachovat již vytvořený worktree, když dokončený checkout selže v hooku. Mobilní výsledek vytvoření dnes nepřenáší checkoutWarning, takže budoucí zapnutí zotavení by mohlo vypadat jako bezchybný start agenta.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mobil zachová a zobrazí plný výsledek vytvoření včetně checkoutWarning a rozliší vytvořený worktree od úspěšně dokončeného setupu.
- [ ] #2 Při varování se agent automaticky nespustí; uživatel může otevřít vytvořený workspace a získat původní zadání k bezpečnému pokračování.
- [ ] #3 Opt-in zotavení se odešle až spolu s podporou varovného UI; starší host a opakovaný výsledek po reconnectu neztratí informaci ani nevytvoří další worktree.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Trace worktree create result and retry handling; preserve checkoutWarning across RPC/reconnect; gate opt-in recovery and agent launch; add focused tests for warning and duplicate result.
<!-- SECTION:PLAN:END -->
