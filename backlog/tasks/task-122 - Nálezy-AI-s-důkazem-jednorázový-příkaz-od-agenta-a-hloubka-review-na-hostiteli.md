---
id: TASK-122
title: >-
  Hloubka review na hostiteli: spuštění bran v review worktree jen při zvolené
  hloubce
status: To Do
assignee: []
created_date: '2026-11-19T09:36:00Z'
updated_date: '2026-11-20T16:20:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-88
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 208100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Orca má spouštění kódu v review worktree povolit jen při hloubce review, kterou uživatel zvolil. Dnes je hloubka jen text v promptu a nic ji nevynucuje; v review worktree přitom běží kód autora pull requestu.

### Rozsah

- Hloubka review: dnes jen text v promptu (`src/shared/azure-devops-review-options.ts`). Orca si ji u review pull requestu zapamatuje na hostiteli (vedle `src/main/azure-devops/review/azure-devops-review-worktree-registry.ts`) a podle ní spuštění brány v review worktree povolí nebo odmítne. Týká se `qualityGates.run`, `orca gates run`, nástroje `ado_run_gate` z TASK-88 i smyčky zpětné vazby.
- Rozhodnutí navrhni tak, aby se jím řídil i jednorázový příkaz z TASK-161.

### Mimo rozsah

- Jednorázový příkaz od agenta a strop jistoty jeho důkazu: TASK-161. Karta draftu: TASK-159 a TASK-162.
- Druh důkazu z běhu brány a jeho ověření: TASK-88 (hotovo).

### Omezení

- V review worktree běží kód autora pull requestu. Spuštění je dovolené jen při hloubce review, kterou uživatel zvolil; `static` nespouští nic.
- Jednorázový příkaz od agenta nedokazuje nic víc, než že tento příkaz na tomto commitu skončil tímto kódem; agent si ho může napsat tak, aby selhal. Proto nikdy nedá jistotu ověřeno důkazem a rozhraní ukazuje příkaz celý a nezkrácený.
- SSH review worktree: běh, jeho záznam i zapamatovaná hloubka jsou na vzdáleném hostiteli.
- Klient a hostitel se aktualizují nezávisle: nové parametry `orca gates` a RPC nepovinné.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Při statickém review Orka spuštění brány v review worktree odmítne s vysvětlením, ať přijde z okna, CLI, nástroje agenta nebo smyčky zpětné vazby; spuštění je možné jen při hloubce, kterou uživatel zvolil v možnostech review
- [ ] #2 Hloubka review je zapamatovaná na hostiteli review worktree; v SSH review worktree o spuštění rozhoduje vzdálený hostitel podle své zapamatované hloubky
- [ ] #3 Worktree, který není review worktree, se pravidlo netýká; review worktree bez zapamatované hloubky (vzniklý ve starším sestavení) se chová jako statický a hláška říká, jak hloubku zvolit
- [ ] #4 Starší klient i starší hostitel fungují dál; nové pole je nepovinné a test kompatibility to dokládá
- [ ] #5 Testy pokrývají odmítnutí při statickém review pro každou cestu spuštění a povolení při zvolené hloubce
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rozděleno 2026-11-20 podle pravidla velikosti: jednorázový příkaz od agenta převzal TASK-161, jeho zobrazení na kartě draftu TASK-162.
<!-- SECTION:NOTES:END -->
