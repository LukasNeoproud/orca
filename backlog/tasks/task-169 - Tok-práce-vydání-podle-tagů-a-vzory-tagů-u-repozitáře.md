---
id: TASK-169
title: 'Tok práce: vydání podle tagů a vzory tagů u repozitáře'
status: To Do
assignee: []
created_date: '2026-11-24T09:05:00Z'
updated_date: '2026-11-24T10:16:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-9
dependencies:
  - TASK-166
documentation:
  - docs/review-ide/10-tok-prace.md
priority: high
type: feature
ordinal: 153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Sloučená funkce někdy dlouho nevyjde v buildu. Orca má podle tagů v repozitáři poznat, jestli je commit sloučení v dev buildu a jestli je v ostrém buildu.

### Rozsah

- Vzory ostrého a dev tagu na řádku repozitáře, zapisované stejnou cestou jako ostatní nastavení repozitáře.
- Metoda hostitele za novou schopností: pro zadané commity vrátí nejstarší ostrý a nejstarší dev tag, který je obsahuje, s časem tagu.
- Čerstvost tagů: využij fetch, který Orca už dělá; když tagy mohou být zastaralé, odpověď to řekne.

### Mimo rozsah

- Stav buildu z pipeline a z distribuce aplikací.
- Úprava vzorů v rozhraní: TASK-173.

### Omezení

- Git 2.25, omezený výstup, jeden dotaz na dávku commitů; žádné `ls-tree` ani `show` po refech.
- Repozitář bez vzoru nebo bez odpovídajících tagů vydání neukazuje; není to chyba.
- Orca do repozitáře uživatele nezapisuje nic kromě toho, co dnes dělá její fetch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pro commit obsažený v ostrém tagu hostitel vrátí tag a jeho čas; pro commit jen v dev tagu vrátí dev tag a ostrý jako nevydáno
- [ ] #2 Vzory tagů se ukládají u repozitáře, mají výchozí hodnoty z dokumentace a neplatný vzor se odmítne s vysvětlením
- [ ] #3 Repozitář bez odpovídajících tagů vrací stav vydání neznámý s důvodem, ne nevydáno
- [ ] #4 SSH repozitář: tagy čte vzdálený hostitel; metoda je za schopností a test kompatibility pokrývá staršího klienta i hostitele
- [ ] #5 Testy nad skutečným gitem: anotovaný i lehký tag, commit před tagem a po něm, squash merge, tisíc tagů bez neomezeného výstupu
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Z TASK-166 (decision-17): několik fetchů Orky běží s --no-tags; tiket musí zjistit, jak čerstvé tagy repozitář má, a jinak vracet tags-stale. Přidat metodu workFlow.releaseTags (schopnost work-flow.release-tags.v1) pro zkoušku vzorů v nastavení, protože TASK-173 nesmí měnit výměnu mezi klientem a hostitelem. Zápis vzorů přes repo.update jen s touto schopností.
<!-- SECTION:NOTES:END -->
