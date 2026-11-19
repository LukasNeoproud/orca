---
id: TASK-138
title: 'Brány kvality: ovládání a stav smyčky zpětné vazby v rozhraní'
status: To Do
assignee: []
created_date: '2026-11-19T21:30:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-2
dependencies:
  - TASK-87
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 207500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Smyčku zpětné vazby z TASK-87 jde zapnout jen úpravou dat. Uživatel ji má zapnout v nastavení repozitáře, vypnout u workspace a vidět, v jakém je stavu.

### Rozsah

- Nastavení repozitáře: přepínač smyčky a limit kol u definic bran (precedent: nastavení bran z TASK-85).
- Přepínač u workspace nad metodou z TASK-87.
- Stav smyčky v oddílu Local gates (TASK-86) a na kartě workspace (TASK-121), ze stavu bran, který už renderer odebírá.

### Mimo rozsah

- Řízení smyčky, zprávy agentovi a protokol: TASK-87. Tento tiket nemění, co si vyměňují klient a hostitel.

### Omezení

- Vzhled podle docs/STYLEGUIDE.md, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nastavení repozitáře má u bran zapnutí smyčky a limit kol; výchozí stav je vypnuto a text říká, že smyčka spotřebovává tokeny agenta
- [ ] #2 Workspace má přepínač, který smyčku pro něj vypne a zastaví běžící
- [ ] #3 Oddíl Local gates a karta workspace ukazují stav smyčky: běží kolo N z M, prošlo, nálezy čekají na uživatele; u hostitele bez smyčky neukazují nic
- [ ] #4 Ovládání i stav fungují pro folder workspace i SSH worktree; při ztrátě spojení je stav unverifiable
- [ ] #5 Komponenty mají testy; jeden průchod smyčky se smyšleným agentem je ověřený ve skrytém okně se snímkem
<!-- AC:END -->
