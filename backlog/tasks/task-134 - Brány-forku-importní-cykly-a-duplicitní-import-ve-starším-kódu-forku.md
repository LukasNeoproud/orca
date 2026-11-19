---
id: TASK-134
title: 'Brány forku: importní cykly a duplicitní import ve starším kódu forku'
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
ordinal: 16010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Část opravy starších nálezů `pnpm lint` ve forku před akceptací M1 (decision-12); navazuje na TASK-112.

### Rozsah

audit:code-quality:native: 6 importních cyklů (claude-mods, mobilní aplikace) a 1 duplicitní import (stav z TASK-110, 2026-11-18). Nejdřív ověř aktuální stav spuštěním kontrol.

### Omezení

- Chování dotčených funkcí (chat, mobilní aplikace, spouštění Androidu, větvení konverzace) se nemění.
- Žádná výjimka z pravidel ani zvýšení baseline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm run audit:code-quality:native prochází bez chyb
- [ ] #2 Chování dotčených funkcí se nemění; jejich testy prochází
- [ ] #3 Žádná baseline ratchetu se nezvyšuje a nepřibyla výjimka z pravidel
<!-- AC:END -->
