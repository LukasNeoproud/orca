---
id: TASK-170
title: 'Tok práce: tiket z Jiry u jednotky práce'
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
ordinal: 154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Uživatel chce u své práce vidět tiket z Jiry a jeho stav. Orca už Jiru čte (`src/main/jira/`); chybí přiřazení tiketu k větvi a pull requestu a dávkové čtení stavu.

### Rozsah

- Pro klíče tiketů, které určí model z TASK-166 (připojený tiket workspace, jméno větve, název pull requestu), přečti jedním dotazem název, stav, typ a řešitele přes stávajícího klienta Jiry a jeho frontu požadavků.
- Mezipaměť s dobou platnosti, aby obnova přehledu Jiru nezahlcovala.

### Mimo rozsah

- Zápis do Jiry a změna stavu tiketu.
- Zobrazení: TASK-172 a TASK-174.

### Omezení

- Bez připojené Jiry nebo při chybě je tiket u jednotky neznámý; jednotka se ukáže dál.
- Klíč, který v Jiře neexistuje nebo k němu uživatel nemá přístup, se neopakuje v každém kole.
- Pracuje s uloženým přihlášením: žádný údaj z něj nesmí do logu ani do odpovědi klientovi.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pro jednotku s klíčem tiketu jsou známé název, stav, typ a řešitel tiketu; více klíčů se čte jedním dotazem
- [ ] #2 Bez připojené Jiry, při chybě a u neexistujícího klíče je tiket neznámý s důvodem a čtení se pro ten klíč v dalším kole neopakuje
- [ ] #3 Mezipaměť omezuje počet dotazů na kolo obnovy; test to dokládá
- [ ] #4 Testy se smyšlenými odpověďmi Jiry pokrývají dávku, chybu, chybějící přístup a vypršení mezipaměti
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Z TASK-166 (decision-17): čtení klíče (src/shared/work-flow/work-ticket-key.ts) předat seznam projektů z Jiry (projectKeys) a ověřit, jestli dotaz JQL na více klíčů selže celý při jednom neexistujícím. Klíč sám neurčuje web Jiry. Holé číslo ve jménu větve se bez projektu nečte; odkud projekt vzít, je otevřená otázka na uživatele (položená 2026-11-24), do odpovědi platí chování bez projektu.
<!-- SECTION:NOTES:END -->
