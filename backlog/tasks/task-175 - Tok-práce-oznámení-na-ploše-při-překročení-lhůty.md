---
id: TASK-175
title: 'Tok práce: oznámení na ploše při překročení lhůty'
status: To Do
assignee: []
created_date: '2026-11-24T09:05:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-9
dependencies:
  - TASK-171
documentation:
  - docs/review-ide/10-tok-prace.md
priority: medium
type: feature
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Když práce překročí lhůtu a uživatel se do přehledu nedívá, má ho Orca upozornit jedním oznámením na ploše.

### Rozsah

- Oznámení v hlavním procesu nad `src/main/notifications/` (precedent: `review-request-notification.ts`, `announced-notification-registry.ts`): jedno na jednotku a fázi, klik otevře Moje práce u té jednotky.
- Vypínače po fázích v `NotificationsPane.tsx`.

### Mimo rozsah

- Telefon (čeká na TASK-131). Tento tiket nemění, co si vyměňují klient a hostitel.

### Omezení

- Žádná záplava: po spuštění aplikace a po delší nepřítomnosti se váznoucí jednotky ohlásí jedním souhrnným oznámením, ne každá zvlášť.
- Oznámení posílá hostitel, u kterého uživatel sedí; druhé okno ani druhý klient ho nezdvojí.
- Texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Jednotka, která překročí lhůtu své fáze, vyvolá jedno oznámení na ploše; pro stejnou jednotku a fázi se neopakuje ani po restartu aplikace
- [ ] #2 Klik na oznámení otevře Moje práce u dané jednotky
- [ ] #3 Po spuštění aplikace a po návratu po nepřítomnosti přijde jedno souhrnné oznámení s počtem váznoucích jednotek
- [ ] #4 Oznámení jde vypnout po fázích; výchozí stav je zapnuto pro všechny čtyři
- [ ] #5 Testy pokrývají první překročení, neopakování, souhrn po spuštění a vypnutou fázi
<!-- AC:END -->
