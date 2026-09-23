---
id: TASK-15
title: 'Android: Zachovat obrazové anotace při čtení a ukládání'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-23 10:49'
updated_date: '2026-09-23 11:49'
labels: []
dependencies: []
references:
  - mobile/src/session/mobile-diff-comments.ts
  - mobile/src/session/use-mobile-session-diff-comments.ts
  - src/shared/diff-comment-types.ts
priority: high
type: bug
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Desktop nyní ukládá poznámky ke konkrétní oblasti obrázku. Android při načtení mění jejich typ na běžnou diff poznámku a zahazuje souřadnice; pozdější zápis jiné poznámky může původní anotaci poškodit. Opravit datový kontrakt před zavedením mobilního obrazového review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Obrazová poznámka načtená z worktree si zachová zdroj image, imageRegion, identitu diffu a ostatní podporovaná pole při následném uložení z Androidu.
- [ ] #2 Přidání, úprava nebo odstranění jiné poznámky na mobilu nezmění existující obrazové anotace vytvořené na desktopu.
- [ ] #3 Porovnání doručených poznámek a starší uložené formáty neztratí oblast ani nezpůsobí duplicitní odeslání; cílené testy pokryjí round trip a smíšené verze.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Ověřit aktuální formát obrazových poznámek a smíšené verze. 2. Zachovat všechna pole při načtení, změně a zápisu z mobilu. 3. Přidat regresní round-trip testy a ověřit související mobilní typy.
<!-- SECTION:PLAN:END -->
