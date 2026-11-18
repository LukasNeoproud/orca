---
id: TASK-103
title: >-
  Nálezy AI: priorita, seskupení opakovaných nálezů, filtry a publikace podle
  filtru
status: To Do
assignee: []
created_date: '2026-11-18T15:24:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-84
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 223000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Po AI review většího pull requestu je draftů desítky a recenzent je prochází v pořadí, v jakém vznikly. Nálezy mají být seřazené podle priority, opakovaný problém má být jeden nález s výčtem míst a publikovat má jít podle filtru, například jen chyby a varování s jistotou ověřeno.

### Rozsah

- Priorita jako odvozená hodnota nad modelem nálezu z TASK-84: závažnost, jistota a četnost v pull requestu. Ruční přepsání je nepovinné pole draftu (`src/shared/azure-devops-review-types.ts`, `src/main/azure-devops/review/azure-devops-review-drafts.ts`).
- Klíč problému: nepovinné krátké pole, které agent vyplní stejně u nálezů téhož druhu (`src/shared/azure-devops-review-tools.ts`, CLI `orca ado draft`, Pi rozšíření, prompt `src/shared/azure-devops-review-prompt.ts`). Seskupuje se jen podle něj; podobnost textu se nepočítá.
- Rozhraní: `src/renderer/src/components/azure-devops-review/AzureDevOpsReviewDrafts.tsx` (řazení, skupiny, filtry, výběr podle filtru) a `AzureDevOpsReviewDraftCard.tsx`.
- Sloučení skupiny do jednoho draftu stávajícími operacemi nad drafty.

### Mimo rozsah

- Dopad nálezu: rozsah na úrovni modulu a platformy potřebuje analytické jádro (M4) a citlivost oblasti nastavení z tiketu o riziku celků. Odvození priority navrhni tak, aby šel další faktor přidat.
- Četnost napříč projektem a naučené konvence týmu (bod 10).
- Nálezy z lintu a kontrol IDE ve stejném seznamu (M3, M5); model je pro ně připravený.
- Hlas při publikaci (TASK-83).

### Omezení

- Publikuje vždy uživatel; filtr jen předvybírá a potvrzení ukazuje, co odejde.
- Klíč problému je text od agenta: zobrazuj ho jako text a nepoužívej ho jako identifikátor v cestách ani dotazech.
- Nová pole jen nepovinná; drafty čte i telefon.
- Texty v šesti jazycích, vzhled podle `docs/STYLEGUIDE.md`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Záložka draftů řadí nálezy podle priority odvozené ze závažnosti, jistoty a počtu výskytů téhož problému v pull requestu; řazení jde přepnout na pořadí podle souboru
- [ ] #2 Prioritu jde u nálezu ručně přepsat a přepsaná hodnota přežije úpravu draftu agentem i restart
- [ ] #3 Nálezy se stejným klíčem problému od agenta jsou zobrazené jako jedna skupina s výčtem míst; skupinu jde rozbalit a každé místo otevřít v diffu
- [ ] #4 Skupinu jde sloučit do jednoho draftu na prvním místě s výčtem ostatních míst; původní drafty se zahodí až po potvrzení
- [ ] #5 Filtry podle závažnosti, jistoty, autora a souboru zužují seznam; Vybrat podle filtru zaškrtne k publikaci právě zobrazené nálezy a potvrzení publikace uvede jejich počet
- [ ] #6 Ručně psané drafty bez závažnosti filtr nikdy neskryje bez viditelného upozornění, kolik draftů je skrytých
- [ ] #7 Odvození priority a seskupení jsou čisté sdílené funkce s testy; nová pole draftu jsou nepovinná a starší mobilní klient i hostitel fungují dál
- [ ] #8 Seznam je ověřený ve skrytém okně na smyšleném pull requestu se snímkem; docs/review-ide/06-ai-a-review.md bod 6 uvádí, které atributy nálezu jsou hotové
<!-- AC:END -->
