---
id: TASK-112
title: 'Brány forku: názvy se shape a Reflect.get ve starším kódu forku'
status: Done
assignee: []
created_date: '2026-11-18T22:36:00Z'
updated_date: '2026-11-19T15:50:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-1
dependencies: []
priority: low
type: bug
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Celé `pnpm lint` na forku neprojde kvůli nálezům ve starším kódu forku, který s Review IDE nesouvisí. Uživatel rozhodl opravit je před akceptací M1 (decision-12). Tiket je první ze tří částí; další jsou TASK-134 (importní cykly) a TASK-135 (ratchety a zbytek).

### Rozsah

Stav z 2026-11-18 (TASK-110), `audit:anti-slop`, 39 chyb: 33× názvy se `shape` v `native-chat/claude-mods` a v jednom testu mobilní aplikace, 5× `Reflect.get`, 1× parametr typu objekt. Nejdřív ověř aktuální stav spuštěním auditu.

### Mimo rozsah

- Importní cykly a duplicitní import: TASK-134.
- Ratchety, neúplný switch a hranice kompatibility: TASK-135.
- Přehled TODO (TASK-111).

### Omezení

- Chování dotčených funkcí (chat, mobilní aplikace) se nemění; jen přejmenování a typově bezpečná náhrada `Reflect.get`.
- Žádná výjimka z pravidel ani zvýšení baseline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm run audit:anti-slop prochází bez chyb
- [x] #2 Chování dotčených funkcí se nemění; jejich testy prochází
- [x] #3 Žádná baseline ratchetu se nezvyšuje a nepřibyla výjimka z pravidel
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Z TASK-115 (2026-11-19): pnpm test v mobile/ má 4 selhání mimo Review IDE, která padají i samostatně: src/mock-server-key-pair.test.ts, src/tasks/mobile-agent-launch-architecture.test.ts a src/session/mobile-structured-composer-command.test.ts. Příčinu nikdo nezjišťoval; může jít o verzi Bunu jako u TASK-81.

Z TASK-83 a TASK-77 (2026-11-19): při širším běhu vitestu padají testy mimo Review IDE: src/main/runtime/rpc/methods/agent-launch-replay.test.ts, agent-launch-restart-replay.test.ts, agent-launch-instant-tab.test.ts (SQLITE_BUSY, padají i samostatně), host-operation-ownership (neklasifikuje metody androidAppRun.*), vitest-node-runtime-boundary (chce Node 24, lokálně je 22) a několik config/scripts testů. Nikdo neověřil, jestli padají i na čistém stromu.

Z TASK-85 (2026-11-19): host-operation-ownership.test.ts neklasifikuje androidAppRun.*; check:focus-read-ratchet a check:layout-writer-ratchets hlásí pět souborů mimo Review IDE (například TerminalPaneBranchMenu.tsx, use-android-build-directory.ts); profile-state-crash-recovery.test.ts končí časovým limitem v projektu node-runtime (na čistém stromu neověřeno).

Odpověď uživatele 2026-11-19 (decision-12): opravit, ale až po akceptaci M1. Uživatel zároveň chce akceptaci M1 až po dokončení TASK-80, 109 a 112; rozpor je otázka na uživatele.

Odpověď uživatele 2026-11-19 (decision-12, doplnění): opravit před akceptací M1.

Rozděleno 2026-11-19 na tři běhy podle popisu: TASK-112 (názvy a Reflect.get), TASK-134 (cykly), TASK-135 (ratchety a zbytek).

Plán (worker 2026-11-19): audit:anti-slop dnes hlásí 46 chyb: původních 39 (claude-mods: 30x shape, 4x Reflect.get, 1x object; mobilní test diff excerptu 3x shape; e2e conversation-branch-terminal 1x Reflect.get) a 7 nových z dnešních commitů Review IDE (quality-gate-run-store 3x a quality-gate-types 1x Reflect.get, azure-devops-draft-evidence-flag 2x SHAPE, draft-store.compat.test 1x object). Opravím všech 46, protože kritérium 1 chce audit bez chyb. shapeClaudeModsBand -> layoutClaudeModsBand, ShapedClaudeModsBand -> ClaudeModsBandLayout, soubor claude-mods-band-shape(.test).ts -> claude-mods-band-layout(.test).ts. Reflect.get -> zúžení přes 'in' nebo přiřazení do typu s nepovinnými unknown poli; canRedraw(object) pryč, ClaudeModsSurfaceController má redraw vždy. Bez výjimek a bez inline disable.

Hotovo: všech 46 nálezů opraveno, pnpm run audit:anti-slop končí kódem 0. Zbývá: tc, testy dotčených souborů, oxlint, brána změněných řádků, ratchety rendereru.

Ověřeno (worker 2026-11-19): audit:anti-slop kód 0; pnpm tc 0; vitest claude-mods (36 souborů, 275 testů), quality gates a CLI evidence (15 souborů, 139 testů), draft-store compat a mobilní diff excerpt prochází; oxlint změněných souborů 0; check:code-quality:changed 0 nových nálezů; max-lines ratchet OK. focus-read a layout-writer ratchety hlásí jen cizí soubory (TASK-135). E2E conversation-branch-terminal se bez ORCA_E2E_CONVERSATION_BRANCH=1 přeskočí; s ním by zapisoval do skutečného ~/.claude/projects a spouštěl claude CLI, proto nespuštěn. Žádná baseline ani výjimka se nezměnila.

Koordinátor: pnpm run typecheck:e2e má 649 starších chyb (cloud/, src/cli, src/main); není v pnpm tc ani pnpm lint, mimo rozsah M1.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
audit:anti-slop prochází bez chyb: přejmenovány názvy se shape (claude-mods-band-shape → claude-mods-band-layout, EVIDENCE_FORMAT, rowLabels), Reflect.get nahrazeno zúžením přes in nebo typem s klíči unknown, odstraněna kontrola canRedraw, která nic nezachytila. Opraveno i 7 nových nálezů z dnešních tiketů bran kvality a důkazů. Testy dotčených oblastí (45 souborů, 344 testů), pnpm tc a brána změněných řádků prochází.
<!-- SECTION:FINAL_SUMMARY:END -->
