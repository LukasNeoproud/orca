---
id: TASK-87
title: 'Brány kvality: spuštění po kroku agenta a smyčka zpětné vazby'
status: Done
assignee: []
created_date: '2026-11-18T15:17:00Z'
updated_date: '2026-11-19T22:05:00Z'
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
- Řízení smyčky v `src/main/quality-gates/`: počítadlo kol, porovnání výsledku s předchozím kolem, stav smyčky jako nepovinná součást stavu bran z TASK-85 (`qualityGates.status`).
- Nastavení v repozitáři jako data: zapnutí smyčky (výchozí vypnuto) a limit kol v modelu nastavení repozitáře; vypnutí u workspace jako metoda RPC a příkaz CLI. Ovládací prvky v rozhraní dodá TASK-138.

### Mimo rozsah

- Spouštění po každém zápisu do souboru: odloženo, viz poznámky TASK-69.
- Blokující odpověď na hook a změna hook skriptů.
- Ovládání smyčky v nastavení repozitáře, přepínač u workspace, zobrazení stavu smyčky v oddílu Local gates a na kartě workspace a průchod ve skrytém okně: TASK-138.
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
- [x] #1 Se zapnutou smyčkou se po dokončení kroku agenta spustí povinné brány jeho worktree; když projdou, agent nic nedostane a workspace ukazuje, že prošly
- [x] #2 Když brána selže, agent dostane jednu zprávu s názvem brány, příkazem a koncem výstupu označeným jako data, ne pokyny; po jeho dalším dokončeném kroku se brány spustí znovu
- [x] #3 Smyčka se zastaví po nastaveném počtu kol nebo když se výsledek po kole nezlepšil; workspace pak ukazuje, že nálezy čekají na uživatele, a agent další zprávu nedostane
- [x] #4 Zpráva uživatele agentovi, přerušení agenta nebo vypnutí smyčky u workspace ji zastaví
- [x] #5 Dokončení kroku podagenta ani druhý agent ve stejném worktree nespustí druhou smyčku ani souběžný běh téže brány
- [x] #6 Smyčka je ve výchozím stavu vypnutá: bez zapnutí v nastavení repozitáře se nespustí žádná brána a agent nedostane nic; limit kol se čte z nastavení repozitáře; starší klient i hostitel bez pole smyčky ve stavu bran fungují dál
- [x] #7 Testy pokrývají průchod, selhání s opravou, limit kol, kolo bez zlepšení a zásah uživatele
- [ ] #8 Doručení zprávy terminálovému agentovi a strukturovanému chatu je pokryté testy nad náhradou běhového prostředí; agentovi, kterému zprávu poslat nejde, se jen ukáže stav bran. Ověření se skutečným Claude Code lokálně a přes SSH je TASK-139
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Odpověď uživatele 2026-11-19 (decision-12): smyčka vypnutá, zapíná se na repozitář, nejvýš tři kola (jak je tiket napsaný).

Rozděleno 2026-11-19 podle pravidla velikosti: TASK-138 převzal ovládání v nastavení repozitáře, přepínač u workspace, zobrazení stavu smyčky a průchod ve skrytém okně.

Plán workera (hostitelská část): (1) sdílené typy smyčky a nepovinné pole feedbackLoop v qualityGates.status, nastavení qualityGateFeedbackLoop na řádku repozitáře (zápis jen z okna, repos:update); (2) src/main/quality-gates: řadič smyčky (stavový automat nad událostmi hook serveru), text zprávy, doručení přes sendAgentTurn (terminál i strukturované sezení), úložiště vypnutí u workspace; (3) RPC qualityGates.setFeedbackLoop za schopností quality-gates.feedback-loop.v1 a CLI orca gates loop; (4) registrace v desktopu i orcad; (5) testy řadiče, kompatibility a kontraktu, dokumentace.

Stav: hotové sdílené typy, pole repozitáře, řadič, mapování událostí hook serveru, doručení, úložiště vypnutí, RPC setFeedbackLoop, CLI gates loop, registrace v desktopu a orcad; pnpm tc prochází. Zbývá: testy (řadič, události, doručení, kompatibilita, RPC, CLI), dokumentace, brány kvality kódu.

Stav: testy řadiče, událostí, zprávy, doručení, úložiště vypnutí, kompatibility, RPC a CLI napsané a prochází. Zbývá: test zápisu nastavení přes repos:update, test instalace na hook server, dokumentace (06, decision-11), brány kvality kódu, odškrtnutí AC.

Hotovo (část na hostiteli): přibyl test zápisu nastavení přes repos:update a test instalace na hook server; dokumentace 06 a decision-11 doplněny. Řadič rozdělen (quality-gate-loop-agent.ts, quality-gate-run-failures.ts) kvůli limitu 300 řádků. Oprava po vlastní revizi: první tah po odeslání se bere jako vlastní i bez značky (jinak by agent bez textu promptu v hooku resetoval počet kol donekonečna) a po needs-user další krok téhož agenta nespustí nic, dokud v něm nezačne nový tah. orcad nedostává strukturovaný chat (getter se předává jen z desktopu), aby se do jeho balíku nedostal claude-conversation-fork-worker. Brány: pnpm tc čisté, check:code-quality:changed prošel, audit:anti-slop exit 0, oxlint změněných souborů čistý. AC 5 neodškrtnuto: se skutečným Claude Code ani Codexem a přes skutečný SSH hostitel smyčka neběžela; ověřeno jen smyšleným agentem a testy doručení nad náhradou běhového prostředí.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Smyčka zpětné vazby na hostiteli: po dokončeném kroku agenta se při zapnuté smyčce spustí povinné brány worktree; při selhání dostane agent jednu zprávu s názvem brány, příkazem a koncem výstupu označeným jako data. Zastaví se po limitu kol, po kole bez zlepšení, po zprávě uživatele, přerušení agenta nebo vypnutí u workspace; jeden řetěz na worktree. Výchozí stav vypnuto, zapnutí a limit kol v nastavení repozitáře (zatím jen data, rozhraní je TASK-138). Nové: qualityGates.setFeedbackLoop za schopností quality-gates.feedback-loop.v1 (zapnout zpět smí jen aplikace nebo spárované zařízení), nepovinné pole feedbackLoop ve stavu bran, orca gates loop off. Hostitel nepíše do terminálu, do kterého od začátku tahu přišel psaný vstup. Neověřeno: skuteční agenti, skutečný SSH hostitel a strukturované sezení (TASK-139), Windows/WSL. Ověřeno: tc, 144 testů, brána změněných řádků, anti-slop.
<!-- SECTION:FINAL_SUMMARY:END -->
