---
id: TASK-26
title: 'Android: Obrazové diff review s poznámkami k oblastem'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 12:25'
labels: []
dependencies:
  - TASK-15
references:
  - mobile/src/session/mobile-diff-review-rpc.ts
  - mobile/src/components/MobileDiffReviewBody.tsx
  - src/shared/diff-comment-types.ts
priority: medium
type: feature
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Desktop dovoluje komentovat oblast změněného obrázku. Android v souborové záložce ukazuje jen výsledný obrázek a samostatná review obrazovka zahazuje binární diff payload. Po ochraně datového kontraktu je potřeba přidat srozumitelné dotykové review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Review zobrazuje původní a změněný obrázek včetně nového či smazaného souboru, zoomu a čitelného stavu při nedostupném obsahu.
- [x] #2 Uživatel může vybrat oblast, zpřesnit souřadnice přístupným ovládáním a poznámku vytvořit, upravit a odstranit.
- [x] #3 Poznámka uchovává procentní oblast nezávisle na zoomu a po obnovení je viditelná na správném obrázku; odeslání agentovi uvádí přesnou oblast.
- [x] #4 Binární payload je omezen a testy zahrnou SSH, reconnect a kompatibilitu s poznámkami z desktopu.

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

Build image review from existing bounded binary diff RPC, preserving original/changed sides and image region comments; add zoom, coordinate selection/refinement, CRUD and prompt delivery; verify reconnect, SSH and legacy payload behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Image review uses the bounded binary diff payload, supports original/changed sides, unavailable states, zoom, drag-to-select percentage regions, accessible coordinate steps, and comment CRUD through the existing review controller. Focused rendered interaction, region math, RPC compatibility, reconnect and session tests pass; mobile typecheck passes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Implemented mobile image diff review with stable percentage annotations and agent delivery, verified by focused tests and typecheck.
<!-- SECTION:FINAL_SUMMARY:END -->
