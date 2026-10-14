---
id: TASK-18
title: 'Android: Zobrazit volby Codexu, kontext a rychlost odpovědí'
status: Done
assignee: []
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 14:42'
labels: []
dependencies: []
references:
  - mobile/src/session/use-mobile-structured-agent-options.ts
  - mobile/src/session/MobileNativeChatMessage.tsx
  - src/shared/agent-session-wire.ts
  - docs/reference/chat-generation-speed.md
priority: medium
type: enhancement
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Desktop nově ukazuje skutečný stav voleb Codexu, využití kontextu a metriky jednotlivých odpovědí. Android již dostává model, režim a generovací metadata, ale část údajů nezobrazuje a vlastní stav oprávnění může chybně označit za nenastavený.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Mobil ukazuje providerem hlášený vlastní stav oprávnění a po přijaté změně přečte potvrzené hodnoty; odmítnutá či zastaralá odpověď nepřepíše aktivní relaci.
- [x] #2 U dokončené odpovědi se ukáže známý model, režim a odhad tok/s; při neúplných datech se rychlost nevymýšlí.
- [x] #3 Živý přehled kontextu a týdenní kvóty se zobrazuje jen na hostu s příslušnou schopností a po reconnectu nezůstávají zastaralé hodnoty.
- [x] #4 Testy pokrývají vlastní oprávnění, chybějící metadata, změnu relace a starší host.

<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Android nyní zobrazuje potvrzený stav voleb Codexu, známý model/režim a rychlost dokončené odpovědi, využití kontextu a týdenní kvótu jen s podporou hosta. Testy pokrývají starší host, reconnect a neúplná metadata.
<!-- SECTION:FINAL_SUMMARY:END -->
