---
id: TASK-173
title: 'Tok práce: značka fáze na kartě workspace a nastavení lhůt a vzorů tagů'
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
  - TASK-169
documentation:
  - docs/review-ide/10-tok-prace.md
priority: medium
type: feature
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Váznoucí práce má být vidět i tam, kde uživatel pracuje, a lhůty i značení buildů si má nastavit podle svých projektů.

### Rozsah

- Karta workspace v postranním panelu: značka fáze u workspace, jehož jednotka vázne (precedent: značka bran, `WorkspaceQualityGatesCardIndicator.tsx`).
- Nastavení aplikace: lhůty čtyř fází v pracovních dnech.
- Nastavení repozitáře: vzory ostrého a dev tagu se zkouškou, které poslední tagy vzoru odpovídají.

### Mimo rozsah

- Vypínače oznámení: TASK-175. Tento tiket nemění, co si vyměňují klient a hostitel.

### Omezení

- Vzhled podle docs/STYLEGUIDE.md, texty v šesti jazycích.
- Vzory tagů repozitáře jiného hostitele se zapisují cestou, kterou píše nastavení repozitáře dnes; když ji hostitel nemá, je pole jen ke čtení.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Karta workspace s váznoucí jednotkou ukazuje značku fáze s popisem v tooltipu; nevázne-li nic, neukazuje nic
- [ ] #2 Lhůty jdou změnit v nastavení a přehled i značky se podle nich přepočítají
- [ ] #3 Vzory tagů jdou u repozitáře změnit a nastavení ukáže, které poslední tagy jim odpovídají
- [ ] #4 SSH repozitář i folder workspace: nastavení a značka fungují, nebo říkají, proč ne
- [ ] #5 Komponenty mají testy; značka a nastavení jsou ověřené ve skrytém okně se snímkem
<!-- AC:END -->
