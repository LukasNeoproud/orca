---
id: TASK-109
title: 'Annotate: ověřit proti Gitu 2.25 a proti SSH hostiteli'
status: Done
assignee: []
created_date: '2026-11-18T19:28:00Z'
updated_date: '2026-11-19T11:56:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
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

### Čeká na uživatele

Jak získat Git 2.25: přeložit ze zdrojového archivu do `~/.cache/orca-review-ide` (postup CI, doporučeno), nebo použít kontejner s Ubuntu 20.04, které má Git 2.25.1. Uživatel se 2026-11-18 zeptal, proč Git sestavovat; odpověď dostal a volbu zatím neudělal. Docker pro SSH část už běží.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Případ annotate v src/shared/git-binary-compatibility.test.ts prochází proti binárce Gitu 2.25.x sestavené mimo repozitář; výstup běhu je doložený
- [x] #2 git.blame a git.lineHistory vracejí proti SSH hostiteli stejný výsledek jako lokálně pro stejný smyšlený repozitář, nebo je zapsané, proč to na tomto počítači ověřit nejde a co chybí
- [x] #3 Každá nalezená odchylka je opravená v tomto tiketu nebo má vlastní tiket
- [x] #4 V repozitáři nepřibyl žádný stažený nástroj ani binárka
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Odpověď uživatele 2026-11-19 (decision-12): Git 2.25 sestavit ze zdrojového archivu do ~/.cache/orca-review-ide. Docker běží.

Plán: (1) Git 2.25.5 ze zdroje kernel.org do ~/.cache/orca-review-ide/git-2.25.5 postupem z .github/actions/prepare-git-compatibility, pustit git-binary-compatibility.test.ts; (2) SSH: najít existující docker/SSH harness a porovnat git.blame a git.lineHistory přes relay s lokálním výsledkem; (3) odchylky opravit nebo založit tiket.

Hotovo 1/2: Git 2.25.5 sestaven (sha256 ověřen) v ~/.cache/orca-review-ide/git-2.25.5. Kontrakt: případ annotate prochází; 30/31 s výchozím TMPDIR (registrace selže i s Gitem 2.54 kvůli /var -> /private/var na macOS), 31/31 s TMPDIR=/private/tmp/orca-git225. Logy ~/.cache/orca-review-ide/task-109/. Zbývá SSH.

SSH příprava: slot linux-arm64-glibc sestaven v kontejneru node:22-bookworm (out/orcad-prebuilds, gitignored), šablona orcad pro linux-arm64-glibc v ~/.cache/orca-review-ide/task-109/orcad-template. Další krok: e2e spec přes helpers/orcad-managed-workspace + callEnvironment git.blame/git.lineHistory.

Hotovo 2/2: tests/e2e/ssh-orcad-git-annotate.spec.ts (managed orcad Docker host, linux-arm64-glibc šablona) volá git.blame a git.lineHistory přes runtimeEnvironments.call a porovná toEqual s lokálním výsledkem nad klonem stejných commitů (git bundle). Prošlo: hostitel Git 2.39.5 = desktop Git 2.54.0 = Git 2.25.5. Report ~/.cache/orca-review-ide/task-109/e2e-report.json. Žádná odchylka annotate. Mimo annotate: případ registrace v kontraktu padá na macOS kvůli /var -> /private/var i s Gitem 2.54 (navržen navazující tiket). Artefakty sestavení přesunuty z out/ do ~/.cache/orca-review-ide/task-109.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Annotate ověřený proti Gitu 2.25.5 sestavenému ze zdrojového archivu do ~/.cache/orca-review-ide (kontrakt git-binary-compatibility prochází) a proti SSH hostiteli s orcad: nový tests/e2e/ssh-orcad-git-annotate.spec.ts porovná odpovědi git.blame a git.lineHistory z hostitele s Gitem na desktopu (2.54 i 2.25) nad klonem stejných commitů; prošel dvakrát. Odchylka v Annotate žádná. WSL neověřené.
<!-- SECTION:FINAL_SUMMARY:END -->
