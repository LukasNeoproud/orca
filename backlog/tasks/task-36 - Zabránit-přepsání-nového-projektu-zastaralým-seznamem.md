---
id: TASK-36
title: 'Zabránit přepsání nového projektu zastaralým seznamem'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/src/components/use-new-workspace-repositories.ts
priority: medium
type: bug
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Pomalá původní odpověď `repo.list` může po přidání projektu přepsat čerstvě načtený seznam a odznačit nově vybraný projekt. Starší odpovědi nesmí měnit stav formuláře.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Po dokončení refresh se starší úvodní `repo.list` ignoruje.
- [x] #2 Test pokryje opačné pořadí dokončení požadavků.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Opraveno v pracovním stromu po review změn za posledních 48 hodin; cílené regresní testy a typové kontroly prošly.
<!-- SECTION:NOTES:END -->
