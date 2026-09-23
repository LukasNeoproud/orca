---
id: TASK-25
title: 'Android: Přenosné odbočky z ověřené SSH historie'
status: To Do
assignee: []
created_date: '2026-09-23 10:50'
labels: []
dependencies:
  - TASK-24
references:
  - src/main/runtime/rpc/methods/portable-conversation-source.ts
  - src/main/runtime/rpc/methods/portable-conversation-branch.ts
  - docs/reference/conversation-branching.md
priority: low
type: feature
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Historie přímého SSH může vznikat v jiném runtime než mobilní klient. Desktop pro ni používá ověřené stránkování transcriptu a odděluje přenos historie od cíleného kontextu. Mobilní běžný chat takový důkaz zdroje neuchovává.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mobil načítá zdrojové stránky a vybranou odpověď přes vlastnící execution host s ověřením identity transcriptu a kurzoru.
- [ ] #2 Uživatel rozliší historický přenos od cíleného kontextu a před spuštěním zkontroluje výsledné zadání.
- [ ] #3 Odpojený host, přepsaný transcript, nejednoznačná historie a neznámé doručení nevedou k lokálnímu fallbacku ani opakovanému spuštění.
- [ ] #4 Starší host funkci nenabídne; folder workspaces a párované runtime nepletou stejně pojmenované SSH cíle.
<!-- AC:END -->
