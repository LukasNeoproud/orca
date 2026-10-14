---
id: TASK-43
title: 'Sloučit souběžnou přípravu pokračování'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - src/main/codex/codex-continuation-service.ts
priority: medium
type: bug
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Dva klienti mohou před uložením kandidáta oba projít kontrolou checkpointu a vytvořit dvě kopie i dvě kompakce.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Ověřit podezření proti skutečnému úložišti.

<!-- AC:END -->

## Review Resolution

Nález vyvrácen při nezávislé kontrole: `store.put` zapisuje do Map synchronně před prvním await. Mezi `findCheckpoint` a tímto zápisem není asynchronní mezera. Souběžná volání proto vidí stejný kandidát. Navržená změna služby byla odstraněna.
