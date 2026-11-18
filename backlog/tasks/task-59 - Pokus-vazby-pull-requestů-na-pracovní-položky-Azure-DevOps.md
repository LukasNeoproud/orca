---
id: TASK-59
title: 'Pokus: vazby pull requestů na pracovní položky Azure DevOps'
status: To Do
assignee: []
created_date: '2026-11-18T12:42:00Z'
updated_date: '2026-11-18T23:57:00Z'
labels:
  - review-ide
  - effort-medium
  - ceka-na-uzivatele
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
- [x] #1 Záznam rozhodnutí uvádí pro každou platformu podíl dokončených pull requestů s aspoň jednou navázanou pracovní položkou za posledních 100 pull requestů
- [ ] #2 Záznam uvádí podíl pracovních položek, na které se vážou pull requesty z více repozitářů
- [x] #3 Záznam popisuje volání API pro směr pull request na položky i položka na pull requesty a potřebný rozsah oprávnění tokenu
- [x] #4 Záznam končí doporučením: Funkce zakládat automaticky, jen nabízet, nebo jen ručně
- [x] #5 Proběhla jen čtecí volání a záznam neobsahuje názvy, čísla ani texty položek a pull requestů
- [x] #6 Otevřená otázka v docs/review-ide/README.md je odškrtnutá s odkazem na záznam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker): 1) záloha sdílených souborů ~/.orca a nastavení hooků agentů s otisky SHA-256; 2) druhá skrytá instance Orca Dev s izolovaným profilem, dotazy jen GET funkcí Orky pro požadavky na Azure DevOps volanou v hlavním procesu; 3) vzorek 100 posledních dokončených pull requestů na repozitář platformy, směr PR → položky po jednom, směr položka → PR dávkovým GET s relacemi; 4) jen agregovaná čísla do záznamu rozhodnutí, surová data smazat, instanci ukončit, otisky porovnat.

Výsledek (worker, 2026-11-19): měřeno ve druhé skryté instanci Orca Dev s izolovaným profilem, 474 požadavků GET funkcí Orky pro požadavky na Azure DevOps (467 úspěšných, 7 se stavem 401). Směr PR → položky: 0 ze 455 dokončených pull requestů pěti repozitářů (dva produkty, dvě organizace; backend jednoho produktu není v Azure DevOps). Žádná zásada vyžadující vazbu, žádný commit s položkou. Token uložený v Orce pracovní položky číst nesmí (401 na všech voláních _apis/wit), proto kritérium 2 není splněné: ve vzorku není žádná navázaná položka a směr položka → PR nejde přečíst. Záznam: decision-8 (proposed), návrh Funkce v M7 jen ručně. Úklid: instance ukončená, její úloha launchd odebraná, surová data a záloha smazané, otisky SHA-256 sdílených souborů před během a po něm shodné (19 souborů). Zbývá: odpověď uživatele, jestli tým položky Azure DevOps používá; při ano zopakovat měření s tokenem s Work Items (Read), skripty jsou v ~/.cache/orca-review-ide/task-59/scripts.

Stav 2026-11-19 (koordinátor): záznam decision-8 (proposed) je commitnutý, kritéria 1, 3 až 6 splněna. Kritérium 2 nejde změřit: ve vzorku není žádná navázaná položka a token uložený v Orce nesmí pracovní položky číst (401). Čeká na uživatele: eviduje tým práci v pracovních položkách Azure DevOps, nebo jinde? Když jinde, tiket se uzavře s kritériem 2 jako neměřitelným. Když v Azure DevOps, uživatel přidá tokenu rozsah Work Items (Read) a měření se zopakuje skripty v ~/.cache/orca-review-ide/task-59/scripts. Při měření se shodovaly otisky všech 19 zálohovaných sdílených souborů; worker po své skryté instanci odebral její úlohu launchd.
<!-- SECTION:NOTES:END -->
