---
id: decision-15
title: >-
  Review: statické review brány nespustí ani z okna, starší review worktree je
  statický, důkaz z běhu brány zůstává podle TASK-88
date: '2026-11-24T07:48:00Z'
status: accepted
---
## Context

Tikety TASK-88 a TASK-122 nechaly otázky na uživatele: chování statického review vůči spuštění z okna, chování review worktrees vzniklých před TASK-122 a tři pravidla ověření důkazu z běhu brány. Uživatel 2026-11-24 u všech potvrdil doporučení, tedy stav z těchto tiketů.

## Decision

- **Statické review nespustí bránu v review worktree ani z okna aplikace.** Orka odmítne s hláškou, jak hloubku změnit; potvrzení „spustit kód autora“ v okně se nestaví.
- **Review worktree bez zapamatované hloubky je statický.** Brány se v něm spustí až po novém AI review s hloubkou Build nebo Build and run tests.
- **Důkaz z běhu brány (TASK-88) zůstává, jak je:**
  - běh, který prošel, dá nálezu jistotu nejisté s důvodem, ne rozporné;
  - úprava příkazu brány zneplatní starší důkazy;
  - ověřeno důkazem říká jen, že brána na commitu selhala; ověření nerozlišuje selhání, které je i v cílové větvi, a nevidí stav, který git nevidí (ignorované soubory, skip-worktree).

## Consequences

- Po aktualizaci se v rozpracovaných review worktrees brány nespustí, dokud uživatel nespustí nové AI review s hloubkou.
- Porovnání s během na cílovém commitu a zjišťování skrytých změn stromu se neplánují; kdyby se ukázaly potřebné, je to nové rozhodnutí.
- Podrobná pravidla jsou v decision-10 (oddíly Ověření běhu brány a Hloubka review a spouštění kódu).
