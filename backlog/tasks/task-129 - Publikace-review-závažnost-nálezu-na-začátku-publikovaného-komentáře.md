---
id: TASK-129
title: 'Publikace review: závažnost nálezu na začátku publikovaného komentáře'
status: To Do
assignee: []
created_date: '2026-11-19T11:45:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/06-ai-a-review.md
type: feature
ordinal: 229500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Uživatel rozhodl (decision-12), že komentář publikovaný do Azure DevOps nese na začátku závažnost nálezu. Důkaz a jistota zůstávají jen v Orce.

### Rozsah

- Sestavení textu při publikaci draftů v `src/main/azure-devops/review/azure-devops-review-draft-actions.ts` (`publishAzureDevOpsReviewDrafts`) a model závažnosti z TASK-84 (`src/shared/review-finding.ts`).
- Tvar předpony navrhni krátký a čitelný i bez Orky (například tučné slovo závažnosti); text draftu se v Orce nemění, předpona vzniká až při publikaci.
- Náhled v potvrzovacím dialogu publikace ukazuje text přesně tak, jak odejde.

### Mimo rozsah

- Publikace důkazu a jistoty.
- Změna závažnosti při publikaci.

### Omezení

- Draft bez závažnosti (ručně psaný, starší) odchází beze změny.
- Odpověď ve vlákně předponu nedostane.
- Platí pro publikaci z desktopu i ze spárovaného klienta; hostitel skládá text, takže starší klient nic měnit nemusí.
- Ověření jen proti smyšlenému serveru; agent do Azure DevOps nezapisuje.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Publikovaný komentář z draftu se závažností začíná krátkou předponou závažnosti; draft bez závažnosti a odpověď ve vlákně odcházejí beze změny
- [ ] #2 Potvrzovací dialog publikace ukazuje text včetně předpony přesně tak, jak odejde
- [ ] #3 Text draftu uložený v Orce se publikací nemění
- [ ] #4 Testy sestavení textu pokrývají všechny závažnosti, draft bez závažnosti a odpověď; publikace je ověřená proti smyšlenému serveru
<!-- AC:END -->
