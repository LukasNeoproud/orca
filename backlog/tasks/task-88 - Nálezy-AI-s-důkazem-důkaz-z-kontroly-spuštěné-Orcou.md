---
id: TASK-88
title: 'Nálezy AI s důkazem: důkaz z kontroly spuštěné Orcou'
status: To Do
assignee: []
created_date: '2026-11-18T15:17:00Z'
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

- Nový druh důkazu v modelu nálezu z TASK-84: odkaz na záznam běhu z TASK-85 (brána nebo jednorázový příkaz).
- Jednorázový příkaz: rozšíření `orca gates` o spuštění příkazu, který není nastavenou bránou (například jeden test), se stejným záznamem běhu. Záznam říká, že šlo o příkaz zadaný agentem. Takový běh dává nejvýš jistotu pravděpodobné: Orca potvrdí, že příkaz proběhl a jak skončil, ne že zkouší to, co nález tvrdí. Jistotu ověřeno důkazem dává jen běh brány, kterou nastavil uživatel.
- Zvolená hloubka review je dnes jen text v promptu. Aby šlo spuštění při statickém review odmítnout, musí si ji Orca u review pull requestu zapamatovat na hostiteli.
- Ověření důkazu v hlavním procesu při ukládání a při zobrazení draftu: běh existuje, patří k review worktree pull requestu (`src/main/azure-devops/review/azure-devops-review-worktree-registry.ts`), commit sedí s commitem draftu, strom byl čistý a výsledek odpovídá tvrzení.
- Nástroje agenta a prompt: `src/shared/azure-devops-review-tools.ts`, `src/shared/azure-devops-review-prompt.ts` a texty hloubky v `src/shared/azure-devops-review-options.ts` (`build`, `build-and-test`) vedou agenta k tomu, aby build a testy pouštěl přes Orku.
- Karta draftu (`src/renderer/src/components/azure-devops-review/AzureDevOpsReviewDraftCard.tsx`): zobrazení důkazu a otevření výstupu.

### Mimo rozsah

- Důkazy z language serveru (M3), z emulátoru (M8) a z kontraktu jiné platformy (M7).
- Rozbor výstupu testů na jednotlivé případy.
- Publikace důkazu do Azure DevOps.

### Omezení

- V review worktree běží kód autora pull requestu. Spuštění je dovolené jen při hloubce review, kterou uživatel zvolil; `static` nespouští nic.
- Jednorázový příkaz od agenta nedokazuje nic víc, než že tento příkaz na tomto commitu skončil tímto kódem; agent si ho může napsat tak, aby selhal. Proto nikdy nedá jistotu ověřeno důkazem a rozhraní ukazuje příkaz celý a nezkrácený.
- SSH review worktree: běh i jeho záznam jsou na vzdáleném hostiteli.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Review agent spustí v review worktree nastavenou bránu nebo jednorázový příkaz přes Orku a dostane identifikátor běhu, návratový kód a konec výstupu
- [ ] #2 Draft s důkazem odkazujícím na běh brány nastavené uživatelem, který patří k review worktree tohoto pull requestu, proběhl na commitu draftu s čistým stromem a selhal, má jistotu ověřeno důkazem
- [ ] #3 Odkaz na neexistující běh, na běh z jiného commitu nebo worktree, nebo na běh, který prošel, jistotu ověřeno důkazem nedá a karta řekne proč; běh jednorázového příkazu zadaného agentem dá nejvýš jistotu pravděpodobné
- [ ] #4 Důkaz na kartě draftu ukazuje přesný příkaz, návratový kód, čas a úryvek výstupu a jde otevřít celý uložený výstup
- [ ] #5 Po přesunu draftu na novější iteraci je důkaz ze staršího commitu označený jako zastaralý a jistota klesne
- [ ] #6 Při statickém review Orka spuštění odmítne s vysvětlením; spuštění je možné jen při hloubce, kterou uživatel zvolil v možnostech review
- [ ] #7 Výstup příkazu se agentovi i v rozhraní předává jako data; pokyny v něm nic nespustí
- [ ] #8 Testy pokrývají všechna pravidla ověření; průchod je ověřený ve skrytém okně na smyšleném repozitáři s bránou, která selže
<!-- AC:END -->
