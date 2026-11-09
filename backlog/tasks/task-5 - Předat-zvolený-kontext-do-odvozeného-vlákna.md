---
id: TASK-5
title: Předat zvolený kontext do odvozeného vlákna
status: In Progress
assignee: []
created_date: 2026-09-17 12:38
updated_date: '2026-11-09T20:51:00Z'
labels: []
dependencies:
  - TASK-4
references:
  - https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed
type: feature
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pro samostatný dílčí úkol je celá historie často zatížena nesouvisejícími požadavky. Uživatel musí znát a před vytvořením opravit obsah, který nový agent skutečně dostane. První verze nabízí zachování kontextu a cílené zadání z vybraného textu nebo odpovědi. Samostatný režim nativní compaction a prázdného vlákna není součástí tohoto úkolu.

Společné požadavky: navázat na existující strukturovaný chat a runtime Orcy; podporovat SSH execution host i folder workspace bez Gitu, zachovat kompatibilitu různých verzí klienta a hostitele a respektovat docs/STYLEGUIDE.md. Konkrétní dostupnost agentních API ověřit při implementaci; tvrzení ze zdrojové diskuse nejsou ověřeným kontraktem instalované verze.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Při vyčlenění lze zvolit zachování dosavadního kontextu nebo cílené zadání a před vytvořením zobrazit a upravit předávaný obsah.
- [ ] #2 Cílené zadání zachytí účel, rozsah, omezení, relevantní rozhodnutí, reference a očekávané ověření; nepředává automaticky celý transcript.
- [ ] #3 Výslovné požadavky a přijatá rozhodnutí jsou odlišeny od návrhů agenta a otevřených otázek; historický výběr nepřebírá pozdější rozhodnutí.
- [ ] #4 U nového vlákna je dostupný přesný uložený předávací obsah, jeho režim a odkaz na původní pasáž; navigační přístup k rodiči není prezentován jako kontext již předaný modelu.
- [x] #5 Změna konverzačního kontextu nemění implicitně projektové instrukce ani oprávnění a při selhání generování lze zadání připravit ručně.
- [ ] #6 Testy pokrývají upravený náhled versus skutečně předaný obsah, vyloučení nesouvisejících pasáží a neměnnost již uloženého předání.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementace: commity 532b087c24 (hostitel), 140f22f09f až 8b937d340d (chat), eeb61b4e46 (terminál), 907f175bfa (Android); návrh v docs/reference/conversation-branching.md.
Hotové režimy: celá konverzace, zhuštěná (/compact se zaměřením, proběhne hned) a nová konverzace s citovanou odpovědí; prompt je před vytvořením upravitelný a v nové větvi čeká neodeslaný. Strukturované cílené zadání (#2, #3), uložení přesného předaného obsahu (#4) a testy náhledu (#6) chybí.
<!-- SECTION:NOTES:END -->
