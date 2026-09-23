---
id: TASK-23
title: 'Android: Pokračovat v nečinné konverzaci s novým kontextem'
status: To Do
assignee: []
created_date: '2026-09-23 10:50'
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
- [ ] #1 U podporované hostem vlastněné Codex relace Android ukáže dostupné varianty a srozumitelně odliší původní, kompaktní, referenční a čisté pokračování.
- [ ] #2 Výběr připravené varianty převezme přesnou relaci a po nejasném výsledku nevytvoří duplicitní proces ani neztratí rozepsaný vstup.
- [ ] #3 SSH/WSL relace, nepodporovaný provider a starší host nedostanou nefunkční akci; původní relace zůstává dohledatelná.
- [ ] #4 Testy pokrývají zrušení, souběžné otevření a reconnect během přípravy a vytvoření.
<!-- AC:END -->
