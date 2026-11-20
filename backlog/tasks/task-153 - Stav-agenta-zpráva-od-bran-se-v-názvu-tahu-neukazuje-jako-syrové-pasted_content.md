---
id: TASK-153
title: >-
  Stav agenta: zpráva od bran se v názvu tahu neukazuje jako syrové
  pasted_content
status: Done
assignee: []
created_date: '2026-11-20T13:05:00Z'
updated_date: '2026-11-20T15:01:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies:
  - TASK-139
priority: low
type: bug
ordinal: 207670
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Při TASK-139 hlásil hook u vloženého textu prompt tahu začínající `<pasted_content id=…>`. Viděno jen v datech stavu; v rozhraní neověřeno.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Zjištěno a zapsáno, kde se prompt tahu z hooku zobrazuje (sidebar, karta workspace, mobil) a jestli tam jde vidět text začínající <pasted_content id=…>
- [x] #2 Kde je vidět, ukazuje se čitelný text zprávy bez obalu; pravidlo je na jednom místě u čtenářů stavu, ne v úložišti stavu
- [x] #3 Test a snímek ze skrytého okna
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: zjistit čtenáře promptu ze stavu (sidebar řádek, dashboard, aktivita, generovaný název tabu, mobil), jedno pravidlo pro zobrazení v src/shared (odstraní značky <pasted_content id=…> Claude Code z náhledu), volat ho v čtenářích; mobil zrcadlí lokálně kvůli kopii jednoho souboru. Úložiště stavu a drát beze změny. Snímek ze skrytého okna se smyšleným agentem (hook UserPromptSubmit s obaleným promptem) před a po.

Zjištění (skryté okno, smyšlený agent posílá UserPromptSubmit s promptem obaleným jako u Claude Code 2.1.329 v TASK-139; ~/.cache/orca-review-ide/task-153): úložiště drží '<pasted_content id="fbf3"> Orca quality gates failed…' (jednořádkový náhled, 200 znaků, uzavírací značka uříznutá). Před opravou byl syrový obal vidět ve výchozím nastavení v řádku agenta na kartě workspace v sidebaru a v seznamu Activity; se zapnutými generovanými názvy tabů jako 'Pasted content id fbf3 Orca quality' v názvu tabu, v řádku sidebaru i v Activity. Mobil (agentDisplayLabel) ukazuje prompt, když agent ještě nemá zprávu, tedy stejně. Oznámení prompt neukazují, CLI worktree ps taky ne. Se skutečným Claude Code může řádek místo promptu ukázat název z titulku terminálu, ale Activity a výchozí stav bez názvu ho ukazují. Oprava: pravidlo agentStatusPromptDisplayText v src/shared/agent-status-prompt-display.ts, volají ho čtenáři getAgentRowPrimaryText, název úkolu v Activity, deriveGeneratedTabTitle; mobil ho zrcadlí uvnitř agent-row-display.ts (kopie jednoho souboru v cross-version sadě). Úložiště ani drát beze změny (test to drží). Hotovo, ověřeno.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Prompt tahu z hooku se zobrazuje v řádku agenta v sidebaru, v Activity, v generovaném názvu tabu a na mobilu; všude byl vidět obal <pasted_content id=…>. Čtenáři teď text čistí jedním pravidlem (src/shared/agent-status-prompt-display.ts, na mobilu zrcadlená kopie kvůli jednosouborovému kopírování); úložiště stavu a protokol jsou beze změny. Ověřeno testy a snímky ze skrytého okna před opravou a po ní.
<!-- SECTION:FINAL_SUMMARY:END -->
