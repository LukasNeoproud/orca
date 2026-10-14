---
id: TASK-24
title: 'Android: Větvit strukturovanou konverzaci od dokončené odpovědi'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 14:42'
labels: []
dependencies:
  - TASK-16
references:
  - src/shared/agent-session-branch.ts
  - src/main/runtime/rpc/methods/structured-agent-session-branch-methods.ts
  - docs/reference/conversation-branching.md
priority: medium
type: feature
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Desktop umí z dokončené odpovědi vytvořit související konverzaci s přesným historickým bodem, uloženým vztahem a samostatným spuštěním. Na mobilu akce, příprava ani navigace mezi větvemi nejsou.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 U způsobilé dokončené odpovědi lze zvolit cílový workspace a připravit odbočku; běžící nebo nepřesně doložená hranice akci nenabízí.
- [x] #2 Příprava, spuštění a návrat výsledku mají viditelné oddělené stavy; nejistý provider fork se automaticky neopakuje.
- [x] #3 Vztah rodič–potomek a zdrojový bod přežije restart a jde z mobilu otevřít bez checkoutu či resetu souborů.
- [x] #4 Android hlásí schopnost větvení až s hotovým klientem; starší host a opakované doručení nevytvoří duplicitní odbočku.

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

Reuse the host branch preview/prepare/start/family RPC contract with capability negotiation; add mobile response action, target selection, immutable intent, visible prepare/start states and related-conversation navigation; verify no unknown fork replay and mixed-version behavior.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Android umí připravit a spustit odbočku od ověřené dokončené odpovědi a zobrazit vztahy i zdrojový bod. Capability je vyjednána s hostem, nejistý fork se neopakuje; testy modelu, RPC a UI prošly.
<!-- SECTION:FINAL_SUMMARY:END -->
