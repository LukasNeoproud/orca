---
id: TASK-29
title: 'Android: Navrhnout bezpečný přechod kontextu terminálové relace'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 14:42'
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

- [x] #1 Návrh určí vlastníka procesu, přesnou identitu terminálu a postup claim/complete bez lokálního fallbacku při odpojení SSH nebo paired hosta.
- [x] #2 Popíše obnovu po pádu a nejistém doručení bez druhého terminálu či ztráty vstupu, včetně vazby na existující tab a autorizační rozsah.
- [x] #3 Obsahuje scénáře a kontraktní testy pro desktop, Android a headless host a vyhodnotí kompatibilitu různých verzí klienta a hosta.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Design documents host/process-owner operation identity (execution host, workspace, tab/leaf/pane, PTY incarnation and provider generation), durable claim/complete and input fence. Recovery distinguishes live/unverifiable/exited and forbids local fallback or second terminal after SSH/paired uncertainty. Mixed-version compatibility and desktop/Android/headless contract and fault-injection test matrix are specified. Source mapping and local doc links were verified; this spike deliberately does not enable terminal transitions on Android.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Návrh hostem řízeného přechodu terminálové relace je dokončen v docs/reference/mobile-terminal-context-transition.md. Pokrývá identity, claim/complete, obnovu po selhání a matici kompatibility; závislý strukturovaný klient TASK-28 je implementován.
<!-- SECTION:FINAL_SUMMARY:END -->
