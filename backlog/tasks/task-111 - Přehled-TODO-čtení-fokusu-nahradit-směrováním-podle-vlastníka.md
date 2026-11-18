---
id: TASK-111
title: 'Přehled TODO: čtení fokusu nahradit směrováním podle vlastníka'
status: To Do
assignee: []
created_date: '2026-11-18T22:36:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/07-funkce-z-ide.md
priority: medium
type: bug
ordinal: 15950
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-65 přidal přehled TODO a FIXME. Tři místa v něm čtou „aktivní“ workspace z fokusu, což ratchet `check:focus-read-ratchet` (součást `pnpm lint`) u nového kódu zakazuje: zdroj má určit vlastník, ne to, co má uživatel zrovna vybrané. Brána změněných řádků to nezachytila.

### Rozsah

- `src/renderer/src/components/todo-overview/use-todo-overview-search.ts` (2 čtení) a `use-todo-overview.ts` (1 čtení).
- Hlášení ratchetu říká, jak směrovat („Route by the resource's owner“); pravidlo a povolené výjimky najdi ve skriptu, který ratchet pouští (`package.json`, `check:focus-read-ratchet`).
- Worktree a jeho hostitele předává `FileExplorer.tsx` už dnes (`worktreeId`, `worktreePath`); čti z nich.

### Mimo rozsah

- Ostatní soubory, které ratchet hlásí (spouštění Androidu, menu větve terminálu, větvení konverzace): patří TASK-112.

### Omezení

- Chování pro uživatele se nemění kromě opravy případu s přepnutým workspace.
- Testy pouštěj s Bunem podle `config/.bun-version`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm run check:focus-read-ratchet nehlásí žádný soubor ve src/renderer/src/components/todo-overview
- [ ] #2 Přehled TODO dál hledá ve workspace, ze kterého byl otevřen, i když uživatel mezitím přepne aktivní workspace; pokrývá to test
- [ ] #3 Stávající testy přehledu TODO včetně e2e ve skrytém okně prochází
- [ ] #4 Baseline ratchetu se nezvyšuje a nepřibyla výjimka
<!-- AC:END -->
