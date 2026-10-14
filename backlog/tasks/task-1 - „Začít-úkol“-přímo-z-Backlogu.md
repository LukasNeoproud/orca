---
id: TASK-1
title: „Začít úkol“ přímo z Backlogu
status: To Do
assignee: []
created_date: '2026-09-16 12:17'
labels: []
dependencies: []
references:
  - src/renderer/src/components/right-sidebar/BacklogPanel.tsx
  - src/renderer/src/lib/new-workspace.ts
documentation:
  - docs/reference/backlog-integration.md
type: feature
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Propojit úkol v Backlog.md s pracovním prostředím a konverzací agenta. Z detailu úkolu umožnit vybrat agenta a existující workspace, případně vytvořit nový worktree. Agent dostane popis úkolu a acceptance criteria. Uložená vazba umožní později pokračovat v příslušné konverzaci. Navázat na existující vytváření workspace a předávání kontextu propojeného úkolu. První verze zahrnuje předání zadání a návrat k práci; automatická synchronizace stavů Backlogu je mimo rozsah.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Detail úkolu v Backlog panelu nabízí akci Začít úkol s výběrem agenta a existujícího workspace nebo nového worktree.
- [ ] #2 Spuštěný agent dostane ID, název, popis a akceptační kritéria vybraného úkolu.
- [ ] #3 Orca uchová vazbu mezi úkolem, workspace a konverzací; opětovné otevření úkolu nabízí Pokračovat v příslušné konverzaci.
- [ ] #4 Vazba rozlišuje projekt a execution host; shodná ID úkolů v různých projektech se nezaměňují.
- [ ] #5 Funkce respektuje execution host workspace včetně SSH a podporuje existující folder workspaces bez požadavku na Git worktree.

<!-- AC:END -->
