---
id: TASK-110
title: >-
  Brány forku: lokalizovat pět textů, na kterých padá kontrola pokrytí
  lokalizace
status: Done
assignee: []
created_date: '2026-11-18T22:30:00Z'
updated_date: '2026-11-18T22:36:00Z'
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
- [x] #1 pnpm run verify:localization-coverage prochází
- [x] #2 Chybové zprávy mostu Azure DevOps a zpráva chatového příkazu jdou přes translate s klíči v en.json; technický placeholder oprávnění je na seznamu výjimek s důvodem
- [x] #3 pnpm run verify:localization-catalogs dál prochází a git diff katalogů obsahuje jen doplněné klíče
- [x] #4 Dotčené testy prochází s Bunem podle config/.bun-version
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: 1) Most Azure DevOps: dvě zprávy přes translate s klíči azureDevOpsReview.agentRequestDraftsGone a agentRequestLaunchFailed. 2) Chatový příkaz: jeden klíč components.native-chat.conversationCommand.noArguments s {{command}}. 3) Placeholder Bash(npm run test:*) do config/localization-coverage-allowlist.json s polem reason (skript cizí pole ignoruje). 4) sync:localization-catalog jen pro en.json, runtime katalog jen pokud ho verify vyžaduje; diff katalogů zkontrolovat. 5) Testy, brány, celé pnpm lint.

Hotovo: tři texty přes translate (en.json +3 klíče přes sync:localization-catalog, runtime katalog beze změny, verify ho nevyžaduje), placeholder na allowlistu s polem reason, testy doplněné (bridge: obě zprávy přesně; command-send: odmítnutí argumentů). verify:localization-coverage/catalogs/runtime-catalog/extraction procházejí, 77 testů s Bunem 1.4.2. Zbývá: pnpm tc, code-quality, oxlint, celé pnpm lint.

Ověřeno: pnpm tc, check:code-quality:changed, oxlint změněných souborů procházejí. Celé pnpm lint padá na starších nálezech mimo tiket (anti-slop, code-quality native a type-aware, focus-read a layout-writer ratchet, compat-boundary-imports); lokalizační kroky v něm procházejí. Nálezy neopraveny, vypsány koordinátorovi.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Kontrola pokrytí lokalizace prochází: dvě chybové zprávy mostu Azure DevOps a zpráva chatového příkazu jdou přes translate (tři nové klíče jen v en.json, texty stejné jako dřív), ukázka syntaxe pravidla oprávnění je na seznamu výjimek s důvodem. Ostatní jazyky ani runtime katalog se neměnily. Všechny lokalizační kroky pnpm lint teď prochází. Celé pnpm lint na forku dál neprojde na nálezech mimo tento tiket: tři čtení fokusu v přehledu TODO z TASK-65 (TASK-111) a starší nálezy forku mimo Review IDE v claude-mods, mobilní aplikaci, spouštění Androidu, větvení konverzace a grafu gitu (TASK-112, čeká na rozhodnutí uživatele). Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
