---
id: TASK-166
title: 'Tok práce: model jednotky práce, fáze, lhůty a rozhraní pro zdroje faktů'
status: To Do
assignee: []
created_date: '2026-11-24T09:05:00Z'
labels:
  - review-ide
  - effort-xhigh
milestone: m-9
dependencies: []
documentation:
  - docs/review-ide/10-tok-prace.md
priority: high
type: feature
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Tok práce (docs/review-ide/10-tok-prace.md) skládá fakta z gitu, pull requestů, Jiry a tagů do jednotek práce s fází a lhůtou. Tento tiket určí model a pravidla, na kterých stojí ostatní tikety milníku M9, aby zdroje faktů i rozhraní vznikaly proti jednomu tvaru.

### Rozsah

- Sdílený čistý modul v `src/shared`: typy jednotky práce a faktů (větev, pull request, tiket, vydání), odvození fáze z faktů podle tabulky v dokumentaci, výpočet lhůt v pracovních dnech, čtení klíče tiketu ze jména větve a z názvu pull requestu.
- Tvar nastavení: lhůty a vypínače oznámení po fázích (nastavení aplikace), vzory ostrého a dev tagu (řádek repozitáře), s výchozími hodnotami z dokumentace.
- Záznam rozhodnutí o architektuře: kde se jednotky skládají, když repozitáře vedou různí hostitelé (tento počítač, SSH, vzdálený runtime), jaké metody a schopnosti přibudou, jak často se fakta obnovují a co se stane, když zdroj neodpoví.

### Mimo rozsah

- Čtení faktů (TASK-167 až TASK-170), skládání na hostiteli (TASK-171) a rozhraní.

### Omezení

- Fakt, který zdroj nedodal, je neznámý, ne záporný: jednotka pak nemá fázi vymyšlenou z poloviny dat. U hostitele bez spojení platí slovník live / unverifiable / exited z AGENTS.md pro to, co se týká běhu; fáze práce je při ztrátě spojení neznámá.
- Model nesmí být vázaný na Azure DevOps: fáze musí jít odvodit i z `HostedReviewInfo` (`src/shared/hosted-review.ts`).
- Do sledovaných souborů nepatří názvy firemních projektů ani jejich tagů; vzory tagů popiš obecně.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Modul odvodí fázi a váznutí pro každou řádku tabulky v dokumentaci; testy pokrývají hranice lhůt přes víkend a změnu fáze
- [ ] #2 Chybějící nebo neznámý fakt dá fázi neznámou s důvodem, nikdy fázi podle zbylých faktů
- [ ] #3 Klíč tiketu se čte ze jména větve i z názvu pull requestu; výslovně připojený tiket workspace má přednost; testy pokrývají běžné tvary jmen větví
- [ ] #4 Nastavení má výchozí lhůty 1, 2, 1 a 3 pracovní dny a výchozí vzory tagů; neplatné hodnoty se čtou jako výchozí
- [ ] #5 Existuje záznam rozhodnutí s architekturou skládání, seznamem metod a schopností a chováním pro SSH worktree, folder workspace bez gitu, staršího klienta a staršího hostitele
<!-- AC:END -->
