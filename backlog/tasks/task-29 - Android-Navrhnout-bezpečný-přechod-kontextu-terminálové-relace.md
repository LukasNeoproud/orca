---
id: TASK-29
title: 'Android: Navrhnout bezpečný přechod kontextu terminálové relace'
status: To Do
assignee: []
created_date: '2026-09-23 10:50'
labels: []
dependencies:
  - TASK-28
references:
  - src/renderer/src/components/terminal-pane/use-agent-context-transition.ts
  - src/main/runtime/rpc/methods/agent-context.ts
  - docs/reference/remote-wire-compatibility.md
priority: low
type: spike
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Současný přechod terminálové relace spoléhá na přesný desktopový pane, který převezme a restartuje proces. Při ovládání pouze z Androidu nebo z headless hostu tak chybí vlastník finální akce. Před implementací je nutný ověřený návrh hostem řízené náhrady.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Návrh určí vlastníka procesu, přesnou identitu terminálu a postup claim/complete bez lokálního fallbacku při odpojení SSH nebo paired hosta.
- [ ] #2 Popíše obnovu po pádu a nejistém doručení bez druhého terminálu či ztráty vstupu, včetně vazby na existující tab a autorizační rozsah.
- [ ] #3 Obsahuje scénáře a kontraktní testy pro desktop, Android a headless host a vyhodnotí kompatibilitu různých verzí klienta a hosta.
<!-- AC:END -->
