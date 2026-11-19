---
id: TASK-134
title: 'Brány forku: importní cykly a duplicitní import ve starším kódu forku'
status: Done
assignee: []
created_date: '2026-11-19T15:37:00Z'
updated_date: '2026-11-19T16:24:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-1
dependencies: []
type: bug
ordinal: 16010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Část opravy starších nálezů `pnpm lint` ve forku před akceptací M1 (decision-12); navazuje na TASK-112.

### Rozsah

audit:code-quality:native: 6 importních cyklů (claude-mods, mobilní aplikace) a 1 duplicitní import (stav z TASK-110, 2026-11-18). Nejdřív ověř aktuální stav spuštěním kontrol.

### Omezení

- Chování dotčených funkcí (chat, mobilní aplikace, spouštění Androidu, větvení konverzace) se nemění.
- Žádná výjimka z pravidel ani zvýšení baseline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm run audit:code-quality:native prochází bez chyb
- [x] #2 Chování dotčených funkcí se nemění; jejich testy prochází
- [x] #3 Žádná baseline ratchetu se nezvyšuje a nepřibyla výjimka z pravidel
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker 2026-11-19): audit:code-quality:native dnes hlásí 7 nálezů: cyklus ClaudeModsElement <-> client/ClaudeModsClientRegion (fork), duplicitní import lucide-react v EditorFileTab.tsx (řádek forku), cyklus mobile transport client-context <-> host-client-hooks a 3 nálezy v mobile/src/terminal/document (jedna silně souvislá komponenta 9 modulů). Mobilní cykly jsou kód upstreamu beze změn proti main; upstream CI je nevidí, protože audit spouští před instalací mobile/node_modules (komentář v .github/workflows/pr.yml), lokálně s nainstalovaným mobile/node_modules se ukážou. Oprava: ClaudeModsClientRegion dostane vykreslení stromu jako prop; EditorFileTab sloučí import; nový mobile/src/transport/rpc-client-react-context.ts se sdíleným kontextem pro nativní i web variantu; v terminal/document nový list cell-metrics.ts (rozměry buňky a měřítko) a xterm-selection.ts (seřazený výběr a jeho zápis do xterm). Bez re-exportů, bez výjimek.

Hotovo (worker): všech 7 nálezů opraveno, audit:code-quality:native končí kódem 0 (s nainstalovaným mobile/node_modules). EditorFileTab: místo sloučení importu (soubor by přesáhl max-lines 400) přesunuta volba ikony git-graph do nového tab-bar/editor-tab-file-icon.ts. Skript SCC nad relativními hodnotovými importy: mobile/src bez cyklů, claude-mods bez cyklů. Zbývá: tc, testy, oxlint, brána změněných řádků, anti-slop, ratchety, přegenerování skriptu dokumentu terminálu pro test digestu.

Ověřeno (worker 2026-11-19): audit:code-quality:native kód 0; pnpm tc 0; mobile typecheck 0 a ratchet typecheck testů OK; mobilní oxlint 0; oxlint a React Doctor změněných souborů 0; audit:anti-slop 0; check:code-quality:changed 0 nových nálezů; max-lines ratchet OK. Testy: renderer claude-mods + tab-bar 110 souborů / 927 testů prochází; celý mobile vitest 10666 prochází, 4 selhání jsou jen známé cizí (mock-server-key-pair, mobile-structured-composer-command, mobile-agent-launch-architecture). E2E app-menu-review-views (electron-headless, ORCA_BACKGROUND_LAUNCH=1, 1 worker) prochází, snímek /tmp/orca-task134/shots/menu-review-git-graph.png ukazuje záložku Git graph s ikonou. focus-read a layout-writer ratchety hlásí jen cizí soubory (TASK-135). Žádná baseline ani výjimka; v native-document-bundle.test.ts přesný počet modulů dokumentu 50 -> 52 kvůli dvěma novým listům (není to baseline, test počítá moduly v balíčku). Harness RPC nahrávek přesměrován na rpc-client-react-context.tsx (lokál Ctx zůstává soukromý).

Koordinátor: oprava mobilních cyklů upstreamu je samostatný commit; otázka na uživatele, zda ji ponechat (konflikty při slučování s upstreamem) nebo vrátit (git revert).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
audit:code-quality:native prochází. Cyklus v claude-mods a duplicitní import v EditorFileTab opraveny v kódu forku (vlastní commit). Pět nálezů bylo v kódu upstreamu v mobile/ (transport a dokument terminálu), který upstream CI nevidí, protože audit pouští před instalací mobile/node_modules; opravené v samostatném commitu, který jde vrátit, pokud uživatel nechce odchylku od upstreamu.
<!-- SECTION:FINAL_SUMMARY:END -->
