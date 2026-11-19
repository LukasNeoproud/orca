---
id: TASK-128
title: >-
  Brány kvality: nepřeložené texty v nastavení a výsledku brány shazují pnpm
  lint
status: To Do
assignee: []
created_date: '2026-11-19T10:09:00Z'
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
- [ ] #1 pnpm run verify:localization-coverage neprojde na žádném souboru v src/renderer/src/components/quality-gates/
- [ ] #2 Placeholder příkazu a popisky výstupu (stdout, stderr) jsou buď přeložené ve všech šesti jazycích, nebo vyjmuté způsobem, který audit pro technické výrazy už používá; volba je zdůvodněná v poznámkách
- [ ] #3 Testy komponent bran a tests/e2e/quality-gates-settings.spec.ts dál procházejí
<!-- AC:END -->
