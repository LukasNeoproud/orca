---
id: TASK-102
title: >-
  Seznam pull requestů: stav kontrol, nevyřešená vlákna a akce Odpovědět na
  nálezy a Otevřít chybu
status: To Do
assignee: []
created_date: '2026-11-18T15:24:00Z'
updated_date: '2026-11-24T09:05:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-99
  - TASK-100
documentation:
  - docs/review-ide/05-funkce.md
priority: medium
type: feature
ordinal: 222000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Seznam pull requestů má říct, co je u kterého potřeba udělat, bez otevírání každého zvlášť: jestli prošly kontroly, kolik vláken je otevřených, a u vlastních pull requestů nabídnout rovnou odpověď na nálezy nebo otevření selhané kontroly.

### Rozsah

- Souhrn pull requestu (stav kontrol, počet nevyřešených vláken, počet vláken čekajících na odpověď) jako nepovinná data vedle seznamu v `src/shared/azure-devops-review-types.ts`. Seznam (`listAzureDevOpsReviewPullRequests` v `src/main/azure-devops/review/azure-devops-review-service.ts`) je dnes nenese a jejich zjištění stojí požadavky na každý pull request, proto vlastní líně volaná metoda RPC s keší.
- Stav kontrol stejným čtením jako hlavička stránky z TASK-99; vlákna přes `listAzureDevOpsReviewThreads` a pravidlo čekání na odpověď z TASK-100.
- Řádek `src/renderer/src/components/right-sidebar/AzureDevOpsPullRequestRow.tsx` a panel `AzureDevOpsPullRequestsPanel.tsx`.
- Hlavní akce: `reviewRowAction` v `src/shared/azure-devops-review-groups.ts` dnes vrací `start-review` a `continue-review`; přibudou akce pro vlastní pull request.

### Mimo rozsah

- Rozbor selhaného sestavení a srozumitelné chyby buildu (M3); Otevřít chybu jen dovede na selhanou kontrolu a její odkaz.
- Souhrny v mobilní aplikaci.
- Oznámení o selhané kontrole nebo novém komentáři (TASK-82 řeší oznámení).

### Omezení

- Šetři limity Azure DevOps: žádné načítání souhrnů pro skupinu Ostatní ani pro dokončené pull requesty, žádné opakování v intervalu.
- Nová metoda RPC musí být vyjednaná; klient bez podpory hostitele souhrny nežádá.
- Jen čtení z Azure DevOps; testy proti smyšleným odpovědím (vzor `tests/e2e/pull-request-review-groups.spec.ts`).
- Stavové barvy ze stávajících tokenů, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Řádek otevřeného pull requestu ve skupinách Čeká na moje review a Moje pull requesty ukazuje stav kontrol (prošly, selhaly, běží) a počet nevyřešených vláken
- [ ] #2 Můj pull request se selhanou kontrolou má hlavní akci Otevřít chybu, která otevře stránku pull requestu na selhané kontrole; můj pull request s vlákny čekajícími na odpověď má akci Odpovědět na nálezy, která otevře jejich seznam
- [ ] #3 Akce Provést review a Pokračovat v review se chovají jako dosud; výběr hlavní akce je čistá funkce s testem pro každou kombinaci stavů
- [ ] #4 Souhrny se načítají jen pro zobrazené řádky těchto dvou skupin, nejvýš dvěma požadavky na pull request, a drží se v keši podle commitu; pravidelná kontrola nových pull requestů žádný požadavek nepřidá; pokrývá to test
- [ ] #5 Při vyčerpaném limitu nebo chybě Azure DevOps řádek zůstane bez souhrnu a seznam funguje dál
- [ ] #6 Starší hostitel vrátí seznam bez souhrnů a řádky se zobrazí jako dosud; starší mobilní klient seznam dál načte
- [ ] #7 Řádek je ověřený ve skrytém okně proti smyšlenému serveru se snímkem; docs/review-ide/05-funkce.md oddíl 4 uvádí stav po tomto tiketu
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-24: fakta o reviewerech, hlasech a nevyřešených vláknech u pull requestů uživatele dodá TASK-167 (milník M9, jde dřív). Tento tiket je použije a nepřidává druhé čtení.
<!-- SECTION:NOTES:END -->
