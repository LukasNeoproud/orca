---
id: TASK-28
title: 'Android: Stav a řízení strukturovaných přechodů kontextu'
status: Done
assignee: []
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 14:42'
labels: []
dependencies:
  - TASK-16
references:
  - src/main/runtime/rpc/methods/agent-context.ts
  - src/main/runtime/orca-runtime-restore-structured-agent-session-tabs-once.ts
  - docs/reference/ssh-execution-boundary.md
priority: medium
type: feature
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Agent může požádat runtime o přechod do nové strukturované relace. Host už umí vyměnit strukturovanou záložku, mobil ale neukazuje důvod, stav ani zrušení požadavku. Ovládání se nesmí plést s terminálovým přechodem, který zatím vyžaduje desktopový pane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Mobil ukazuje důvod, režim a průběh požadavku v relaci, jíž se týká, a dovoluje zrušit pouze čekající požadavek.
- [x] #2 Po potvrzeném přechodu se zobrazí nová strukturovaná záložka a původní zůstane dohledatelná; timeout nebo odpojení neznamená chybně dokončeno.
- [x] #3 Přístup je omezen na vlastnící relaci a hosta, po reconnectu se stav obnoví a starší host ukáže explicitně nepodporováno.
- [x] #4 Terminálový přechod není na mobilu nabízen, dokud nemá bezpečný hostem řízený kontrakt.

<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Mobil zobrazuje a obnovuje hostem vlastněný stav strukturovaného přechodu kontextu, umožňuje zrušit jen čekající požadavek a naviguje na potvrzenou novou relaci. Starší host má explicitní nepodporovaný stav; terminálový přechod zůstává oddělen podle návrhu TASK-29.
<!-- SECTION:FINAL_SUMMARY:END -->
