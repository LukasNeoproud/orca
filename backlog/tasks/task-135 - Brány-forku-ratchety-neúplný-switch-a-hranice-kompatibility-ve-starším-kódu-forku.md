---
id: TASK-135
title: >-
  Brány forku: ratchety, neúplný switch a hranice kompatibility ve starším kódu
  forku
status: Done
assignee: []
created_date: '2026-11-19T15:37:00Z'
updated_date: '2026-11-19T16:51:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-1
dependencies: []
type: bug
ordinal: 16020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Část opravy starších nálezů `pnpm lint` ve forku před akceptací M1 (decision-12); navazuje na TASK-112.

### Rozsah

audit:code-quality:type-aware: neúplný switch v src/main/claude/claude-permission-suggestion-summary.ts. check:focus-read-ratchet: AndroidAppRunButton.tsx, TerminalPaneBranchMenu.tsx, lib/conversation-branch-members.ts. check:layout-writer-ratchets: android-app-run/use-android-build-directory.ts, store/slices/editor/actions/git-graph-tab-actions.ts. check:compat-boundary-imports: mobile/src/session/mobile-conversation-branch-launch.ts (stav z TASK-110, 2026-11-18). Nejdřív ověř aktuální stav spuštěním kontrol.

### Omezení

- Chování dotčených funkcí (chat, mobilní aplikace, spouštění Androidu, větvení konverzace) se nemění.
- Žádná výjimka z pravidel ani zvýšení baseline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 audit:code-quality:type-aware, check:focus-read-ratchet, check:layout-writer-ratchets a check:compat-boundary-imports prochází a celé pnpm lint prochází, nebo je u každého zbylého nálezu zapsané, proč zůstal
- [x] #2 Chování dotčených funkcí se nemění; jejich testy prochází
- [x] #3 Žádná baseline ratchetu se nezvyšuje a nepřibyla výjimka z pravidel
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker 2026-11-19): stav ověřen spuštěním, odpovídá rozsahu tiketu (1+3+2+1 nálezů). Switch: vyjmenovat removeRules a removeDirectories (vrací null jako dosud), neznámý typ z CLI dál null za switchem; test na tvar nabídky. Focus-read: AndroidAppRunButton a TerminalPaneBranchMenu přejdou z resolverů s fallbackem na Active Server na resolveOwner (upstreamový resolver jen z řádků, #24067); conversation-branch-members aktivuje kartu chatu podle vlastníka bez fallbacku na focus (nový list lib/conversation-branch-host.ts). Layout-writer: use-android-build-directory předává activeTabId zkratkou (je to čtení, ne zápis); git-graph-tab-actions otevírá kartu přes obecnou akci openFile, která už mód git-graph zná, místo vlastního zápisu openFiles. Compat: mobilní draft klíč bez importu z old-client (id řádku chatu agent-session:<id>, stejně jako jinde v upstreamu). Bez změny baseline a bez výjimek.

Hotovo (worker): všech 7 nálezů opraveno; audit:code-quality:type-aware, check:focus-read-ratchet, check:layout-writer-ratchets a check:compat-boundary-imports prochází, baseline beze změny. Nové listy: android-app-run/android-app-run-host.ts, lib/conversation-branch-host.ts (+ testy), test claude-permission-suggestion-summary. Zbývá: tc, testy dotčených složek, brána změněných řádků, anti-slop, celé pnpm lint a zápis zbylých nálezů, ověření v UI.

Ověřeno (worker 2026-11-19): celé pnpm lint kód 0, žádný zbylý nález; baseline v config/ beze změny, žádný disable komentář. pnpm tc 0, mobilní tsc 0; oxlint změněných 0; check:code-quality:changed 0 nových nálezů. Testy po složkách: src/main/claude 200 souborů, store/slices 375, renderer lib 704, android-app-run, conversation-branch prochází; terminal-pane 548/548 souborů prochází, ale vitest končí kódem 1 kvůli 3 unhandled rejection (store.revealInExplorer chybí v mocku testů terminal-link-*, padá i samostatně, z commitu c5f3897e4c, mimo tiket); mobile/src/session 265/266, jediné selhání známé mobile-structured-composer-command. Nové testy git graph prochází i proti původní implementaci. E2E skrytě (ORCA_BACKGROUND_LAUNCH=1, electron-headless, 1 worker): app-menu-review-views prochází (snímek /tmp/task135/shots/menu-review-git-graph.png) a dočasný spec ukázal Run app u lokálního Android workspace a jeho skrytí jinde (/tmp/task135/shots/android-run-button.png), spec smazán. Odchylka: kde dřív o hostiteli rozhodl Active Server (workspace bez vlastníka v řádcích, nebo neoznačený řádek při jednom zaměřeném serveru), rozhoduje teď jen řádek, jako upstreamové resolveOwner (#24067).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Celé pnpm lint prochází. Neúplný switch doplněn, focus-read a layout-writer ratchety splněny směrováním podle řádků vlastníka (resolveOwner jako upstream) místo Active Serveru, karta Git graph se otevírá obecnou akcí openFile, mobilní větvení už neimportuje z old-client. Chování se mění jen u workspace bez přiřazeného hostitele; koordinátor odchylku přijal jako architektonické rozhodnutí ve směru upstreamu.
<!-- SECTION:FINAL_SUMMARY:END -->
