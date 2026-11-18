---
id: TASK-70
title: Rozepsat tikety milníku M3 Editor
status: To Do
assignee: []
created_date: '2026-11-18T12:45:00Z'
labels:
  - review-ide
  - planovani
  - effort-xhigh
  - ceka-na-uzivatele
milestone: m-3
dependencies:
  - TASK-53
  - TASK-54
  - TASK-55
  - TASK-56
documentation:
  - docs/review-ide/02-editor.md
  - docs/review-ide/07-funkce-z-ide.md
priority: medium
type: task
ordinal: 300000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připravit tikety pro hostitele language serverů a most do Monaca v rozsahu, který potvrdily pokusy.

### Podklady

- `docs/review-ide/02-editor.md`; `docs/review-ide/07-funkce-z-ide.md`, body 1, 2, 3 a 10.
- Záznamy rozhodnutí z TASK-53 až TASK-56 a prototyp na větvi `review-ide/pokus-lsp-most`.

### Poznámky k rozsahu

- Jazyky zařaď podle výsledků pokusů; jazyk, který neprošel, dostane jen Otevřít v IDE.
- Počítej se SSH worktrees, s uspáváním serverů a s přístupem agentů přes CLI a MCP.

Tikety piš podle pravidel ve skillu `review-ide` (soubor `tikety.md`). Výchozí body v kódu ověř v aktuálním stromu, dokumentace vznikla nad starším commitem.

### Čeká na uživatele

Zařazení milníku do další vlny. Pořadí milníků po první vlně (M0 až M2) určuje uživatel podle výsledků pokusů; koordinátor mu ho předloží s doporučením.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Každá funkce milníku z dokumentace má tiket, nebo je výslovně odložená s důvodem v poznámkách tohoto tiketu
- [ ] #2 Každý tiket má odkaz na oddíl dokumentace, cíl, rozsah, mimo rozsah, výchozí body v kódu ověřené v aktuálním stromu, omezení, pozorovatelná akceptační kritéria a štítek effort
- [ ] #3 Každý tiket zvládne jeden worker v jednom běhu; větší celky jsou rozdělené na svislé řezy, které jdou samostatně ověřit
- [ ] #4 Závislosti jsou jen tam, kde je skutečné pořadí, a netvoří cyklus
- [ ] #5 Otázky pro uživatele k rozsahu, placeným službám a chování navenek jsou v poznámkách tiketu, každá s možnostmi a doporučením
- [ ] #6 Popis milníku v backlog/milestones odpovídá naplánovanému rozsahu
<!-- AC:END -->
