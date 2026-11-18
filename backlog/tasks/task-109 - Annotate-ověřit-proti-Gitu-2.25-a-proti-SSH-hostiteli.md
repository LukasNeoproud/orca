---
id: TASK-109
title: 'Annotate: ověřit proti Gitu 2.25 a proti SSH hostiteli'
status: To Do
assignee: []
created_date: '2026-11-18T19:28:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/07-funkce-z-ide.md
priority: medium
type: task
ordinal: 15800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-66 dodal Annotate a historii bloku ověřené lokálně na Gitu 2.54. Běh proti Gitu 2.25 (baseline projektu) a proti SSH hostiteli na tomto počítači neproběhl; fork nemá PR CI, která to jinak dělá, takže to musí proběhnout zde.

### Rozsah

- Git 2.25: sestavit binárku do `~/.cache/orca-review-ide/git-2.25.5` stejným postupem, jakým ji připravuje `.github/workflows/pr.yml` (krok před během `git-binary-compatibility.test.ts`), a pustit kontrakt s `ORCA_GIT_COMPAT_BINARY`, `GIT_EXEC_PATH` a `ORCA_GIT_COMPAT_VERSION`.
- SSH: použít existující harness (`tests/e2e/*ssh*`, `*.docker.unit.test.ts`); když vyžaduje Docker a ten neběží, tiket to zapíše a kritérium zůstane neodškrtnuté.
- Kód: `src/shared/git-blame.ts`, `src/shared/git-line-history.ts`, `src/main/git/annotate.ts`, `src/main/runtime/rpc/methods/git-annotate-methods.ts`.

### Mimo rozsah

- WSL (bez Windows nejde ověřit), stránkování historie bloku, klávesová zkratka.

### Omezení

- Zdrojový archiv Gitu stahuj jen z oficiálního zdroje a jen do `~/.cache/orca-review-ide`; nic neinstaluj do systému.
- Docker sám nespouštěj ani neinstaluj; když neběží, je to ruční krok uživatele.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Případ annotate v src/shared/git-binary-compatibility.test.ts prochází proti binárce Gitu 2.25.x sestavené mimo repozitář; výstup běhu je doložený
- [ ] #2 git.blame a git.lineHistory vracejí proti SSH hostiteli stejný výsledek jako lokálně pro stejný smyšlený repozitář, nebo je zapsané, proč to na tomto počítači ověřit nejde a co chybí
- [ ] #3 Každá nalezená odchylka je opravená v tomto tiketu nebo má vlastní tiket
- [ ] #4 V repozitáři nepřibyl žádný stažený nástroj ani binárka
<!-- AC:END -->
