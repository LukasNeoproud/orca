---
id: TASK-9
title: Zpřístupnit agentovi návrhy změn Backlog.md
status: To Do
assignee: []
created_date: '2026-09-17 12:39'
labels: []
dependencies: []
references:
  - 'https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed'
documentation:
  - docs/reference/backlog-integration.md
type: feature
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Z diskusí vznikají následné úkoly a trvalé požadavky, které se dnes musí přenášet ručně. Dodat agentovi vyhledání, načtení a předložení strukturovaného návrhu vytvoření nebo úpravy úkolů a dokumentace. Návrh má vlastní uložený stav v Orce, ale ještě není záznamem Backlog.md. Uživatelská kontrola a aplikace návrhu jsou samostatný navazující úkol. Rozšířit existující integraci; společný tracking root napříč worktrees zde nezavádět.

Společné požadavky: navázat na existující strukturovaný chat a runtime Orcy; podporovat SSH execution host i folder workspace bez Gitu, zachovat kompatibilitu různých verzí klienta a hostitele a respektovat docs/STYLEGUIDE.md. Konkrétní dostupnost agentních API ověřit při implementaci; tvrzení ze zdrojové diskuse nejsou ověřeným kontraktem instalované verze.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Agent může vyhledat a načíst související úkoly a dokumentaci v backlogu workspace a získat jejich identitu a podklad pro detekci souběžné změny.
- [ ] #2 Agent může předložit návrh obsahující vytvoření nebo úpravu úkolu či dokumentu, včetně akceptačních kritérií a vazeb mezi položkami; návrh sám nezapisuje do Backlog.md.
- [ ] #3 Návrh rozlišuje požadavky, přijatá rozhodnutí a otevřené otázky; integrační instrukce vedou k vyhledání existující práce a doplnění místo duplicity.
- [ ] #4 Nástroje jsou skutečně dostupné podporovanému agentovi; obsluha nových i obnovených konverzací a nepodporovaných verzí je ověřená, bez ručních úprav interní historie agenta.
- [ ] #5 Projekt, workspace a execution host určuje hostitelská vazba konverzace; návrh nemůže libovolnou cestou přesměrovat cílový backlog.
- [ ] #6 Návrh má stabilní ID, revizi a stav, lze jej znovu načíst po restartu a agent dostává jednoznačné potvrzení, že backlog dosud nebyl změněn.
- [ ] #7 Testy pokrývají neplatný návrh, nedostupný backlog, izolaci projektů a hostů, obnovu a opakované doručení.

<!-- AC:END -->
