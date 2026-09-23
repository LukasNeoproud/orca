---
id: TASK-18
title: 'Android: Zobrazit volby Codexu, kontext a rychlost odpovědí'
status: To Do
assignee: []
created_date: '2026-09-23 10:50'
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
- [ ] #1 Mobil ukazuje providerem hlášený vlastní stav oprávnění a po přijaté změně přečte potvrzené hodnoty; odmítnutá či zastaralá odpověď nepřepíše aktivní relaci.
- [ ] #2 U dokončené odpovědi se ukáže známý model, režim a odhad tok/s; při neúplných datech se rychlost nevymýšlí.
- [ ] #3 Živý přehled kontextu a týdenní kvóty se zobrazuje jen na hostu s příslušnou schopností a po reconnectu nezůstávají zastaralé hodnoty.
- [ ] #4 Testy pokrývají vlastní oprávnění, chybějící metadata, změnu relace a starší host.
<!-- AC:END -->
