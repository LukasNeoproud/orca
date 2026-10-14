---
id: TASK-21
title: 'Android: Zachovat varování po zotavení z chyby checkoutu'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 12:22'
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

- [x] #1 Mobil zachová a zobrazí plný výsledek vytvoření včetně checkoutWarning a rozliší vytvořený worktree od úspěšně dokončeného setupu.
- [x] #2 Při varování se agent automaticky nespustí; uživatel může otevřít vytvořený workspace a získat původní zadání k bezpečnému pokračování.
- [x] #3 Opt-in zotavení se odešle až spolu s podporou varovného UI; starší host a opakovaný výsledek po reconnectu neztratí informaci ani nevytvoří další worktree.

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

Trace worktree create result and retry handling; preserve checkoutWarning across RPC/reconnect; gate opt-in recovery and agent launch; add focused tests for warning and duplicate result.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Recovery notice, create/replay and route tests passed (51 mobile tests); host checkout recovery tests passed (5 root tests); mobile typecheck passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Preserved full create result and checkout warning, paused automatic startup and exposed original prompt/note; verified by mobile flow and host recovery tests.
<!-- SECTION:FINAL_SUMMARY:END -->
