---
id: TASK-142
title: >-
  Celý pnpm test: porovnat 58 selhávajících souborů s větví personal a opravit
  ty z Review IDE
status: To Do
assignee: []
created_date: '2026-11-19T22:34:00Z'
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
- [ ] #1 U každého z 58 souborů je zapsané, jestli selhává i na personal se stejným Bunem a Node
- [ ] #2 Selhání, která na personal nejsou, jsou opravená nebo má každé vlastní tiket s příčinou
- [ ] #3 Selhání z prostředí (verze Node, Bunu, chybějící sestavení) mají zapsanou příčinu a příkaz, se kterým projdou
<!-- AC:END -->
