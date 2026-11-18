---
id: TASK-78
title: >-
  Prověřit prázdné odebrané řádky v diffu pull requestu a obnovu seznamu po
  přidání projektu
status: To Do
assignee: []
created_date: '2026-11-18T13:20:00Z'
updated_date: '2026-11-18T21:22:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/01-integrace.md
priority: low
type: bug
ordinal: 228000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Při ověření review proti skutečné organizaci (TASK-67) se ve skrytém okně ukázaly dvě vady zobrazení, které nešlo spolehlivě odlišit od projevu okna, které se nikdy nevykreslí na obrazovku. Recenzent musí v diffu vidět, co bylo odebráno, a seznam musí odpovídat přidaným projektům.

### Rozsah

- `src/renderer/src/components/azure-devops-review/AzureDevOpsReviewFileDiffPane.tsx` a `azure-devops-review-diff-sections.ts`: v inline zobrazení byly odebrané řádky červený pruh bez textu a přidaný soubor měl nad prvním řádkem jeden prázdný odebraný řádek. Porovnat se stejným diffem v záložce diffu workspace (`src/renderer/src/components/editor/combined-diff`).
- `src/renderer/src/components/right-sidebar/AzureDevOpsPullRequestsPanel.tsx` a `src/renderer/src/store/azure-devops-review-store.ts`: po přidání druhého projektu panel dál ukazoval jen pull requesty prvního, dokud uživatel nestiskl Obnovit.

### Mimo rozsah

- Poloha inline komentářů a stránkování seznamu: mají vlastní tikety.

### Omezení

- Nejdřív reprodukovat; když se vada nepotvrdí, tiket končí zápisem důkazu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 U změněného souboru je v inline zobrazení diffu pull requestu vidět text odebraných řádků, nebo je doloženo, že šlo jen o projev skrytého okna
- [ ] #2 Nově přidaný soubor nezobrazuje nad obsahem prázdný odebraný řádek
- [ ] #3 Po přidání nebo odebrání projektu se panel Pull requests sám obnoví
- [ ] #4 Obojí je ověřené ve skrytém okně snímkem a testem komponenty nebo stavu
<!-- AC:END -->
