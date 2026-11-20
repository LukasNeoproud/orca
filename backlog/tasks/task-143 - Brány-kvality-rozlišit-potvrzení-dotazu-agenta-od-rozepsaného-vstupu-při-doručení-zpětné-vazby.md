---
id: TASK-143
title: >-
  Brány kvality: rozlišit potvrzení dotazu agenta od rozepsaného vstupu při
  doručení zpětné vazby
status: Done
assignee: []
created_date: '2026-11-19T23:37:00Z'
updated_date: '2026-11-20T15:21:00Z'
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
- [x] #1 Potvrzení dotazu agenta klávesou během tahu doručení zpětné vazby nezablokuje
- [x] #2 Rozepsaný neodeslaný vstup uživatele se agentovi nikdy neodešle spolu se zprávou bran; pokrývá to test pro koncept napsaný před potvrzením i po něm
- [x] #3 Pravidla čtená z obrazovky jsou napsaná proti zachyceným přepisům každého podporovaného agenta
- [x] #4 SSH worktree: evidence vstupů je na hostiteli, kde terminál běží
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán workera (2026-11-20): zvolena cesta čtení obrazovky, beze změny protokolu. (1) Zachytit přepisy Claude Code 2.1.329 (haiku, config/scripts/capture-agent-pty-transcript.mjs): potvrzení dotazu bez konceptu, koncept napsaný před potvrzením, koncept napsaný po potvrzení. (2) Pravidlo 'pole agenta je prokazatelně prázdné' nad obrazovkou hostitele jen pro agenty s přepisem (Claude Code); když od začátku tahu přišel vstup, doručení projde jen při prokazatelně prázdném poli, jinak se zadrží jako dosud. Codex a ostatní beze změny (zadržet). (3) Testy: přepisy přehrané emulátorem + doručení. (4) SSH: čtení obrazovky i evidence vstupů běží v runtime hostitele terminálu; ověřit testem.

Stav (worker): přepisy Claude Code 2.1.329 zachycené a očištěné (src/main/runtime/__fixtures__/claude-2-1-329-{permission-confirmed,draft-before-permission,draft-after-permission}), pravidlo prázdného pole v quality-gate-agent-composer.ts, doručení ho čte jen při vstupu od začátku tahu; testy pravidla, doručení a hostitele bez okna prochází (29). Ověřeno se skutečným Claude Code ve skryté aplikaci: po potvrzení dotazu zpráva doručena, koncept před i po potvrzení ji zadržel a zůstal v poli (~/.cache/orca-review-ide/task-143/out/local-terminal/timeline.log). Zbývá: dokumentace 06, brány (tc, oxlint, code-quality, anti-slop), širší běh testů.

Výsledek workera (2026-11-20): hotovo pro Claude Code; Codex a ostatní agenti beze změny (psaný vstup od začátku tahu doručení zadrží), protože přepis jejich obrazovky v tomto stavu neexistuje a Codex se nesmí spouštět. Protokol mezi klientem a hostitelem se nezměnil. Brány: pnpm tc, oxlint, check:code-quality:changed, audit:anti-slop čisté; 31 souborů testů bran a přepisů (364 testů) prochází; orcad-runtime-entry-artifacts selhává stejně i bez změny (známé z TASK-142). Skutečný Claude Code: 8 krátkých spuštění pro přepisy (haiku, 7 s tahem) a 1 relace ve skryté aplikaci se 4 tahy. Neprovedeno: průchod proti orcad v Dockeru; hostitele bez okna pokrývá quality-gate-feedback-delivery-host-evidence.test.ts nad skutečným OrcaRuntimeService. Důkazy: ~/.cache/orca-review-ide/task-143 (cap, out/local-terminal, logs, specs, scripts).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
U Claude Code potvrzení dotazu klávesou už doručení zpětné vazby nezablokuje: když od začátku tahu přišel vstup, hostitel přečte obrazovku terminálu a zprávu pošle jen při prokazatelně prázdném poli agenta. Rozepsaný koncept (před potvrzením i po něm) a každá nerozpoznaná obrazovka doručení zadrží. Pravidlo je napsané proti třem zachyceným přepisům Claude Code 2.1.329; Codex a ostatní agenti pravidlo nemají a zadržují jako dosud (TASK-157). Protokol se nezměnil. Ověřeno testy a relací se skutečným Claude Code ve skrytém okně; SSH jen testem nad runtime bez okna.
<!-- SECTION:FINAL_SUMMARY:END -->
