---
id: TASK-124
title: 'Change review: manifest přes RPC, preload a CLI'
status: To Do
assignee: []
created_date: '2026-11-19T09:36:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-91
documentation:
  - docs/review-ide/05-funkce.md
  - docs/review-ide/01-integrace.md
priority: high
type: feature
ordinal: 211100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Pohled Diff po celcích, nástroje agenta a ověřování z příkazové řádky potřebují číst manifest změn z TASK-91 z hostitele, který worktree vlastní. Tento tiket ho zpřístupní přes RPC, most v preloadu a CLI.

### Rozsah

- RPC `changeReview.getManifest` v `src/main/runtime/rpc/methods/` nad jádrem z `src/main/change-review/` (TASK-91); vzorem je `git.branchDiff` v `src/main/runtime/rpc/methods/git-diff-methods.ts`.
- Most v preloadu jako u `git.branchDiff` (`src/preload/api/`).
- CLI `orca change-review manifest --worktree <výběr> [--base <ref>] --json` (`src/cli/specs/`, `src/cli/handlers/`).
- Kontraktní test parametrů a přegenerovaný katalog parametrů RPC (`config/scripts/generate-rpc-params-catalog.mjs`).

### Mimo rozsah

- Typy manifestu, identita hunku, klasifikace, skupiny a keš: TASK-91.
- Rozhraní pohledu: TASK-92. Nástroje agenta a MCP server: TASK-95.

### Omezení

- Git běží na hostiteli, který worktree vlastní, nikdy lokálně za vzdálený worktree.
- Klient a hostitel se aktualizují nezávisle: nová metoda je vyjednaná a starší hostitel znamená odpověď nepodporováno, ne chybu.
- Text hunků se v odpovědi nepřenáší; rozhraní ho čte stávajícím diffem.
- Nic v tomto tiketu nesmí záviset na poskytovateli pull requestů. Testovací repozitář je smyšlený.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Příkaz orca change-review manifest --json nad smyšleným repozitářem vrátí manifest z TASK-91 se soubory, hunky s identifikátorem, druhem a skupinou a počty řádků podle druhu; dva běhy dají bajtově stejný výstup
- [ ] #2 Lokální, WSL a SSH worktree vracejí manifest spočítaný na svém hostiteli; folder workspace bez gitu a starší vzdálený hostitel dostanou odpověď nepodporováno, ne chybu
- [ ] #3 Renderer dostane přes most v preloadu stejný manifest jako CLI, včetně označení oříznutého manifestu
- [ ] #4 Katalog parametrů RPC je přegenerovaný (pnpm generate:rpc-params-catalog), parametry changeReview.getManifest mají kontraktní test a handler CLI má test
<!-- AC:END -->
