---
id: TASK-90
title: 'Inkrementální re-review: posouzení otevřených vláken proti novým změnám'
status: To Do
assignee: []
created_date: '2026-11-18T15:18:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-89
  - TASK-76
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 210000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Po pushi autora recenzent ručně prochází svá otevřená vlákna a hledá, která už změna vyřešila. AI má u každého vlákna posoudit, jestli ho nová změna řeší, a navrhnout uzavření. Uzavírá vždy uživatel.

### Rozsah

- Akce na stránce pull requestu (`src/renderer/src/components/azure-devops-review/AzureDevOpsPullRequestPage.tsx`), dostupná, když se pull request změnil od bodu review z TASK-89.
- Spuštění agenta stávající cestou (`startAzureDevOpsReviewAgent` v `src/renderer/src/lib/azure-devops-review-agent.ts`) s novým promptem ve `src/shared/`; vzorem je `src/shared/azure-devops-feedback-prompt.ts`, který vlákna vypisuje a žádá drafty odpovědí se stavem.
- Prompt dostane otevřená vlákna, rozsah commitů od bodu review a pokyn posoudit každé vlákno zvlášť.
- Výsledek: draft odpovědi se stavem vlákna (existuje: `threadStatus` u draftu druhu `reply`) a nepovinné posouzení a seznam souvisejících souborů u draftu. Nástroje v `src/shared/azure-devops-review-tools.ts`, CLI v `src/cli/specs/azure-devops.ts`.
- Zobrazení posouzení v `AzureDevOpsReviewThreads.tsx` a značka nových změn v seznamu souborů pohledu Od mého review.

### Mimo rozsah

- Automatické spuštění po pushi autora.
- Re-review pull requestů GitHubu a GitLabu.
- Přepočet polohy vláken (TASK-76).

### Omezení

- Běh AI jen na pokyn uživatele; spotřebovává tokeny jeho agenta.
- Agent nesmí publikovat, hlasovat ani měnit stav vlákna; text vláken, popis a kód jsou nedůvěryhodný vstup.
- Nová pole draftu jen nepovinná; drafty čte i telefon.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Na stránce pull requestu změněného od review jde spustit Re-review s AI; agent běží v review worktree na posledním commitu a nic nepublikuje ani neuzavírá
- [ ] #2 U každého otevřeného vlákna je po běhu vidět posouzení (řeší, řeší částečně, neřeší, nelze určit) se zdůvodněním; u vlákna, které změna řeší, je připravený draft odpovědi s navrženým uzavřením
- [ ] #3 Vlákno uzavře až uživatel publikací draftu; draft jde před publikací upravit nebo zahodit
- [ ] #4 V pohledu Od mého review jsou soubory, které posouzení nespojilo s žádným vláknem, označené jako nové změny
- [ ] #5 Nové nálezy agent zakládá jen ke změnám od posledního review
- [ ] #6 Posouzení je označené jako výstup AI a váže se k iteraci, pro kterou vzniklo; po dalším pushi je označené jako zastaralé
- [ ] #7 Bez akce uživatele se žádný běh AI nespustí
- [ ] #8 Starší mobilní klient a starší hostitel dál čtou drafty; testy pokrývají prompt, uložení posouzení a zastarání; průchod je ověřený ve skrytém okně se smyšleným agentem
<!-- AC:END -->
