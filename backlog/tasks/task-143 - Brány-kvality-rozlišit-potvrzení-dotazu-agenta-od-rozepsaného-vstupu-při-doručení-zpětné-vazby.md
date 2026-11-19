---
id: TASK-143
title: >-
  Brány kvality: rozlišit potvrzení dotazu agenta od rozepsaného vstupu při
  doručení zpětné vazby
status: To Do
assignee: []
created_date: '2026-11-19T23:37:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-139
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 207700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Smyčka zpětné vazby (TASK-87) nepošle zprávu, když do terminálu od začátku tahu přišel jakýkoli psaný vstup. Uživatel, který agentovi potvrdí dotaz na oprávnění, tak smyčku v tom tahu zastaví a nálezy zůstanou na něm.

### Rozsah

- Evidence jednotlivých vstupů ve sdíleném TerminalRunFacts (čas a velikost vůči oknu, kdy agent čekal na odpověď), nebo čtení rozepsaného textu přes detectTerminalComposerDraft ověřené proti zachyceným přepisům.
- Zachycení přepisů chování po potvrzení dotazu: config/scripts/capture-agent-pty-transcript.mjs.

### Poznámky

TASK-141 zkoušel pravidlo „vstup v době, kdy agent čekal na odpověď, se nepočítá“. Má dvě díry: koncept napsaný při práci agenta a potom potvrzení dotazu; koncept napsaný po potvrzení, než přijde další hook.

### Omezení

- Zachycení přepisů potřebuje skutečného agenta; čeká na povolení z TASK-139. Codex nespouštět.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Potvrzení dotazu agenta klávesou během tahu doručení zpětné vazby nezablokuje
- [ ] #2 Rozepsaný neodeslaný vstup uživatele se agentovi nikdy neodešle spolu se zprávou bran; pokrývá to test pro koncept napsaný před potvrzením i po něm
- [ ] #3 Pravidla čtená z obrazovky jsou napsaná proti zachyceným přepisům každého podporovaného agenta
- [ ] #4 SSH worktree: evidence vstupů je na hostiteli, kde terminál běží
<!-- AC:END -->
