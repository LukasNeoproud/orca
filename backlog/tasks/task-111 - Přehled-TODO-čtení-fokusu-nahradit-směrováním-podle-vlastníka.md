---
id: TASK-111
title: 'Přehled TODO: čtení fokusu nahradit směrováním podle vlastníka'
status: Done
assignee: []
created_date: '2026-11-18T22:36:00Z'
updated_date: '2026-11-18T22:42:00Z'
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
- [x] #1 pnpm run check:focus-read-ratchet nehlásí žádný soubor ve src/renderer/src/components/todo-overview
- [x] #2 Přehled TODO dál hledá ve workspace, ze kterého byl otevřen, i když uživatel mezitím přepne aktivní workspace; pokrývá to test
- [x] #3 Stávající testy přehledu TODO včetně e2e ve skrytém okně prochází
- [x] #4 Baseline ratchetu se nezvyšuje a nepřibyla výjimka
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: v use-todo-overview-search.ts nahradit getRuntimeEnvironmentIdForWorktree/getExecutionHostIdForWorktree (čtou fokus) vlastníkem průzkumníka getFileExplorerOperationOwnerFromState (owner-routed, ratchet ho nepočítá) a z něj odvodit target, connectionId a executionHostId přes getFileExplorerOperationRoute/getFileExplorerOperationExecutionHostId; nerozřešený vlastník = chyba jako ve stromu průzkumníka. use-todo-overview.ts tím přestane volat čtenáře. Test: přepnutí aktivního workspace a Active Server nespustí hledání znovu ani ho nepřesměruje. FileExplorer.tsx beze změny.

Hotovo: use-todo-overview-search.ts směruje podle getFileExplorerOperationOwnerFromState (target, connectionId, executionHostId z vlastníka); nerozřešený vlastník nehledá a ukáže hlášku průzkumníka. Ratchet už todo-overview nehlásí, baseline beze změny. Testy: 9/9 vitest, e2e todo-overview ve skrytém okně prošlo, snímky v ~/.cache/orca-review-ide/task-111/screenshots. Zbývá: nic.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Přehled TODO už nečte hostitele workspace z fokusu: bere vlastníka workspace stejným resolverem jako strom průzkumníka a podle něj určí prostředí, připojení a hostitele hledání. Ratchet check:focus-read-ratchet nehlásí žádný soubor v todo-overview; baseline ani výjimky se neměnily. Skutečná změna chování je jediná: u workspace, o jehož vlastníkovi katalog zatím nic neví, se dřív hledalo lokálně a výsledky se označily hostitelem, na kterém byl fokus; teď se nehledá a ukáže se stejná hláška jako ve stromu průzkumníka. Pro workspace s výslovným vlastníkem se chování nezměnilo (test přepnutí fokusu prochází i se starým kódem a hlídá to do budoucna). Ověřeno testy a e2e ve skrytém okně. Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
