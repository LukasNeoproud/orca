---
id: TASK-24
title: 'Android: Větvit strukturovanou konverzaci od dokončené odpovědi'
status: To Do
assignee: []
created_date: '2026-09-23 10:50'
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
- [ ] #1 U způsobilé dokončené odpovědi lze zvolit cílový workspace a připravit odbočku; běžící nebo nepřesně doložená hranice akci nenabízí.
- [ ] #2 Příprava, spuštění a návrat výsledku mají viditelné oddělené stavy; nejistý provider fork se automaticky neopakuje.
- [ ] #3 Vztah rodič–potomek a zdrojový bod přežije restart a jde z mobilu otevřít bez checkoutu či resetu souborů.
- [ ] #4 Android hlásí schopnost větvení až s hotovým klientem; starší host a opakované doručení nevytvoří duplicitní odbočku.
<!-- AC:END -->
