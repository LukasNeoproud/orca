---
id: TASK-106
title: 'Change review: pokrytí kritérií zadání a změny mimo zadání'
status: To Do
assignee: []
created_date: '2026-11-18T15:26:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-96
  - TASK-105
documentation:
  - docs/review-ide/05-funkce.md
priority: medium
type: feature
ordinal: 226000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Recenzent má vidět, která část změny plní které kritérium zadání, které kritérium nemá v kódu oporu a co změna dělá navíc. Je to upozornění pro review, ne důkaz splnění.

### Rozsah

- Zdroj zadání: pracovní položky pull requestu navázaného na worktree, čtené přes TASK-105; kritéria dostanou stabilní identifikátor odvozený z pořadí a textu.
- Rozšíření protokolu celků z TASK-95 (`src/shared/change-review-types.ts`, `src/shared/change-review-tools.ts`, úložiště v `src/main/change-review/`): celek nese nepovinný seznam kritérií, která pokrývá, a příznak změny mimo zadání se zdůvodněním. Agent dostane kritéria mezi zdroji tvrzení.
- Prompt běhu AI z TASK-96 žádá přiřazení kritérií a označení změn mimo zadání.
- Rozhraní v `src/renderer/src/components/change-review/`: panel zadání s pokrytím, odznaky kritérií u celku, panel Mimo zadání.

### Mimo rozsah

- Původ jednotlivých řádků na okraji diffu a rozlišení, zda rozhodnutí mimo zadání udělala AI, nebo vývojář: potřebují zápisy agenta z hooků a patří do M7.
- Návrh testů pro nepokrytá kritéria: v dokumentaci zamítnuto.
- Zadání z jiných zdrojů než pracovní položky pull requestu (navázaný úkol workspace, issue GitHubu a GitLabu).
- Strojové ověření, že kritérium je opravdu splněné.

### Omezení

- Text zadání odchází k poskytovateli AI jen během běhu, který spustil uživatel; platí stejné rozhodnutí o výchozím stavu jako u TASK-105.
- Zadání je nedůvěryhodný text pro rozhraní i pro agenta.
- Typy a nástroje zůstávají nezávislé na Azure DevOps; zdroj zadání je vyměnitelný.
- Nová pole celku nepovinná, starší hostitel je ignoruje bez chyby.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pohled Change review nad worktree s navázaným pull requestem Azure DevOps, který má pracovní položku s akceptačními kritérii, ukazuje panel zadání se seznamem kritérií
- [ ] #2 Po běhu AI je u každého kritéria vidět, které celky ho pokrývají, a kliknutí na ně skočí do diffu; kritérium bez celku je zvýrazněné jako mezera
- [ ] #3 Celek ukazuje kritéria, která pokrývá; celky, které AI označila jako změnu mimo zadání, jsou v panelu Mimo zadání se zdůvodněním
- [ ] #4 Přiřazení kritéria, které v zadání není, nástroj odmítne s výčtem platných kritérií a nic neuloží
- [ ] #5 Pokrytí je označené jako tvrzení AI, ne jako ověřený fakt; po změně zadání nebo novém commitu je označené jako zastaralé
- [ ] #6 Worktree bez pull requestu, bez pracovní položky nebo bez oprávnění číst zadání panel neukáže a zbytek pohledu funguje; totéž u pull requestu GitHubu a GitLabu
- [ ] #7 Validace a přenos přiřazení mají testy; panel je ověřený ve skrytém okně se smyšleným zadáním a smyšleným agentem; docs/review-ide/05-funkce.md oddíl 7 uvádí, co z panelů zbývá na M7
<!-- AC:END -->
