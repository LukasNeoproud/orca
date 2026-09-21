---
id: TASK-12
title: Zobrazovat tok/s v konverzaci pro vyhodnocení /fast režimu
status: To Do
assignee: []
created_date: '2026-09-21 09:54'
labels: []
dependencies: []
type: feature
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Zobrazovat rychlost generování odpovědi v tokenech za sekundu (tok/s), aby uživatel mohl porovnávat běžný a /fast režim. Metriku uvést nenápadně u odpovědi spolu s modelem a režimem platným pro danou odpověď. Při implementaci ověřit dostupnost tokenových statistik a časování poskytovatele; neodvozovat přesné tokeny z počtu znaků. Podporovat lokální i SSH konverzace a folder workspaces.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 U odpovědi je dostupná hodnota tok/s a informace o modelu a režimu použitých při jejím generování; dokončená hodnota zůstane dohledatelná v konverzaci.
- [ ] #2 Výpočet má jasně popsaný počet tokenů a časový interval; odděluje generování od čekání na první token, běhu nástrojů a přerušení. Případný odhad je označen.
- [ ] #3 Běžný a /fast režim používají stejnou metodiku, takže jejich rychlost lze uživatelsky porovnat; při nedostupných datech UI nevymýšlí hodnotu.
- [ ] #4 Metrika respektuje design systém, nezahltí konverzaci a funguje i při vzdáleném běhu; chybějící podpora staršího hostitele nezablokuje chat.
<!-- AC:END -->
