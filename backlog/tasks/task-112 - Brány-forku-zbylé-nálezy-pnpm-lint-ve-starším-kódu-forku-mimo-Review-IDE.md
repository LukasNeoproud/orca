---
id: TASK-112
title: 'Brány forku: zbylé nálezy pnpm lint ve starším kódu forku mimo Review IDE'
status: To Do
assignee: []
created_date: '2026-11-18T22:36:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
  - ceka-na-uzivatele
milestone: m-1
dependencies: []
priority: low
type: bug
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Celé `pnpm lint` na forku neprojde kvůli nálezům ve starším kódu forku, který s Review IDE nesouvisí. Akceptace milníku pouští `pnpm lint`; bez opravy poběží s červenou bránou.

### Rozsah

Stav z 2026-11-18 (TASK-110):

- `audit:anti-slop`, 39 chyb: 33× názvy se `shape` v `native-chat/claude-mods` a v jednom testu mobilní aplikace, 5× `Reflect.get`, 1× parametr typu objekt.
- `audit:code-quality:native`: 6 importních cyklů (claude-mods, mobilní aplikace) a 1 duplicitní import.
- `audit:code-quality:type-aware`: neúplný `switch` v `src/main/claude/claude-permission-suggestion-summary.ts`.
- `check:focus-read-ratchet`: `AndroidAppRunButton.tsx`, `TerminalPaneBranchMenu.tsx`, `lib/conversation-branch-members.ts`.
- `check:layout-writer-ratchets`: `android-app-run/use-android-build-directory.ts`, `store/slices/editor/actions/git-graph-tab-actions.ts`.
- `check:compat-boundary-imports`: `mobile/src/session/mobile-conversation-branch-launch.ts`.

Když se tiket spustí, rozděl ho na tři běhy: pojmenování a `Reflect.get`; cykly a duplicitní import; ratchety.

### Mimo rozsah

- Přehled TODO (TASK-111).

### Čeká na uživatele

Opravit starší kód forku mimo Review IDE, aby `pnpm lint` prošlo celé? Ano: zhruba tři běhy na Opusu a zásahy do chatu, mobilní aplikace, spouštění Androidu a větvení konverzace, tedy do funkcí, které Review IDE jinak nemění. Ne: akceptace milníků poběží s `pnpm lint` červeným na těchto místech a koordinátor bude hlídat jen to, že Review IDE nepřidá nové nálezy. Doporučení: ano, ale až po akceptaci M1, ať se milník nezdržuje.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm lint prochází celé, nebo je u každého zbylého nálezu zapsané, proč zůstal
- [ ] #2 Chování dotčených funkcí se nemění; jejich testy prochází
- [ ] #3 Žádná baseline ratchetu se nezvyšuje a nepřibyla výjimka z pravidel
<!-- AC:END -->
