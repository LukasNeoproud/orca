---
id: TASK-19
title: 'Android: Číst úkoly Backlog.md a otevřít jejich detail'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 12:22'
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

- [x] #1 Workspace na podporovaném hostu nabízí seznam Backlog.md s hledáním, filtrem stavu a řazením podle pořadí, ID a priority.
- [x] #2 Detail čitelně zobrazí Markdown popisu a stav akceptačních kritérií; prázdný, nedostupný a nekompatibilní Backlog mají odlišné stavy.
- [x] #3 Odběr snapshotu se ukončí po opuštění obrazovky; odpojený SSH nebo paired host nevede k místnímu čtení stejnojmenné složky.
- [x] #4 Funkce je skrytá nebo vysvětlená při chybějící schopnosti hosta a funguje i pro folder workspace.

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Zmapovat mobilní navigaci a dostupný Backlog RPC kontrakt. 2. Přidat capability-gated seznam a detail s lease životním cyklem, hledáním, filtrem a řazením. 3. Ověřit folder/SSH host, odpojení, starší runtime a cílené mobilní testy.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Rendered panel, task-selection and lease lifecycle tests passed (7 mobile tests); host target and RPC allowlist tests passed (13 root tests); mobile typecheck passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Added capability-gated Backlog list/detail with search, filters, ordering and leased host snapshots; verified by mobile UI/lease tests and host RPC tests.
<!-- SECTION:FINAL_SUMMARY:END -->
