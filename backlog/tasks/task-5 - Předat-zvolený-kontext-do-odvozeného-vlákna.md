---
id: TASK-5
title: Předat zvolený kontext do odvozeného vlákna
status: To Do
assignee: []
created_date: '2026-09-17 12:38'
labels: []
dependencies:
  - TASK-4
references:
  - 'https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed'
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

- [ ] #1 Při vyčlenění lze zvolit zachování dosavadního kontextu nebo cílené zadání a před vytvořením zobrazit a upravit předávaný obsah.
- [ ] #2 Cílené zadání zachytí účel, rozsah, omezení, relevantní rozhodnutí, reference a očekávané ověření; nepředává automaticky celý transcript.
- [ ] #3 Výslovné požadavky a přijatá rozhodnutí jsou odlišeny od návrhů agenta a otevřených otázek; historický výběr nepřebírá pozdější rozhodnutí.
- [ ] #4 U nového vlákna je dostupný přesný uložený předávací obsah, jeho režim a odkaz na původní pasáž; navigační přístup k rodiči není prezentován jako kontext již předaný modelu.
- [ ] #5 Změna konverzačního kontextu nemění implicitně projektové instrukce ani oprávnění a při selhání generování lze zadání připravit ručně.
- [ ] #6 Testy pokrývají upravený náhled versus skutečně předaný obsah, vyloučení nesouvisejících pasáží a neměnnost již uloženého předání.

<!-- AC:END -->
