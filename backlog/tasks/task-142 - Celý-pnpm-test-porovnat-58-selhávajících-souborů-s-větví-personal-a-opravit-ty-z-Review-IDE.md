---
id: TASK-142
title: >-
  Celý pnpm test: porovnat 58 selhávajících souborů s větví personal a opravit
  ty z Review IDE
status: Done
assignee: []
created_date: '2026-11-19T22:34:00Z'
updated_date: '2026-11-19T23:24:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
priority: high
type: task
ordinal: 150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Při přípravě akceptace M1 (commit 504dd269e3, Bun 1.4.2) selhalo v celém pnpm test 58 souborů (156 testů), i při samostatném běhu. Žádný z těch testovacích souborů se na větvi review-ide proti personal nezměnil. Než uživatel milník přijme, má být doložené, která selhání jsou starší než Review IDE.

### Podklady

- Seznam souborů: ~/.cache/orca-review-ide/m1-akceptace/selhane-testy-504dd269e3.txt, výpis běhu vedle něj.
- Skupiny: config/scripts/mobile-web-app-*.test.mjs (25), src/main/opencode/hook-plugin-* (handler is not a function), agent-launch-* a agent-session-* (SQLITE_BUSY podle TASK-112), daemon shell-ready, orcad-runtime-entry-artifacts (chybí položka v ORCAD_ARTIFACTS), vitest-node-runtime-boundary (chce Node 24), host-operation-ownership (androidAppRun.*).
- Poznámky TASK-112.

### Rozsah

- Porovnání proti personal v samostatném git worktree mimo pracovní strom (git worktree add do ~/.cache/orca-review-ide), po skončení ho odeber. Pracovní strom review-ide při porovnávání neměň.
- Opravy jen toho, co způsobila větev review-ide.

### Omezení

- Bez push. Bun podle config/.bun-version.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 U každého z 58 souborů je zapsané, jestli selhává i na personal se stejným Bunem a Node
- [x] #2 Selhání, která na personal nejsou, jsou opravená nebo má každé vlastní tiket s příčinou
- [x] #3 Selhání z prostředí (verze Node, Bunu, chybějící sestavení) mají zapsanou příčinu a příkaz, se kterým projdou
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker 2026-11-19): personal = merge-base review-ide (67efdc8f57). Worktree personal do ~/.cache/orca-review-ide/t142-personal, pnpm install --frozen-lockfile, stejných 58 souborů s Bunem 1.4.2 a Node 22.21.1 v obou stromech; u rozdílů hledat příčinu ve změnách review-ide a opravit; prostředí (Node 24, artefakty) zapsat s příkazem. Worktree po skončení odebrat.

Průběh (worker 2026-11-20): personal worktree v ~/.cache/orca-review-ide/t142-personal (pnpm install --frozen-lockfile, v mobile/ také). Běh 58 souborů s Bunem 1.4.2 a Node 22.21.1 se stejným prostředím na obou větvích: shodně 33 souborů a 152 testů selhává (stejné názvy testů). Rozdíly proti logu akceptace: 24 mobile-web-app souborů chybí prohlížeče Playwright 1.63 (chromium_headless_shell-1243, webkit-2359; v ~/Library/Caches/ms-playwright je jen 1194) - s PLAYWRIGHT_BROWSERS_PATH=~/.cache/orca-review-ide/ms-playwright prochází na obou větvích 24/24. useIpcEvents-lifecycle selhával jen na review-ide (nový posluchač ui.onOpenAppMenuView z TASK app menu) - opraveno v testu. pty-pane-materialization-race selhává při plném paralelním běhu na obou větvích, samostatně prochází (vi.waitFor 1 s pod zátěží). Zbývá: běh v čistém prostředí (bez ORCA_*/CLAUDE_* proměnných z terminálu Orky) a s Node 24 podle engines.

Výsledek porovnání (worker 2026-11-20). Všechny běhy: Bun 1.4.2, stejných 58 souborů najednou, review-ide = pracovní strom (f09daac0e1 + oprava níže), personal = 67efdc8f57 v dočasném worktree (odebrán). Logy: ~/.cache/orca-review-ide/t142-*.log|txt.
Výchozí běh z terminálu Orky (Node 22.21.1, prohlížeče doplněné): shodně 33 souborů / 152 testů na obou větvích, stejné názvy testů. Čisté prostředí + Node 24.21.0: shodně 12 souborů / 38 testů na obou větvích, stejné názvy testů.

A) Selhávalo jen na review-ide (1 soubor) - opraveno:
- src/renderer/src/hooks/useIpcEvents-lifecycle.test.ts: app menu views přidaly posluchač ui.onOpenAppMenuView (settings-sidebar-ipc-bridge.ts); test ho nečekal. Doplněn do obou očekávaných seznamů. Personal: prochází.

B) Prostředí (selhávají na obou větvích, projdou s příkazem níže; 46 souborů):
- 24x config/scripts/mobile-web-app-*.test.(mjs|ts) (agent-history, browser-pane, clipboard-image-resize, drawer, files, frame-budget-sweep, handoff-grants, held-press, html-preview, media-preview, mermaid, native-chat-visual-links, native-parity, render, rich-markdown, safe-area, session, session-terminal-init, source-control, stack-transition, tasks, terminal-live-input, terminal, working-spinner): playwright-core 1.63 chce chromium_headless_shell-1243, chromium-1243 a webkit-2359, v ~/Library/Caches/ms-playwright je jen 1194. Na personal bez mobile/node_modules se jen přeskočí. Stažené do ~/.cache/orca-review-ide/ms-playwright; s PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/orca-review-ide/ms-playwright 24/24 na obou větvích.
- 6x src/main/opencode/hook-plugin-{background-child-completion,child-attention,fail-open-ownership,lifecycle-delivery,message-part-throttle,run-process-session-start}.test.ts: proměnná ORCA_OPENCODE_AGENT=opencode2 z terminálu Orky; plugin pak vrátí {} bez event. Projdou s env -u ORCA_OPENCODE_AGENT.
- src/main/agent-hooks/grok-replay-guard.test.ts: proměnná CLAUDE_JOB_DIR (worker běží jako background job Claude Code); hook skript pak nic nedoručí. Projde s env -u CLAUDE_JOB_DIR.
- 14x Node 22 místo Node 24 (engines.node = 24): config/scripts/vitest-node-runtime-boundary.test.ts, src/main/ai-vault-search/session-search-fts5-contract.test.ts, src/main/native-chat/agent-session-wire/structured-agent-session-{acquisition-options,crash-mid-start,settled-attach-retry}.test.ts, src/main/persistence/profile-state/profile-state-crash-recovery.test.ts, src/main/runtime/agent-session-{conversation-clear-commit,record-store,released-reservation-replay,store-transactions}.test.ts, src/main/runtime/rpc/methods/agent-launch-{instant-tab,replay,restart-replay}.test.ts, tests/e2e/agent-launch-setup-choice.unit.test.ts (node:sqlite / SQLITE_BUSY, FTS5 a časové limity v projektu node-runtime). Projdou s Node 24 v PATH.
- src/main/ipc/pty-pane-materialization-race.test.ts: při 58 souborech najednou vi.waitFor (1 s) nestihne, na obou větvích; samostatně prochází 3/3.
Příkaz (skript ~/.cache/orca-review-ide/t142-clean-run.sh <strom> <node-bin> <log> <seznam>): env -i HOME="$HOME" USER="$USER" SHELL=/bin/zsh TMPDIR="$TMPDIR" LANG=en_US.UTF-8 PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/orca-review-ide/ms-playwright" PATH="$HOME/.cache/orca-review-ide/tools/bun-1.4.2/bun-darwin-aarch64:$HOME/.nvm/versions/node/v24.21.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" node config/scripts/run-vitest.mjs run --config config/vitest.config.ts --reporter=verbose <soubory>

C) Selhávají na personal i v čistém prostředí s Node 24 (11 souborů, mimo Review IDE, neopravováno):
- config/scripts/macos-terminal-host-bundle.test.mjs: kontrola hlásí require yaml mimo helper (node_modules/yaml/i.js).
- src/main/daemon/shell-ready.test.ts, src/main/daemon/repro-13767-shell-ready-marker-lost-to-exec.test.ts, src/main/shell-startup-feature-channel.test.ts: skutečný zsh/bash v PTY na tomto Macu (macOS 27) nevydá shell-ready značku / nevrátí PATH; s prázdným HOME selhávají také. Příčina nedohledána.
- src/main/native-chat/agent-session-journal/journal-closed-sets.test.ts: snapshot uzavřených množin se změnil bez zvýšení verze řádku.
- src/main/orcad/orcad-runtime-entry-artifacts.test.ts: claude-conversation-fork-worker-entry.js chybí v ORCAD_ARTIFACTS (větvení konverzace z personal).
- src/main/runtime/structured-agent-launch-parity.test.ts: snapshot nemá CLAUDE_CODE_ENABLE_TODO_TOOLS (commit 18a9d754d5 na personal).
- src/shared/host-operation-ownership.test.ts: androidAppRun.* bez klasifikace (Android app run z personal).
- tests/e2e/cross-version-wire/cross-version-agent-session-wire.unit.test.ts: 43 metod agent* místo 42.
- tests/e2e/cross-version-wire/cross-version-web-session-pairing.unit.test.ts: vydaný host hlásí pairing.device-key-ephemeral.v1.
- tests/e2e/cross-version-wire/runtime-source-fence-downgrade.unit.test.ts: starý host odmítne požadavek s očekávaným runtime (ok: false).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Z 58 selhávajících souborů způsobila větev review-ide jediný (useIpcEvents-lifecycle: nový posluchač ui.onOpenAppMenuView chyběl v očekávaném seznamu); opraveno. Zbylých 57 selhává stejně na personal: 46 z prostředí (Node 22 místo 24, proměnné terminálu Orky a background jobu, chybějící prohlížeče Playwright 1.63, jeden časový limit pod zátěží), 11 z kódu personal (orcad artifacts, androidAppRun ownership, snapshoty, cross-version-wire, testy shellu na macOS 27, macos-terminal-host-bundle). V čistém prostředí s Node 24 a Bunem 1.4.2 selhává na obou větvích shodně 12 souborů / 38 testů. Skript čistého běhu: ~/.cache/orca-review-ide/t142-clean-run.sh.
<!-- SECTION:FINAL_SUMMARY:END -->
