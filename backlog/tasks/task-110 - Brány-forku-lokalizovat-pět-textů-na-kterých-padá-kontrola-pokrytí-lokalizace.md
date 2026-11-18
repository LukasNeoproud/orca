---
id: TASK-110
title: >-
  Brány forku: lokalizovat pět textů, na kterých padá kontrola pokrytí
  lokalizace
status: To Do
assignee: []
created_date: '2026-11-18T22:30:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
priority: medium
type: bug
ordinal: 15900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

`pnpm lint` na forku neprojde, protože kontrola pokrytí lokalizace hlásí pět textů v rendereru bez lokalizace. Akceptace milníku pouští celé `pnpm lint`.

### Rozsah

- `src/renderer/src/lib/azure-devops-review-agent-bridge.ts`: dvě chybové zprávy.
- `src/renderer/src/components/native-chat/structured-conversation-command-send.ts`: zpráva „Use /… without arguments.“ jako jeden klíč s proměnnou, ne dva úlomky.
- `src/renderer/src/components/native-chat/NativeChatClaudePermissionsDialog.tsx`: placeholder `Bash(npm run test:*)` je ukázka syntaxe, nepřekládá se; patří na seznam výjimek kontroly (najdi ho přes `config/scripts/audit-localization-coverage.mjs`).
- Nové klíče jen do `en.json` a runtime katalogu, pokud ho kontrola vyžaduje.

### Mimo rozsah

- Překlady do ostatních jazyků: chybějící překlad spadne na angličtinu a o překladech starších funkcí forku rozhoduje uživatel (viz poznámky TASK-81).
- Jiné nálezy `pnpm lint`; když nějaké jsou, vypiš je ve zprávě.

### Omezení

- V `components/native-chat/` platí pravidla typografie a barev ze STYLEGUIDE; vzhled se nemění.
- Testy pouštěj s Bunem 1.4.2: `PATH="$HOME/.cache/orca-review-ide/tools/bun-1.4.2/bun-darwin-aarch64:$PATH"`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm run verify:localization-coverage prochází
- [ ] #2 Chybové zprávy mostu Azure DevOps a zpráva chatového příkazu jdou přes translate s klíči v en.json; technický placeholder oprávnění je na seznamu výjimek s důvodem
- [ ] #3 pnpm run verify:localization-catalogs dál prochází a git diff katalogů obsahuje jen doplněné klíče
- [ ] #4 Dotčené testy prochází s Bunem podle config/.bun-version
<!-- AC:END -->
