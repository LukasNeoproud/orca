---
id: decision-16
title: >-
  Tok práce: přehled, odznaky a oznámení na ploše; lhůty 1, 2, 1 a 3 pracovní
  dny; vydání podle ostrého a dev tagu; milník M9 před zbytkem M2
date: '2026-11-24T09:03:00Z'
status: accepted
---
## Context

Uživatel 2026-11-24 zadal pět funkcí nad rámec dosavadní dokumentace Review IDE: tikety z Jiry se stavem a návazností na pull requesty, upozornění na větev bez pull requestu, na review, které trvá dlouho, na opravy po review, na které zapomněl, a na sloučenou funkci, se kterou dlouho nevyšel build. Zadání je v `docs/review-ide/10-tok-prace.md`. Koordinátor se zeptal na formu upozornění, lhůty, význam vydání a pořadí.

## Decision

- **Forma:** přehled Moje práce, odznaky (postranní panel, karta workspace) a oznámení na ploše při překročení lhůty. Telefon ne.
- **Výchozí lhůty v pracovních dnech:** větev bez pull requestu 1, pull request čeká na review 2, nevyřešené připomínky reviewera 1, sloučeno a nevydáno 3. Uživatel čtvrtou lhůtu zkrátil z navržených 7 na 3. Lhůty jdou změnit v nastavení.
- **Vydání:** dva stupně podle tagů, dev build a ostrý build; upozornění se řídí ostrým tagem. Vzory tagů se nastavují u repozitáře.
- **Pořadí:** samostatný milník M9 zařazený před zbytek M2.

## Consequences

- M2 se zdrží o dobu M9 (11 tiketů, TASK-166 až TASK-176).
- Seznam pull requestů se začne obnovovat na pozadí i bez automatického review; přibudou čtecí dotazy do Azure DevOps a do Jiry.
- Orca nezapisuje nic navenek: žádný komentář reviewerovi, žádná změna tiketu.
- Fakta, která pro tok práce přibudou u pull requestů (revieweři, nevyřešená vlákna), použijí i TASK-99 a TASK-102.
