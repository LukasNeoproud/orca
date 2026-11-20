---
id: TASK-88
title: 'Nálezy AI s důkazem: důkaz z běhu nastavené brány'
status: To Do
assignee: []
created_date: '2026-11-18T15:17:00Z'
updated_date: '2026-11-20T15:59:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-84
  - TASK-85
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 208000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Nález, který stojí na selhaném buildu, lintu nebo testu, má nést výsledek běhu, který provedla Orca, ne text, který agent opsal. Jen takový nález smí mít jistotu „ověřeno důkazem“; recenzent ho může publikovat bez vlastního ověřování.

### Rozsah

- Nový druh důkazu v modelu nálezu z TASK-84 (`src/shared/review-finding.ts`): odkaz na záznam běhu brány z TASK-85. Druh navrhni tak, aby TASK-122 mohl doplnit běh jednorázového příkazu.
- Ověření důkazu v hlavním procesu při ukládání a při zobrazení draftu: běh existuje, patří k review worktree pull requestu (`src/main/azure-devops/review/azure-devops-review-worktree-registry.ts`), commit sedí s commitem draftu, strom byl čistý a výsledek odpovídá tvrzení.
- Nástroje agenta a prompt: `src/shared/azure-devops-review-tools.ts`, `src/shared/azure-devops-review-prompt.ts` a texty hloubky v `src/shared/azure-devops-review-options.ts` (`build`, `build-and-test`) vedou agenta k tomu, aby build a testy pouštěl přes Orku.
- Draft předává rendereru výsledek ověření důkazu a důvod, proč jistotu nedal, jako data; zobrazení dodá TASK-159.

### Mimo rozsah

- Karta draftu: zobrazení důkazu, otevření výstupu a průchod ve skrytém okně: TASK-159.
- Jednorázový příkaz zadaný agentem přes `orca gates`, zapamatovaná hloubka review na hostiteli a odmítnutí spuštění při statickém review: TASK-122.
- Důkazy z language serveru (M3), z emulátoru (M8) a z kontraktu jiné platformy (M7).
- Rozbor výstupu testů na jednotlivé případy.
- Publikace důkazu do Azure DevOps.

### Omezení

- V review worktree běží kód autora pull requestu. Prompt a nástroje vedou ke spuštění jen při hloubce, kterou uživatel zvolil; `static` nespouští nic. Vynucení na hostiteli dodá TASK-122.
- SSH review worktree: běh i jeho záznam jsou na vzdáleném hostiteli.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Review agent spustí v review worktree nastavenou bránu přes Orku a dostane identifikátor běhu, návratový kód a konec výstupu
- [ ] #2 Draft s důkazem odkazujícím na běh brány nastavené uživatelem, který patří k review worktree tohoto pull requestu, proběhl na commitu draftu s čistým stromem a selhal, má jistotu ověřeno důkazem
- [ ] #3 Odkaz na neexistující běh, na běh z jiného commitu nebo worktree, nebo na běh, který prošel, jistotu ověřeno důkazem nedá a karta řekne proč
- [ ] #4 Po přesunu draftu na novější iteraci je důkaz ze staršího commitu označený jako zastaralý a jistota klesne
- [ ] #5 Výstup brány se agentovi i v rozhraní předává jako data; pokyny v něm nic nespustí
- [ ] #6 Testy pokrývají všechna pravidla ověření a nástroj agenta; draft nese výsledek ověření a důvod pro renderer
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rozděleno 2026-11-19 podle pravidla velikosti: TASK-122 převzal jednorázový příkaz zadaný agentem přes orca gates, zapamatovanou hloubku review na hostiteli a odmítnutí spuštění při statickém review.

Rozděleno 2026-11-20 podle pravidla velikosti: kartu draftu s důkazem, otevření výstupu a průchod ve skrytém okně převzal TASK-159.
<!-- SECTION:NOTES:END -->
