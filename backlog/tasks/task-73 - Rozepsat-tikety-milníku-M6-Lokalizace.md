---
id: TASK-73
title: Rozepsat tikety milníku M6 Lokalizace
status: To Do
assignee: []
created_date: '2026-11-18T12:45:00Z'
updated_date: '2026-11-19T11:41:00Z'
labels:
  - review-ide
  - planovani
  - effort-high
  - ceka-na-uzivatele
milestone: m-6
dependencies:
  - TASK-58
documentation:
  - docs/review-ide/05-funkce.md
priority: medium
type: task
ordinal: 600000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připravit tikety pro tabulku lokalizačních klíčů, čekající změny a klienta POEditoru.

### Podklady

- `docs/review-ide/05-funkce.md`, oddíly 13 a 14.
- Záznam rozhodnutí z TASK-58.
- Vzor připojení se šifrovaným tokenem: `src/main/azure-devops`.

### Poznámky k rozsahu

- Parsery `strings.xml`, `xcstrings` a `resx` musí soubor zapsat zpět beze změny formátování nedotčených částí.
- Stažení i odeslání jen na pokyn uživatele.

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
Podklady z TASK-58 (2026-11-18): decision-6 navrhuje synchronizaci přes JSON metody API (terms/add, terms/update, languages/update po jazycích, translations/delete, terms/delete, mazání na konci, ověřovací čtení), bez projects/sync a sync_terms; výchozí dávka 100 položek, rozestup 1 s, strop 1 500 požadavků za hodinu; kontrola zastaralosti přes projects/view a languages/list; stav stahovat přes terms/list. Pro plán M6 navíc: mapování klíčů platforem na term + context (resx nemá kontext ani množné tvary, Android nemá string-array, xcstrings dělí varianty podle zařízení na samostatné klíče). Nic není ověřené proti živému API; měření má TASK-113, který čeká na token testovacího projektu a na údaj o tarifu týmu.

Odpověď uživatele 2026-11-19 (decision-12): bez živého měření POEditoru (TASK-113 zrušen); tarif týmu je Plus, limity podle dokumentace.
<!-- SECTION:NOTES:END -->
