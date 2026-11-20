---
id: decision-13
title: 'Brány kvality: agent brány navrhuje, platit začnou až po schválení uživatelem'
date: '2026-11-20T09:40:00Z'
status: accepted
---
## Context

Definice bran kvality zapisuje jen okno aplikace; žádná metoda `qualityGates.*` ani CLI je nepíše (decision-11), aby agent nekontroloval svou práci příkazem, který si sám zvolil. Uživatel se 2026-11-20 zeptal, jestli může agent brány měnit aspoň ve chvíli, kdy se jejich podoba volí, a jestli dávají smysl předdefinované brány.

Zvažované možnosti:

- **Dočasné právo zápisu** („teď smíš měnit, potom ne“): agent, který právě opravuje selhávající testy, by v tom okně mohl bránu změkčit a Orca by to nepoznala.
- **Návrh ke schválení:** agent pošle návrh, uživatel ho v nastavení repozitáře přijme nebo zahodí.
- **Šablony bran podle typu projektu** (Gradle, Xcode, .NET, Node).

## Decision

- Agent brány jen navrhuje. Návrh (název, příkaz, povinná nebo volitelná, limit času) se uloží jako čekající a v nastavení repozitáře se ukáže jako rozdíl proti platným branám. Uživatel ho přijme celý, po položkách, nebo zahodí.
- Dokud návrh není přijatý, nic se podle něj nespouští a platí dosavadní brány.
- Šablony bran se nedělají (rozhodnutí uživatele 2026-11-20: založit tiket pouze na návrhy bran).

## Consequences

- Pravidlo z decision-11 platí dál: příkaz, kterým se práce agenta kontroluje, vždy potvrdil člověk.
- Přibude jedna metoda, kterou agent a CLI zapisují návrh; platné definice dál nepíše žádná.
- Tikety: TASK-148 (hostitel a protokol) a TASK-149 (rozhraní).
