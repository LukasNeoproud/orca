---
id: TASK-119
title: 'Brány kvality: zastavit běžící příkazy při ukončení aplikace'
status: Done
assignee: []
created_date: '2026-11-19T05:26:00Z'
updated_date: '2026-11-19T05:35:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies:
  - TASK-85
priority: medium
type: bug
ordinal: 200700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Po TASK-85 ukončení aplikace běžící příkaz brány nezastaví: dlouhý build běží dál bez dozoru a jeho záznam je po startu neověřitelný. Brány se spouštějí na pokyn a výsledek bez záznamu nemá cenu, proto se běh při řádném ukončení zastaví.

### Rozsah

- `src/main/quality-gates/quality-gate-service.ts` a `quality-gate-command-run.ts`: zrušení všech běhů při ukončení aplikace stejnou cestou jako zrušení na pokyn (celý strom procesů) a zápis výsledku do úložiště dřív, než proces skončí.
- Napojení na existující úklid při ukončení hlavního procesu; najdi, kde ho registrují jiné služby.
- `quality-gate-launch.ts`: na Windows vlastní hláška pro příkaz začínající `#!` místo textu určeného pro setup skripty.

### Mimo rozsah

- Převzetí běžícího příkazu novou instancí aplikace.
- Ověření na skutečném Windows a ve WSL; tam jen testy sestavení spuštění.

### Omezení

- Ukončení aplikace nesmí čekat déle než krátký pevný limit; co se do něj nestihne, zůstane unverifiable.
- Podřízené procesy podle AGENTS.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Po ukončení aplikace neběží žádný proces spuštěný bránou ani jeho potomek; pokrývá to test služby se skutečným procesem na macOS a Linuxu
- [x] #2 Záznam takového běhu má po dalším startu výsledek zastaveno s důvodem ukončení aplikace, ne unverifiable
- [x] #3 Běh, o kterém hostitel po pádu aplikace neví, zůstává unverifiable
- [x] #4 Na Windows dostane příkaz začínající #! hlášku určenou pro brány; sestavení spuštění pokrývá test
- [x] #5 decision-11 uvádí chování při ukončení aplikace
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: (1) služba dostane shutdown(): zastaví čekající i běžící běhy stejnou cestou jako cancel (abort -> runProcess s terminationBarrier ukončí strom), důvod jde do existujícího pole error u stavu cancelled (žádná změna drátu), čeká nejvýš pevný limit, co nedoběhne, zůstane v souboru running a po startu unverifiable; run() po shutdown odmítne. (2) quality-gate-host: stopQualityGatesForShutdown bez založení služby; registrace v will-quit (main-process-quit) a v orcad cleanup. (3) quality-gate-launch: na Windows příkaz s #! se nespustí, not-started s hláškou pro brány. (4) testy: skutečný proces s potomkem a vnukem, nový hostitel nad stejným souborem, vypršený limit -> unverifiable, sestavení #! na Windows, napojení na will-quit. (5) decision-11.

Hotovo: shutdown() ve službě (stejná cesta jako cancel přes stopEntries, limit 5 s, důvod v error u cancelled, po začátku ukončování run() odmítne), stopQualityGatesForShutdown v quality-gate-host, registrace ve will-quit (main-process-quit) a v orcad cleanup, #! na Windows -> plán refused, not-started s hláškou pro brány. Opraven i závod: zrušení během čtení stavu gitu už příkaz nespustí. Testy: quality-gate-service-quit.test.ts (skutečný strom procesů), launch a windows-wsl testy, test napojení ve will-quit, e2e quality-gates-quit.spec.ts (bez registrace selže, ověřeno). decision-11 a 06-ai-a-review.md doplněny. Windows/WSL neověřeno, jen testy sestavení.
<!-- SECTION:NOTES:END -->
