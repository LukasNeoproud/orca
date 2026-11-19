---
id: TASK-117
title: 'Stabilizovat e2e sledování vláken: měřit polohu řádku až po ustálení diffu'
status: To Do
assignee: []
created_date: '2026-11-19T04:10:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
priority: medium
type: bug
ordinal: 200500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Spec z TASK-76 padá zhruba v polovině běhů chybou „The element is not laid out“: měří řádek Monaca krátce po přepnutí záložky, dřív než se diff rozloží. Nestabilní test znehodnocuje e2e při přebírání dalších tiketů.

### Rozsah

- `tests/e2e/pull-request-thread-tracking.spec.ts`; případně pomocná funkce pro čekání na rozložený diff, kterou použijí i další specy pull requestu.
- Zjisti, jestli jde jen o test, nebo o skutečnou vadu rozhraní (karta se chvíli kreslí na špatném místě); skutečnou vadu popiš a oprav jen pokud je to malá změna v adresáři funkce.

### Omezení

- Jen skryté okno: `ORCA_BACKGROUND_LAUNCH=1 ORCA_SKIP_DEV_CLI_SYMLINK=1`, projekt `electron-headless`, jeden worker, izolovaný HOME.
- Nezvyšuj časové limity jako jedinou opravu a nepřidávej opakování testu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/e2e/pull-request-thread-tracking.spec.ts projde dvacetkrát po sobě ve skrytém okně s jedním workerem
- [ ] #2 Test čeká na pozorovatelný stav rozhraní, ne na pevnou prodlevu, a dál ověřuje, že karta vlákna stojí mezi svým řádkem a následujícím
- [ ] #3 Ostatní specy tests/e2e/pull-request-*.spec.ts dál procházejí
<!-- AC:END -->
