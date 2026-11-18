---
id: TASK-87
title: 'Brány kvality: spuštění po kroku agenta a smyčka zpětné vazby'
status: To Do
assignee: []
created_date: '2026-11-18T15:17:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-85
  - TASK-86
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 207000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Agent se má o chybách kompilace, lintu a testů dozvědět sám a opravit je dřív, než práci ohlásí jako hotovou. Review pak nedostává kód, který se nepřeloží.

### Rozsah

- Spouštěč: přechod agenta do stavu dokončeného kroku. Události stavu dává hook server (`src/main/agent-hooks/server.ts`, odběr `subscribeStatusChanges` a `subscribeEnrichedStatus` v `src/main/agent-hooks/server/server-listeners.ts`), záznam je `AgentStatusEntry` v `src/shared/agent-status-types.ts`.
- Hook je jednosměrný: skript odpoví agentovi dřív, než Orca událost uvidí (`src/main/claude/hook-script.ts`, `src/main/agent-hooks/hook-post-command.ts`), a server odpovídá 204. Odpovědí na hook Stop tedy agenta zadržet nejde; nálezy se posílají jako nová zpráva.
- Odeslání zprávy běžícímu agentovi z hlavního procesu: `sendAgentTurn` v `src/main/runtime/orchestration/send-agent-turn.ts` (terminál i strukturované sezení).
- Text zprávy: vzor `buildFixBrokenChecksPrompt` v `src/shared/pr-checks-fix-prompt.ts` (výstup jako nedůvěryhodná data, oříznutý konec logu).
- Řízení smyčky v `src/main/quality-gates/`: počítadlo kol, porovnání výsledku s předchozím kolem, stav smyčky jako součást stavu bran z TASK-85 a jeho zobrazení v oddílu z TASK-86.
- Nastavení v repozitáři: zapnutí smyčky a limit kol; přepínač u workspace pro vypnutí.

### Mimo rozsah

- Spouštění po každém zápisu do souboru: odloženo, viz poznámky TASK-69.
- Blokující odpověď na hook a změna hook skriptů.
- Rozbor výstupu na jednotlivé nálezy (M3).

### Omezení

- Výchozí stav je vypnuto. Smyčka posílá agentovi zprávy bez zásahu uživatele a spotřebovává tokeny; bez výslovného zapnutí se nesmí poslat nic.
- Stav agenta vlastní hook server hostitele, na kterém agent běží; u SSH je to orcad (`src/main/orcad/orcad-entry.ts`). Smyčka je další čtenář téhož úložiště, žádná vlastní kopie stavu.
- Zpráva jde jen agentovi, který krok dokončil, a jen když je nečinný; nikdy do rozepsaného vstupu uživatele.
- Strukturovaný chat Claude a Codex je jen lokální; v SSH worktree se smyčka týká terminálových agentů.
- Readiness a nečinnost terminálového agenta neodvozuj ze zapamatované podoby obrazovky; platí oddíl Agent Terminal Screens v AGENTS.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Se zapnutou smyčkou se po dokončení kroku agenta spustí povinné brány jeho worktree; když projdou, agent nic nedostane a workspace ukazuje, že prošly
- [ ] #2 Když brána selže, agent dostane jednu zprávu s názvem brány, příkazem a koncem výstupu označeným jako data, ne pokyny; po jeho dalším dokončeném kroku se brány spustí znovu
- [ ] #3 Smyčka se zastaví po nastaveném počtu kol nebo když se výsledek po kole nezlepšil; workspace pak ukazuje, že nálezy čekají na uživatele, a agent další zprávu nedostane
- [ ] #4 Smyčka je ve výchozím stavu vypnutá; zapíná se v nastavení repozitáře spolu s limitem kol a nastavení říká, že spotřebovává tokeny agenta
- [ ] #5 Zpráva uživatele agentovi, přerušení agenta nebo vypnutí smyčky u workspace ji zastaví
- [ ] #6 Funguje pro terminálového agenta Claude Code a Codex lokálně i v SSH worktree a pro strukturovaný chat lokálně; agentovi, kterému zprávu poslat nejde, se jen ukáže stav bran
- [ ] #7 Dokončení kroku podagenta ani druhý agent ve stejném worktree nespustí druhou smyčku ani souběžný běh téže brány
- [ ] #8 Testy pokrývají průchod, selhání s opravou, limit kol, kolo bez zlepšení a zásah uživatele; jeden průchod je ověřený ve skrytém okně se smyšleným agentem
<!-- AC:END -->
