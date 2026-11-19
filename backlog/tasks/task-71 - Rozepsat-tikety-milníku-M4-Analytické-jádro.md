---
id: TASK-71
title: Rozepsat tikety milníku M4 Analytické jádro
status: To Do
assignee: []
created_date: '2026-11-18T12:45:00Z'
updated_date: '2026-11-19T15:50:00Z'
labels:
  - review-ide
  - planovani
  - effort-xhigh
milestone: m-4
dependencies:
  - TASK-70
  - TASK-132
documentation:
  - docs/review-ide/01-integrace.md
  - docs/review-ide/05-funkce.md
priority: medium
type: task
ordinal: 400000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připravit tikety pro model kódu, extraktory, cache a první dva pohledy nad modelem.

### Podklady

- `docs/review-ide/01-integrace.md`, Analytické jádro a tabulka funkcí; `docs/review-ide/05-funkce.md`, oddíly 9 a 11.
- Záznam rozhodnutí a návrh schématu z TASK-60, včetně rozhodnutí uživatele o distribuci extraktorů.

### Poznámky k rozsahu

- Nový typ tabu `code-view`, proces na pozadí přes process host, cache podle repozitáře a SHA, jedno API pro renderer i agenty.
- Pohledy Moduly a vrstvy a Controllery a akce.

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
Podklady z TASK-60 (2026-11-19): decision-9 a docs/review-ide/09-model-kodu.md. Navržené tikety pro rozpis M4: jádro modelu kódu (typy schématu, skládání snímku, cache podle obsahu, čtení zdrojů lokalizace; testy nad tests/fixtures/code-model); extraktor Kotlin (statická čtečka Gradlu a PSI, připnutá verze kompilátoru, hlášení nerozhodnutých konstrukcí; Groovy DSL zatím ne); extraktor Swift (SwiftSyntax v buildu Orky jako dnešní Swift helpery, čtečky pbxproj, Tuist a SwiftPM; jen macOS); extraktor C# (nástroj nad Roslynem, statická čtečka s podmínkami MSBuildu); distribuce a doprava na vzdálený stroj přes SSH; pokus o voláních a rozpoznávacím profilu dřív, než se staví navigační graf a lokalizace (část schématu references není prototypem ověřená); úprava docs/review-ide/01-integrace.md po přijetí decision-9 (cache podle obsahu místo repozitář a SHA, statické čtení místo Gradle modelu). Příště pokus tohoto rozsahu dělit po jazycích, schéma zvlášť. Otázky pro uživatele: 1) distribuce extraktorů: A všechno přibalit (instalátor zhruba +145 MB na macOS, +125 MB jinde), B přibalit vlastní kód a knihovny stáhnout při prvním použití (doporučeno; +18 MB na macOS, stáhne 62 MB pro Kotlin a 10 MB pro C#, potřebuje JVM a .NET uživatele), C sestavit z nástrojů uživatele; 2) vyzkoušet krátkým pokusem tree-sitter místo tří extraktorů dřív, než se začnou produktizovat (doporučeno ano; odpadla by distribuce i omezení Swiftu na macOS); 3) přijmout statické čtení build souborů jako výchozí (doporučeno ano).

Odpověď uživatele 2026-11-19 (decision-12): decision-9: vlastní kód přibalit, knihovny stáhnout při prvním použití; statické čtení build souborů jako výchozí, Gradle a MSBuild volitelně pro okrajové případy a hlubší integraci. Před rozpisem proběhne pokus s tree-sitter (nový tiket).

Odpověď uživatele 2026-11-19 (decision-12): pořadí milníků po M2 je M3, M4, M5, M6, M7, M8; milník se rozepíše až po rozepsání předchozího.
<!-- SECTION:NOTES:END -->
