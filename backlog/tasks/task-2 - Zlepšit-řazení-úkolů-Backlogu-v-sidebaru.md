---
id: TASK-2
title: Zlepšit řazení úkolů Backlogu v sidebaru
status: Done
assignee: []
created_date: '2026-09-16 13:49'
updated_date: '2026-09-16 13:56'
labels: []
dependencies: []
references:
  - src/renderer/src/components/right-sidebar/BacklogPanel.tsx
  - src/main/backlog/backlog-json.ts
  - src/shared/backlog-types.ts
type: enhancement
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Ověřeno statickou kontrolou: BacklogPanel.tsx seznam pouze filtruje a zachovává pořadí snapshot.tasks; vlastní řazení ani jeho volbu nenabízí. parseTask v backlog-json.ts navíc nepřenáší ordinal, přestože Backlog.md jej u úkolu poskytuje. Samotné chybné pořadí v běžícím UI nebylo reprodukováno. Cílem je předvídatelné a uživatelsky srozumitelné řazení. Návrh: výchozí pořadí podle pořadí úkolů v Backlog.md, volitelně podle ID a priority; přesnou výchozí politiku upřesnit při implementaci. Znovu využít existující ovládací prvky a respektovat vlastní priority projektu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Sidebar nabízí jasně označenou volbu řazení podle pořadí Backlogu, ID nebo priority; výchozí pravidlo je zdokumentované.
- [x] #2 Řazení podle ID používá přirozené číselné pořadí (TASK-2 před TASK-10); shody mají deterministické dořazení.
- [x] #3 Pokud se používá ordinal, přenáší se jako volitelné pole a chybějící hodnoty ze staršího runtime mají definovaný fallback.
- [x] #4 Vyhledávání, filtr statusu a aktualizace snapshotu zachovávají zvolený způsob řazení; řazení nemění zdrojová task data.
- [x] #5 Testy pokrývají číselná ID, shodné a chybějící pořadí či priority a aktualizaci seznamu při aktivním filtru.

<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Implementováno řazení podle ordinal (výchozí), přirozeného ID a konfigurované priority projektu. Volitelná metadata jsou kompatibilní se starším runtime; priority se načítají na execution hostu bez blokování seznamu. Pokryto testy filtrování, aktualizace snapshotu, fallbacků, vlastních priorit a reálným Backlog.md CLI. Vizuální ověření v Electronu nebylo provedeno: požadovaný electron skill není dostupný.
<!-- SECTION:FINAL_SUMMARY:END -->
