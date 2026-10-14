---
id: TASK-20
title: 'Android: Začít úkol Backlogu a pokračovat v navázané konverzaci'
status: Done
assignee: []
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 14:42'
labels: []
dependencies:
  - TASK-19
references:
  - src/main/runtime/rpc/methods/backlog.ts
  - src/shared/backlog-task-association.ts
  - docs/reference/backlog-integration.md
priority: medium
type: feature
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Desktop dovede předat aktuální zadání úkolu agentovi a uložit vazbu na konverzaci. Telefon má nabídnout stejné pokračování bez opakovaného odeslání po nejistém výsledku, včetně terminálových a strukturovaných relací.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Z detailu úkolu lze zvolit workspace na stejném projektu a execution hostu a novou nebo existující podporovanou konverzaci.
- [x] #2 Před odesláním se načte aktuální název, popis a akceptační kritéria; vazba na konverzaci se uchová a Continue otevře správnou relaci bez opětovného poslání zadání.
- [x] #3 Potvrzené strukturované odeslání a neověřené terminálové doručení jsou rozlišeny; po timeoutu či reconnectu se zadání automaticky neposílá znovu.
- [x] #4 Starší host, folder workspace a neověřitelný SSH host mají bezpečný, srozumitelný výsledek.

<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Detail úkolu nabízí bezpečné spuštění i pokračování navázané strukturované nebo terminálové konverzace. Načítá aktuální obsah zadání, ukládá vazbu a neodesílá automaticky znovu po nejistém doručení; testováno v cílené sadě.
<!-- SECTION:FINAL_SUMMARY:END -->
