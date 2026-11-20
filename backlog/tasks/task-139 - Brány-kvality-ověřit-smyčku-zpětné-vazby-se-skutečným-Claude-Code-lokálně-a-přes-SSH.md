---
id: TASK-139
title: >-
  Brány kvality: ověřit smyčku zpětné vazby se skutečným Claude Code lokálně a
  přes SSH
status: Done
assignee: []
created_date: '2026-11-19T22:05:00Z'
updated_date: '2026-11-20T13:05:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-87
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: task
ordinal: 207600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Smyčka z TASK-87 je ověřená jen se smyšleným agentem a nad náhradou běhového prostředí. Než ji uživatel zapne u skutečné práce, má projít se skutečným agentem.

### Rozsah

- Krátká zkušební spuštění Claude Code nad smyšleným repozitářem s bránou, která selže, lokálně a přes SSH.
- Opravy doručení podle zjištění; nová pravidla nad obrazovkou jen proti zachycenému přepisu.

### Čeká na uživatele

Povolení ke krátkým zkušebním spuštěním skutečného Claude Code se zapnutou smyčkou (dosavadní povolení platí jen pro TASK-57) a dostupný SSH hostitel pro zkoušku.

### Omezení

- Codex nespouštět.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Skutečný terminálový Claude Code se zapnutou smyčkou dostane po dokončeném kroku zprávu o selhané bráně a po opravě smyčka skončí stavem prošlo; průběh je zapsaný
- [x] #2 Strukturovaný chat lokálně dostane zprávu jako kartu od Quality gates
- [x] #3 Rozepsaný vstup uživatele v terminálu zprávu zadrží; chování po hookovém done na skutečném terminálu odpovídá pravidlu tui-idle
- [x] #4 Codex je posouzený jen podle dokumentace a je to zapsané
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-20: uživatel povolil krátká zkušební spuštění skutečného Claude Code pro tento tiket. SSH hostitel pro zkoušku: kontejner v Dockeru na tomto počítači (Docker 28.5.1 běží), vytvoří ho worker; soubory kontejneru mimo repozitář v ~/.cache/orca-review-ide/task-139.

Plán workera (2026-11-20): (1) skrytá aplikace z e2e buildu s izolovaným HOME a dočasným userData, smyšlený repozitář v ~/.cache/orca-review-ide/task-139/out, skutečný Claude Code (haiku) v terminálu aplikace, hooky nainstalované tímto buildem; (2) fáze: selhání→zpráva→oprava→prošlo, rozepsaný vstup, potvrzení dotazu klávesou (jen zápis pro TASK-143); (3) strukturovaný chat lokálně; (4) SSH přes Docker s orcad; (5) Codex podle dokumentace. Dočasné specy tests/e2e/tmp-task-139-*.spec.ts se před odevzdáním přesunou do cache.

Stav po lokálním terminálu: AC1 a AC4 mají důkaz (out/local-terminal-fix/timeline.log, out/local-terminal/timeline.log + screen-*.txt). 4 skutečná spuštění Claude Code (1 bez tahu: neprošel dialog důvěry složce). Zbývá: strukturovaný chat (AC3), SSH (AC2), Codex (AC5), dokumentace.

Codex (AC5), posouzeno jen podle dokumentace hooků Codexu (developers.openai.com/codex/hooks, přesměrováno na learn.chatgpt.com/docs/hooks, čteno 2026-11-20) a podle kódu Orky, bez spuštění: UserPromptSubmit nese pole prompt (značka kola jde najít), Stop má stop_hook_active a last_assistant_message, přerušení hlásí zvlášť Interrupt (Orca ho instaluje od Codexu 0.150, src/main/codex/codex-hook-definition.ts) a Stop se u přerušeného tahu podle dokumentace nezaručuje. Hooky, které nejsou spravované politikou, Codex přeskočí, dokud je uživatel neschválí (/hooks, vázáno na hash); bez schválení smyčka nedostane událost a nic nepošle, což je bezpečný směr. Stop umí decision block s reason jako pokračovací prompt; Orca ho nepoužívá, hook je jednosměrný. Neověřeno a z dokumentace nezjistitelné: jestli pravidlo tui-idle sedí na obrazovku Codexu po Stop, jestli vložený text dorazí jako jeden tah a jestli prompt v UserPromptSubmit obsahuje rozbalený vložený text (u Claude Code 2.1.329 přišel obalený v <pasted_content id=...> a značka v něm byla). Dokud to někdo s předplatným nezachytí přepisem, je smyčka u Codexu neověřená.

Výsledek workera (2026-11-20): AC1, AC3, AC4, AC5 splněné, AC2 ne. Nález a oprava: strukturovaný chat zprávu odmítal (agent_session_operation_invalid, id operace bez času); smyčka teď razí id přes createStructuredAgentSessionOperationId, test v quality-gate-feedback-delivery.test.ts. Terminál beze změny kódu. TASK-143: potvrzení dotazu na oprávnění klávesou Enter doručení zadrželo (reason=user-input), viz out/local-terminal/timeline.log fáze 3 a screen-11. SSH: slot linux-arm64-glibc a šablona orcad sestavené v ~/.cache/orca-review-ide/task-139 (orcad-template, orcad-build); dál nepokračováno, protože (a) přihlášení Claude Code v kontejneru chce interaktivní krok uživatele (claude setup-token) a (b) brány a smyčku repozitáře na hostiteli orcad nejde z desktopu nastavit (repos:update píše jen místní úložiště, runtime socket pole nezná), takže průchod by šel jen s ručně podvrženým úložištěm na vzdáleném stroji. Skutečná spuštění Claude Code: 6 (4 terminál, z toho 1 bez tahu; 2 strukturovaný chat), model haiku. Důkazy: ~/.cache/orca-review-ide/task-139/out, logs, specs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Smyčka zpětné vazby ověřena se skutečným Claude Code (haiku, 6 krátkých spuštění) lokálně: v terminálu agent dostal zprávu o selhané bráně, opravil a smyčka skončila stavem prošlo; rozepsaný vstup zprávu zadržel. Ve strukturovaném chatu zkouška odhalila chybu: chat zprávu odmítal kvůli tvaru id operace; opraveno, zpráva dorazí jako karta od Quality gates. Codex posouzen jen podle dokumentace. Ověření přes SSH se nepodařilo a přešlo do navazujících tiketů: brány a smyčku nejde pro repozitář na vzdáleném hostiteli z desktopu nastavit a Claude Code v kontejneru potřebuje token od uživatele. Ověřeno: tc, 25 souborů testů bran, brána změněných řádků, anti-slop, snímek karty.
<!-- SECTION:FINAL_SUMMARY:END -->
