---
id: TASK-23
title: 'Android: Pokračovat v nečinné konverzaci s novým kontextem'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 12:43'
labels: []
dependencies:
  - TASK-16
references:
  - src/main/runtime/rpc/methods/conversation-continuation.ts
  - mobile/src/session/mobile-structured-agent-session-launch.ts
  - src/shared/conversation-continuation.ts
priority: medium
type: feature
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Desktop nabízí u dokončené nečinné Codex konverzace ponechání původní relace, pokračování z připraveného kompaktního kontextu, referenční předání nebo nový začátek. Mobilní spuštění strukturované relace neumí využít připravený resumeFrom.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 U podporované hostem vlastněné Codex relace Android ukáže dostupné varianty a srozumitelně odliší původní, kompaktní, referenční a čisté pokračování.
- [x] #2 Výběr připravené varianty převezme přesnou relaci a po nejasném výsledku nevytvoří duplicitní proces ani neztratí rozepsaný vstup.
- [x] #3 SSH/WSL relace, nepodporovaný provider a starší host nedostanou nefunkční akci; původní relace zůstává dohledatelná.
- [x] #4 Testy pokrývají zrušení, souběžné otevření a reconnect během přípravy a vytvoření.

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

Extend the TASK-16 structured history flow with host-gated continuation choices, prepared resumeFrom adoption, cancellation and reconnect-safe operation identity; test unsupported and SSH/WSL cases.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Idle local Codex history offers original, compact copy, reference and fresh actions behind negotiated capabilities. Prepared compact candidates are claimed once and launched with exact resumeFrom; reference drafts are host/session-scoped and retained on unknown create. SSH/WSL/older hosts fall back to original flow. Worker verified 117 focused tests, lint and diff checks; mobile typecheck passes after shared integration.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Implemented safe Android conversation continuation choices with one-time compact claim and bounded reference draft recovery.
<!-- SECTION:FINAL_SUMMARY:END -->
