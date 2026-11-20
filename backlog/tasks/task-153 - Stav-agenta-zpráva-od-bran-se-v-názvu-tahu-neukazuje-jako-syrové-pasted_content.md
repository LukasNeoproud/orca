---
id: TASK-153
title: >-
  Stav agenta: zpráva od bran se v názvu tahu neukazuje jako syrové
  pasted_content
status: To Do
assignee: []
created_date: '2026-11-20T13:05:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies:
  - TASK-139
priority: low
type: bug
ordinal: 207670
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Při TASK-139 hlásil hook u vloženého textu prompt tahu začínající `<pasted_content id=…>`. Viděno jen v datech stavu; v rozhraní neověřeno.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Zjištěno a zapsáno, kde se prompt tahu z hooku zobrazuje (sidebar, karta workspace, mobil) a jestli tam jde vidět text začínající <pasted_content id=…>
- [ ] #2 Kde je vidět, ukazuje se čitelný text zprávy bez obalu; pravidlo je na jednom místě u čtenářů stavu, ne v úložišti stavu
- [ ] #3 Test a snímek ze skrytého okna
<!-- AC:END -->
