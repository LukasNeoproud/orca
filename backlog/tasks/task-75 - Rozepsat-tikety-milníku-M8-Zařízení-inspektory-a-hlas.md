---
id: TASK-75
title: Rozepsat tikety milníku M8 Zařízení, inspektory a hlas
status: To Do
assignee: []
created_date: '2026-11-18T12:45:00Z'
updated_date: '2026-11-19T15:50:00Z'
labels:
  - review-ide
  - planovani
  - effort-high
milestone: m-8
dependencies:
  - TASK-74
documentation:
  - docs/review-ide/08-zarizeni-inspektory-hlas.md
  - docs/review-ide/07-funkce-z-ide.md
priority: medium
type: task
ordinal: 800000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připravit tikety pro build a nasazení na zařízení, karty logů, inspektory, přístupnost a hlas.

### Podklady

- `docs/review-ide/08-zarizeni-inspektory-hlas.md`; `docs/review-ide/07-funkce-z-ide.md`, body 6, 7, 9, 12 a 13; `docs/review-ide/06-ai-a-review.md`, bod 9.
- Co fork už má: `src/main/emulator`, `src/renderer/src/components/emulator-pane`, `src/main/speech`, `src/main/notifications`.

### Poznámky k rozsahu

- Funkce jsou na sobě málo závislé. Navrhni pořadí podle přínosu a nech uživatele vybrat, které chce.
- Napojení na vnější služby (Crashlytics, Play Vitals) a MITM proxy jsou rozhodnutí uživatele.

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
Odpověď uživatele 2026-11-19 (decision-12): pořadí milníků po M2 je M3, M4, M5, M6, M7, M8; milník se rozepíše až po rozepsání předchozího.
<!-- SECTION:NOTES:END -->
