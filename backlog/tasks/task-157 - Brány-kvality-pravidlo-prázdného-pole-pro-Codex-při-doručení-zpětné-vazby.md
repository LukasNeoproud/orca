---
id: TASK-157
title: 'Brány kvality: pravidlo prázdného pole pro Codex při doručení zpětné vazby'
status: To Do
assignee: []
created_date: '2026-11-20T15:21:00Z'
labels:
  - review-ide
  - effort-medium
  - ceka-na-uzivatele
milestone: m-2
dependencies:
  - TASK-143
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: low
type: feature
ordinal: 215800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-143 naučil smyčku zpětné vazby rozlišit u Claude Code potvrzení dotazu od rozepsaného vstupu. Codex pravidlo nemá, takže každý psaný vstup během tahu doručení zadrží a nálezy zůstanou na uživateli.

### Rozsah

- Přepisy Codexu přes `config/scripts/capture-agent-pty-transcript.mjs` a pravidlo v `src/main/quality-gates/quality-gate-agent-composer.ts` vedle pravidla pro Claude Code.

### Čeká na uživatele

Zachycení přepisů potřebuje spustit skutečný Codex. Uživatel nemá předplatné a Codex se nespouští (CLAUDE.local.md). Tiket začne, až to uživatel změní.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Potvrzení dotazu Codexu klávesou během tahu doručení zpětné vazby nezablokuje; rozepsaný koncept ho zadrží
- [ ] #2 Pravidlo je napsané proti zachyceným přepisům Codexu (po potvrzení dotazu, s konceptem před ním a po něm) a má testy
<!-- AC:END -->
