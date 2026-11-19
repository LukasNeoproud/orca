---
id: TASK-128
title: >-
  Brány kvality: nepřeložené texty v nastavení a výsledku brány shazují pnpm
  lint
status: Done
assignee: []
created_date: '2026-11-19T10:09:00Z'
updated_date: '2026-11-19T10:21:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
priority: high
type: bug
ordinal: 200050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-85 přidal do rozhraní bran tři texty mimo lokalizační katalog. `verify:localization-coverage` je součást `pnpm lint`, takže lint na větvi padá. Při převzetí TASK-85 se tato kontrola nespustila.

### Rozsah

- `src/renderer/src/components/quality-gates/QualityGateDraftEditor.tsx` (placeholder `pnpm lint`) a `QualityGateRunResult.tsx` (popisky `stdout`, `stderr`).
- `config/scripts/audit-localization-coverage.mjs`: zjisti, jak audit zachází s technickými výrazy a příklady příkazů, a použij stávající cestu.

### Omezení

- Lokalizace podle `.claude/skills/review-ide/worker.md`: jen tyto klíče, katalogy nepřepisuj hromadně.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm run verify:localization-coverage neprojde na žádném souboru v src/renderer/src/components/quality-gates/
- [x] #2 Placeholder příkazu a popisky výstupu (stdout, stderr) jsou buď přeložené ve všech šesti jazycích, nebo vyjmuté způsobem, který audit pro technické výrazy už používá; volba je zdůvodněná v poznámkách
- [x] #3 Testy komponent bran a tests/e2e/quality-gates-settings.spec.ts dál procházejí
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: audit nemá zvláštní výjimku pro technické výrazy; jedinou cestou je reviewed exclusion v config/localization-coverage-allowlist.json (precedenty: placeholder 'Bash(npm run test:*)' s polem reason, 'https://dev.azure.com/contoso', popisek 'PID'). Tři texty přidám tam s důvodem, katalogy neměním.
Zdůvodnění volby: 'pnpm lint' je příklad příkazu, přeložený by nešel spustit. 'stdout'/'stderr' jsou názvy proudů procesu, stejné jako v shellu a logu CI, a stojí nad syrovým výstupem příkazu; jako 'PID' v AgentManagerTable zůstávají doslovné. Hotovo: allowlist doplněn, verify:localization-coverage prochází.

Ověřeno: verify:localization-coverage prochází (26 povolených kandidátů), testy bran + audit-localization-coverage.test.mjs 19/19, e2e quality-gates-settings.spec.ts 1 passed, pnpm tc OK, check:code-quality:changed bez JS/TS změn, oxfmt --check OK. Zbývá: nic.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Placeholder příkazu a popisky stdout/stderr v rozhraní bran kvality jsou vyjmuté z auditu lokalizace zkontrolovanou výjimkou v allowlistu se zdůvodněním (stejná cesta jako u příkladů příkazů a popisku PID). verify:localization-coverage prochází.
<!-- SECTION:FINAL_SUMMARY:END -->
