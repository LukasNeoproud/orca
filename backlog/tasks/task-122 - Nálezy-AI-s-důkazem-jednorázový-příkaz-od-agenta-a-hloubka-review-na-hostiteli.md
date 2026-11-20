---
id: TASK-122
title: >-
  Hloubka review na hostiteli: spuštění bran v review worktree jen při zvolené
  hloubce
status: Done
assignee: []
created_date: '2026-11-19T09:36:00Z'
updated_date: '2026-11-20T16:34:00Z'
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
- [x] #1 Při statickém review Orka spuštění brány v review worktree odmítne s vysvětlením, ať přijde z okna, CLI, nástroje agenta nebo smyčky zpětné vazby; spuštění je možné jen při hloubce, kterou uživatel zvolil v možnostech review
- [x] #2 Hloubka review je zapamatovaná na hostiteli review worktree; v SSH review worktree o spuštění rozhoduje vzdálený hostitel podle své zapamatované hloubky
- [x] #3 Worktree, který není review worktree, se pravidlo netýká; review worktree bez zapamatované hloubky (vzniklý ve starším sestavení) se chová jako statický a hláška říká, jak hloubku zvolit
- [x] #4 Starší klient i starší hostitel fungují dál; nové pole je nepovinné a test kompatibility to dokládá
- [x] #5 Testy pokrývají odmítnutí při statickém review pro každou cestu spuštění a povolení při zvolené hloubce
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rozděleno 2026-11-20 podle pravidla velikosti: jednorázový příkaz od agenta převzal TASK-161, jeho zobrazení na kartě draftu TASK-162.

Plán (worker 2026-11-20): (1) registr review worktrees nese reviewDepth; zapisuje ho jen azureDevOpsReview.openWorktree s nepovinným polem depth od volajícího desktop/paired-device, runtime socket s depth je odmítnut; runAgent nese hostitelem razítkovaný příznak, jestli hloubku zvolil uživatel. (2) Jedna funkce rozhodnutí azureDevOpsReviewWorktreeExecution(worktreeId) v src/main/azure-devops/review, použitelná i pro TASK-161. (3) Vynucení v QualityGateService.run přes dep refuseRun (okno, CLI, ado_run_gate i smyčka jdou tudy); smyčka dostane stop reason run-refused. (4) Renderer posílá depth jen z dialogu možností. (5) Schopnost azure-devops-review.depth.v1, testy kompatibility, katalog RPC, dokumentace.

Stav: hotové sdílené typy a parametr depth, registr s reviewDepth, rozhodnutí (azure-devops-review-worktree-execution.ts) s testem, vynucení v QualityGateService.run, stop reason run-refused, renderer posílá depth z dialogu. Zbývá: test všech cest spuštění, test volajících RPC, test kompatibility, test bridge, dokumentace, brány kvality.

Hotovo (worker 2026-11-20): implementace, testy (rozhodnutí a registr, každá cesta spuštění proti skutečné službě bran a RPC, zapojení do služby hostitele, volající RPC, kompatibilita oběma směry, bridge, popisky smyčky v okně a CLI), dokumentace 06 a decision-10. pnpm tc, oxlint, brána změněných řádků, anti-slop a ratchety prošly. Neověřeno ve skrytém okně ani na skutečném vzdáleném hostiteli. Otázky pro uživatele: odmítat i spuštění z okna při statickém review (zatím ano); review worktree bez zapamatované hloubky (zatím statický).

Otevřené otázky na uživatele (položeny 2026-11-20): 1) má Orka při statickém review odmítnout i spuštění brány, které uživatel sám odklikne v okně (zatím ano); 2) review worktree vzniklý před tímto tiketem nemá zapamatovanou hloubku a chová se jako statický (zatím ano). Ve skrytém okně ani na vzdáleném hostiteli ověřeno není, jen testy.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hostitel si u review worktree pamatuje hloubku review a brány v něm spustí jen při hloubce Build nebo Build and run tests; při statickém review a u worktree bez zapamatované hloubky spuštění odmítne s hláškou, ať přijde z okna, CLI, nástroje agenta nebo smyčky zpětné vazby (ta se zastaví s důvodem run-refused). Hloubku zapisuje jen azureDevOpsReview.openWorktree od okna aplikace nebo spárované aplikace; runtime socket je odmítnut a runAgent si původ volajícího razítkuje hostitel sám. Ostatních worktrees se pravidlo netýká. Schopnost azure-devops-review.depth.v1; kompatibilita se starším klientem i hostitelem má test. Ověřeno testy nad skutečnou službou bran, registrem a metodami RPC; skryté okno a vzdálený hostitel ne.
<!-- SECTION:FINAL_SUMMARY:END -->
