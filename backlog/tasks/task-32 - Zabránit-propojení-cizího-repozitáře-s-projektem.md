---
id: TASK-32
title: 'Zabránit propojení cizího repozitáře s projektem při nastavení hosta'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - src/main/project-host-setup-link.ts
priority: high
type: bug
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Při importu existující složky na jiném hostu může propojení projektu přepsat identitu checkoutu jiného projektu. Následné založení workspace pak může použít kód z nesprávného repozitáře. Import musí odmítnout už rozpoznanou vzdálenou nebo jinou lokální identitu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Konfliktní GitHub, GitLab a host-local identita se odmítne před změnou registrace.
- [x] #2 Dosud nerozpoznaný checkout lze stále připojit k vybranému projektu.
- [x] #3 Test pokryje chybné propojení dvou GitHub projektů a generické Git identity.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Opraveno v pracovním stromu po review změn za posledních 48 hodin; cílené regresní testy a typové kontroly prošly.
<!-- SECTION:NOTES:END -->
