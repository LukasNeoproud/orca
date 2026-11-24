---
id: decision-18
title: >-
  Tok práce: projekt Jiry u repozitáře, odpověď bez nové verze fázi nemění, pull
  requesty vzdáleného hostitele smí doplnit aplikace uživatele
date: '2026-11-24T10:38:00Z'
status: accepted
---
## Context



## Decision



## Consequences

## Context

TASK-166 (decision-17) nechal tři otázky na uživatele. Uživatel odpověděl 2026-11-24.

## Decision

- **Projekt Jiry u repozitáře:** repozitář dostane nastavení „projekt Jiry“. Jméno větve s holým číslem (`feature/123-nazev`) pak ukáže tiket už bez pull requestu. Uživatel má všechny tikety svých projektů v jednom projektu Jiry a větve bez klíče.
- **Odpověď v diskusi bez nové verze** fázi „čekají opravy“ neukončí. Ukončí ji vyřešení vláken nebo nová verze. Přehodnotí se podle ověření na skutečných datech (TASK-176).
- **Pull requesty repozitářů na vzdáleném hostiteli bez přihlášení k poskytovateli** smí aplikace, u které uživatel sedí, doplnit vlastním přihlášením. Je to výjimka z pravidla `credential` v decision-17. Uživatel vzdálené stroje nepoužívá, proto má nízkou prioritu.

## Consequences

- TASK-170 přidá nastavení projektu Jiry u repozitáře a předá ho čtení klíče.
- Výjimku pro vzdáleného hostitele staví TASK-177 na konci M9; do té doby je fáze takových jednotek neznámá s důvodem `not-connected`.
