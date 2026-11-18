---
id: TASK-59
title: 'Pokus: vazby pull requestů na pracovní položky Azure DevOps'
status: To Do
assignee: []
created_date: '2026-11-18T12:42:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-0
dependencies: []
documentation:
  - docs/review-ide/04-projekty-a-funkce.md
  - docs/review-ide/README.md
priority: medium
type: spike
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Zjistit, jestli tým váže pull requesty na pracovní položky dost konzistentně, aby Orca mohla Funkce zakládat automaticky z pracovní položky.

### Postup

- Použij připojení Azure DevOps, které Orca už má. Výchozí body: `src/main/azure-devops/azure-devops-api-request.ts`, `src/main/azure-devops/review/azure-devops-review-client.ts` a příkazy `orca ado` v `src/cli/specs/azure-devops.ts`.
- Pokud stávající příkazy vazby na pracovní položky neumí, napiš jednorázový skript mimo repozitář; do Orky nic nepřidávej.
- Když token nemá oprávnění číst pracovní položky, zapiš to jako výsledek a vrať se s otázkou na uživatele.

### Mimo rozsah

- Jakýkoli zápis do Azure DevOps.
- Implementace zakládání Funkcí.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Záznam rozhodnutí uvádí pro každou platformu podíl dokončených pull requestů s aspoň jednou navázanou pracovní položkou za posledních 100 pull requestů
- [ ] #2 Záznam uvádí podíl pracovních položek, na které se vážou pull requesty z více repozitářů
- [ ] #3 Záznam popisuje volání API pro směr pull request na položky i položka na pull requesty a potřebný rozsah oprávnění tokenu
- [ ] #4 Záznam končí doporučením: Funkce zakládat automaticky, jen nabízet, nebo jen ručně
- [ ] #5 Proběhla jen čtecí volání a záznam neobsahuje názvy, čísla ani texty položek a pull requestů
- [ ] #6 Otevřená otázka v docs/review-ide/README.md je odškrtnutá s odkazem na záznam
<!-- AC:END -->
