---
id: TASK-135
title: >-
  Brány forku: ratchety, neúplný switch a hranice kompatibility ve starším kódu
  forku
status: To Do
assignee: []
created_date: '2026-11-19T15:37:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-1
dependencies: []
type: bug
ordinal: 16020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Část opravy starších nálezů `pnpm lint` ve forku před akceptací M1 (decision-12); navazuje na TASK-112.

### Rozsah

audit:code-quality:type-aware: neúplný switch v src/main/claude/claude-permission-suggestion-summary.ts. check:focus-read-ratchet: AndroidAppRunButton.tsx, TerminalPaneBranchMenu.tsx, lib/conversation-branch-members.ts. check:layout-writer-ratchets: android-app-run/use-android-build-directory.ts, store/slices/editor/actions/git-graph-tab-actions.ts. check:compat-boundary-imports: mobile/src/session/mobile-conversation-branch-launch.ts (stav z TASK-110, 2026-11-18). Nejdřív ověř aktuální stav spuštěním kontrol.

### Omezení

- Chování dotčených funkcí (chat, mobilní aplikace, spouštění Androidu, větvení konverzace) se nemění.
- Žádná výjimka z pravidel ani zvýšení baseline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 audit:code-quality:type-aware, check:focus-read-ratchet, check:layout-writer-ratchets a check:compat-boundary-imports prochází a celé pnpm lint prochází, nebo je u každého zbylého nálezu zapsané, proč zůstal
- [ ] #2 Chování dotčených funkcí se nemění; jejich testy prochází
- [ ] #3 Žádná baseline ratchetu se nezvyšuje a nepřibyla výjimka z pravidel
<!-- AC:END -->
