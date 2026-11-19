---
id: TASK-103
title: 'Nálezy AI: seskupení opakovaných nálezů, četnost v prioritě a ruční priorita'
status: To Do
assignee: []
created_date: '2026-11-18T15:24:00Z'
updated_date: '2026-11-19T09:38:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-84
  - TASK-126
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 223000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Opakovaný problém má být jeden nález s výčtem míst, ne desítka podobných draftů, a priorita má zohlednit, kolikrát se problém v pull requestu opakuje. Recenzent má prioritu umět ručně přepsat. Řazení a filtry nad závažností a jistotou dodá TASK-126.

### Rozsah

- Četnost: do odvozené priority z TASK-126 přibude počet výskytů téhož problému v pull requestu.
- Ruční přepsání priority: nepovinné pole draftu (`src/shared/azure-devops-review-types.ts`, `src/main/azure-devops/review/azure-devops-review-drafts.ts`).
- Klíč problému: nepovinné krátké pole, které agent vyplní stejně u nálezů téhož druhu (`src/shared/azure-devops-review-tools.ts`, CLI `orca ado draft`, Pi rozšíření, prompt `src/shared/azure-devops-review-prompt.ts`). Seskupuje se jen podle něj; podobnost textu se nepočítá.
- Rozhraní: `src/renderer/src/components/azure-devops-review/AzureDevOpsReviewDrafts.tsx` (skupiny) a `AzureDevOpsReviewDraftCard.tsx` (ruční priorita).
- Sloučení skupiny do jednoho draftu stávajícími operacemi nad drafty.

### Mimo rozsah

- Priorita ze závažnosti a jistoty, řazení, filtry, výběr podle filtru a publikace výběru: TASK-126.
- Dopad nálezu: rozsah na úrovni modulu a platformy potřebuje analytické jádro (M4) a citlivost oblasti nastavení z tiketu o riziku celků.
- Četnost napříč projektem a naučené konvence týmu (bod 10).
- Nálezy z lintu a kontrol IDE ve stejném seznamu (M3, M5); model je pro ně připravený.
- Hlas při publikaci (TASK-83).

### Omezení

- Klíč problému je text od agenta: zobrazuj ho jako text a nepoužívej ho jako identifikátor v cestách ani dotazech.
- Nová pole jen nepovinná; drafty čte i telefon.
- Texty v šesti jazycích, vzhled podle `docs/STYLEGUIDE.md`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Priorita nálezu z TASK-126 započítává i počet výskytů téhož problému v pull requestu
- [ ] #2 Prioritu jde u nálezu ručně přepsat a přepsaná hodnota přežije úpravu draftu agentem i restart
- [ ] #3 Nálezy se stejným klíčem problému od agenta jsou zobrazené jako jedna skupina s výčtem míst; skupinu jde rozbalit a každé místo otevřít v diffu
- [ ] #4 Skupinu jde sloučit do jednoho draftu na prvním místě s výčtem ostatních míst; původní drafty se zahodí až po potvrzení
- [ ] #5 Seskupení a četnost v prioritě jsou čisté sdílené funkce s testy; nová pole draftu jsou nepovinná a starší mobilní klient i hostitel fungují dál
- [ ] #6 Seznam se skupinami je ověřený ve skrytém okně na smyšleném pull requestu se snímkem; docs/review-ide/06-ai-a-review.md bod 6 uvádí, které atributy nálezu jsou hotové
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rozděleno 2026-11-19 podle pravidla velikosti: TASK-126 převzal prioritu ze závažnosti a jistoty, řazení, filtry (závažnost, jistota, autor, soubor), výběr podle filtru a publikaci výběru.
<!-- SECTION:NOTES:END -->
