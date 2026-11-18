---
id: TASK-74
title: Rozepsat tikety milníku M7 Projekt jako celek
status: To Do
assignee: []
created_date: '2026-11-18T12:45:00Z'
updated_date: '2026-11-18T23:44:00Z'
labels:
  - review-ide
  - planovani
  - effort-xhigh
  - ceka-na-uzivatele
milestone: m-7
dependencies:
  - TASK-57
  - TASK-59
documentation:
  - docs/review-ide/03-rozlozeni.md
  - docs/review-ide/04-projekty-a-funkce.md
priority: medium
type: task
ordinal: 700000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připravit tikety pro Funkce a reference, režimy a tool windows, Project view, Přehled projektu a původ změn.

### Podklady

- `docs/review-ide/03-rozlozeni.md`, `docs/review-ide/04-projekty-a-funkce.md`; `docs/review-ide/05-funkce.md`, oddíly 1, 3 a 7; `docs/review-ide/06-ai-a-review.md`, body 5 a 11; `docs/review-ide/07-funkce-z-ide.md`, bod 4.
- Záznamy rozhodnutí z TASK-57 a TASK-59.

### Poznámky k rozsahu

- Seznam tabů pravého sidebaru je součást kontraktu se spárovanými klienty; přesun panelů mezi stranami naplánuj tak, aby starší klient rozložení dál načetl.
- Milník je velký; navrhni dělení na vlny a zeptej se uživatele na pořadí.

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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Podklady z TASK-57 (2026-11-19): decision-7 navrhuje pro agenty ve Funkci seznam cest místo složky se symbolickými odkazy. Pro plán M7: výpočet skutečných cest referencí na stroji agenta; additionalDirectories ve strukturované relaci Claude a --add-dir u terminálového agenta; zakazující pravidla Edit na cesty referencí předaná relaci, ne zapsaná do repozitáře; seznam referencí v kontextu (hledání bez cesty reference nezahrne); chování při změně členů Funkce za běhu; Codex a ostatní agenti zatím jen seznam cest v kontextu. Otázky pro uživatele: 1) přijmout seznam cest (doporučeno) místo složky odkazů; 2) blokovat přepnutí reference, když ji má běžící relace přidanou (doporučeno neblokovat a relaci změnu oznámit; jinak reference zastará, dokud relace běží); 3) načítat agentovi CLAUDE.md referencí (doporučeno ne: instrukce pro cizí platformu zabírají kontext). Neověřeno: Codex během, interaktivní relace, Windows, WSL, SSH.
<!-- SECTION:NOTES:END -->
