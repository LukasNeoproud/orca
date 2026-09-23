---
id: TASK-19
title: 'Android: Číst úkoly Backlog.md a otevřít jejich detail'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 11:49'
labels: []
dependencies: []
references:
  - src/main/runtime/rpc/methods/backlog.ts
  - src/shared/backlog-types.ts
  - mobile/src/components/MobileMarkdown.tsx
  - docs/reference/backlog-integration.md
priority: medium
type: feature
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog.md je dostupný na execution hostu a desktop nabízí seznam, hledání, řazení a detail. Na telefonu tato část zcela chybí. První mobilní verze má zpřístupnit přehled bez změn úkolů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workspace na podporovaném hostu nabízí seznam Backlog.md s hledáním, filtrem stavu a řazením podle pořadí, ID a priority.
- [ ] #2 Detail čitelně zobrazí Markdown popisu a stav akceptačních kritérií; prázdný, nedostupný a nekompatibilní Backlog mají odlišné stavy.
- [ ] #3 Odběr snapshotu se ukončí po opuštění obrazovky; odpojený SSH nebo paired host nevede k místnímu čtení stejnojmenné složky.
- [ ] #4 Funkce je skrytá nebo vysvětlená při chybějící schopnosti hosta a funguje i pro folder workspace.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Zmapovat mobilní navigaci a dostupný Backlog RPC kontrakt. 2. Přidat capability-gated seznam a detail s lease životním cyklem, hledáním, filtrem a řazením. 3. Ověřit folder/SSH host, odpojení, starší runtime a cílené mobilní testy.
<!-- SECTION:PLAN:END -->
