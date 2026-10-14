---
id: TASK-8
title: Zobrazit tematický obsah konverzace
status: To Do
assignee: []
created_date: '2026-09-17 12:38'
labels: []
dependencies: []
references:
  - 'https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed'
type: feature
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Doslovný seznam promptů je u dlouhé diskuse nepřehledný, protože několik interakcí rozvíjí tentýž problém. Vytvořit chronologické kapitoly s významovými názvy a stabilními odkazy do historie. První verze seskupuje sousední interakce; globální témata přes nesousedící pasáže a napříč vlákny zůstávají následným rozšířením.

Společné požadavky: navázat na existující strukturovaný chat a runtime Orcy; podporovat SSH execution host i folder workspace bez Gitu, zachovat kompatibilitu různých verzí klienta a hostitele a respektovat docs/STYLEGUIDE.md. Konkrétní dostupnost agentních API ověřit při implementaci; tvrzení ze zdrojové diskuse nejsou ověřeným kontraktem instalované verze.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Několik sousedních interakcí o jednom problému může tvořit jednu kapitolu; název popisuje téma a nevydává odhad za potvrzení dokončení práce.
- [ ] #2 Položka obsahu přejde na příslušnou část historie a zůstává platná po dalších odpovědích i po obnovení konverzace.
- [ ] #3 Uživatel může kapitoly přejmenovat, spojit, rozdělit a zachovat zvolenou hranici; automatická aktualizace ruční úpravy nepřepisuje.
- [ ] #4 Nové turny aktualizují relevantní část obsahu bez opakovaného přeskupování celé historie; návrat ke staršímu tématu neporuší chronologii.
- [ ] #5 Automatické zpracování lze vypnout a má omezenou spotřebu; bez modelu funguje základní navigace a konverzace se kvůli indexaci implicitně neposílá jinému poskytovateli.
- [ ] #6 Testy pokrývají pokračování stejného tématu, změnu tématu, ruční úpravy, restart a neúspěch automatického zpracování.

<!-- AC:END -->
