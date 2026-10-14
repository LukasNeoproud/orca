---
id: TASK-10
title: Zkontrolovat a uložit návrhy úkolů a dokumentace z chatu
status: To Do
assignee: []
created_date: '2026-09-17 12:39'
labels: []
dependencies:
  - TASK-9
references:
  - 'https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed'
documentation:
  - docs/reference/backlog-integration.md
type: feature
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Uživatel potřebuje před trvalým zápisem posoudit konkrétní obsah navržený agentem, vybrat vhodné položky a upravit je bez dalšího přepisování. Navázat kartu a detail na uložený návrh. Backlog.md zůstává kanonickým úložištěm; nebudovat druhý tracker. Spuštění práce z uloženého úkolu již řeší TASK-1 a není součástí tohoto úkolu.

Společné požadavky: navázat na existující strukturovaný chat a runtime Orcy; podporovat SSH execution host i folder workspace bez Gitu, zachovat kompatibilitu různých verzí klienta a hostitele a respektovat docs/STYLEGUIDE.md. Konkrétní dostupnost agentních API ověřit při implementaci; tvrzení ze zdrojové diskuse nejsou ověřeným kontraktem instalované verze.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Karta v chatu zobrazuje důvod a položky návrhu; detail nabízí renderovaný obsah a u úprav diff vůči existujícímu záznamu.
- [ ] #2 Uživatel může obsah upravit, vybrat položky k uložení nebo návrh odložit; nevybrané závislosti a reference jsou před zápisem srozumitelně vyřešeny.
- [ ] #3 Zápis provede existující integrace prostřednictvím Backlog.md CLI na správném execution hostu a uloží přesně odsouhlasenou revizi obsahu.
- [ ] #4 Souhlas se váže na konkrétní revizi návrhu a při souběžné změně cílového záznamu se zobrazí konflikt místo přepsání; explicitní pokyn uživatele ke stejnému zápisu nevyžaduje zbytečné druhé schválení.
- [ ] #5 Výsledek obsahuje skutečná ID a cesty uložených záznamů; při částečném selhání je patrné, co uspělo, a opakování nevytváří duplicity.
- [ ] #6 Pouhé zobrazení, obnovení nebo odložení návrhu nezapisuje ani Backlog draft; zápis sám nespouští implementaci, commit či push.
- [ ] #7 Testy pokrývají editaci návrhu, výběr položek, konflikt revizí, částečný zápis, opakování a obnovení historie bez vedlejších účinků.

<!-- AC:END -->
