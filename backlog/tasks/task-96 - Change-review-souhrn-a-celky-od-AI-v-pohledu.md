---
id: TASK-96
title: 'Change review: souhrn a celky od AI v pohledu'
status: To Do
assignee: []
created_date: '2026-11-18T15:20:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-95
  - TASK-93
documentation:
  - docs/review-ide/05-funkce.md
priority: high
type: feature
ordinal: 218000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Recenzent má velký diff číst po tematických celcích s komentářem, co se v celku změnilo a proč, místo po souborech. Tento tiket přidá spuštění AI na pokyn a zobrazení jejího výsledku v pohledu Change review.

### Rozsah

- Tlačítko v přehledu pohledu (`src/renderer/src/components/change-review/`). Spuštění agenta stávající cestou: `launchAgentInNewTab` (`src/renderer/src/lib/launch-agent-in-new-tab.ts`); vzorem pro předání nástrojů a sledování běhu je AI review (`src/renderer/src/lib/azure-devops-review-agent.ts`, `src/shared/azure-devops-review-prompt.ts`).
- Prompt ve `src/shared/`: agent čte změnu nástroji z TASK-95, prochází ji po skupinách, přiřazuje hunky do celků, píše komentář a souhrn; needituje soubory a nepřiřazuje hunky, kterým nerozumí.
- Zobrazení: souhrn, seznam celků s počty, celek Nevysvětleno, označení výstupů AI, stav k obnovení.
- Zaškrtnutí celku přes stav hunků z TASK-93.

### Mimo rozsah

- Výpočet celků na pozadí bez pokynu uživatele: vlastní tiket, čeká na rozhodnutí o nákladech.
- Odznaky důvěry u tvrzení a řazení podle rizika: vlastní tikety.
- Pokrytí kritérií zadání, původ řádků a rozhodnutí mimo zadání podle autora (M7).

### Omezení

- Agent je výchozí agent uživatele; žádný nový poskytovatel AI ani přímé volání API.
- Agent pracuje jen ve worktree, nic nepublikuje a nic nezapisuje do repozitáře.
- AI výstupy musí být vždy označené (oddíl 16, Společné chování).
- Texty v šesti jazycích, vzhled podle `docs/STYLEGUIDE.md`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tlačítko Vysvětlit změny s AI spustí výchozího agenta uživatele ve worktree s nástroji change review; agent jen čte a odevzdává celky
- [ ] #2 Po běhu pohled ukazuje souhrn AI k celé změně včetně počtu skrytých souborů a diff rozdělený do celků; celek má název, komentář, počet souborů a změněných řádků
- [ ] #3 Hunky, které AI nepřiřadila, jsou v celku Nevysvětleno; bez běhu AI zůstává dělení podle skupin manifestu
- [ ] #4 Celek jde označit jako zkontrolovaný a průběh je vidět v seznamu celků; stav se ukládá po hunkách
- [ ] #5 Souhrn i komentáře jsou označené jako výstup AI; celek, který po novém commitu přišel o hunky, je označený k obnovení a nabízí nový běh
- [ ] #6 Bez kliknutí uživatele se žádný běh AI nespustí; velký diff agent prochází po skupinách a pohled ukazuje průběžný stav
- [ ] #7 Funguje nad review worktree pull requestu Azure DevOps, nad vlastním workspace i nad worktree s pull requestem GitHubu a GitLabu; SSH worktree spouští terminálového agenta na svém hostiteli
- [ ] #8 Komponenty a prompt mají testy; průchod je ověřený ve skrytém okně se smyšleným agentem, který odevzdá celky přes CLI
<!-- AC:END -->
