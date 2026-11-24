---
id: TASK-166
title: 'Tok práce: model jednotky práce, fáze, lhůty a rozhraní pro zdroje faktů'
status: Done
assignee: []
created_date: '2026-11-24T09:05:00Z'
updated_date: '2026-11-24T10:16:00Z'
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
- [x] #1 Modul odvodí fázi a váznutí pro každou řádku tabulky v dokumentaci; testy pokrývají hranice lhůt přes víkend a změnu fáze
- [x] #2 Chybějící nebo neznámý fakt dá fázi neznámou s důvodem, nikdy fázi podle zbylých faktů
- [x] #3 Klíč tiketu se čte ze jména větve i z názvu pull requestu; výslovně připojený tiket workspace má přednost; testy pokrývají běžné tvary jmen větví
- [x] #4 Nastavení má výchozí lhůty 1, 2, 1 a 3 pracovní dny a výchozí vzory tagů; neplatné hodnoty se čtou jako výchozí
- [x] #5 Existuje záznam rozhodnutí s architekturou skládání, seznamem metod a schopností a chováním pro SSH worktree, folder workspace bez gitu, staršího klienta a staršího hostitele
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker, 2026-11-24): (1) čistý modul v src/shared/work-flow/: typy faktů a jednotky práce, odvození fáze a váznutí, pracovní dny, klíč tiketu, nastavení lhůt/oznámení a vzory tagů s normalizátory, převod HostedReviewInfo na fakta; testy vedle. (2) Registrace nepovinných polí nastavení v GlobalSettings a Repo jen jako typ; ukládání a zápis patří TASK-169 a TASK-173/175. (3) Záznam rozhodnutí o architektuře skládání (hostitelé, metody, schopnosti, obnova, výpadek zdroje, SSH, folder workspace, starší protějšky), status proposed. (4) Sladit docs/review-ide/10-tok-prace.md tam, kde model zpřesňuje tabulku fází.

Stav: modul src/shared/work-flow/ napsaný (work-fact, work-unit-facts, work-phase, working-day-deadline, work-stall, work-flow-settings, release-tag-patterns, work-ticket-key, work-review-verdict, hosted-review-work-facts, work-unit) a pole workFlow v GlobalSettings a workFlowReleaseTags v Repo jen jako typ. Zbývá: testy, tc a brány, záznam rozhodnutí, úprava docs/review-ide/10-tok-prace.md.

Stav: testy modulu prochází (5 souborů, 66 testů: work-phase, work-stall, work-flow-settings, work-ticket-key, work-unit). Zbývá: tc a brány (běží), záznam rozhodnutí, úprava docs/review-ide/10-tok-prace.md.

Hotovo (worker): modul src/shared/work-flow/ s testy (66), pole workFlow (GlobalSettings) a workFlowReleaseTags (Repo) jen jako typ, decision-17 (proposed) s architekturou skládání, docs/review-ide/10-tok-prace.md zpřesněná. Ověřeno: testy modulu, pnpm tc, check:code-quality:changed, oxlint, audit:anti-slop. Pro další tikety: TASK-167 má doplnit commit sloučení i mimo Azure DevOps, jinak je sloučená práce na GitHubu neznámá; TASK-169 musí řešit čerstvost tagů (fetch s --no-tags); TASK-170 má předat projectKeys a ověřit JQL s neexistujícím klíčem; TASK-171 staví čtečku odpovědi a zapíše workFlow do HOST_OPERATION_OWNERSHIP. Otázky na uživatele jsou ve zprávě workera (holé číslo ve jménu větve, odpověď bez nové verze, pull requesty vzdáleného hostitele).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Sdílený modul src/shared/work-flow: fakta známá/neznámá s důvodem, odvození fáze (šest fází z dokumentace plus Koncept a Sloučeno bez ostrého vzoru), lhůty v pracovních dnech podle hodin uživatele, váznutí, klíč tiketu, tvar nastavení lhůt a vzorů tagů (jen typy, ukládání staví TASK-169, 173, 175). decision-17 (přijato koordinátorem): jednotky skládá hostitel repozitáře, spojuje a váznutí přepočítává aplikace uživatele; metody workFlow.* se schopnostmi work-flow.v1, work-flow.branch-facts.v1, work-flow.release-tags.v1. Ověřeno: 66 testů modulu, pnpm tc, brána změněných řádků, anti-slop, oxlint. Architektura je ověřená jen čtením kódu; první běh proti vzdálenému hostiteli přijde v TASK-168/169.
<!-- SECTION:FINAL_SUMMARY:END -->
