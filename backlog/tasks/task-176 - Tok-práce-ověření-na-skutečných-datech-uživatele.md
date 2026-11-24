---
id: TASK-176
title: 'Tok práce: ověření na skutečných datech uživatele'
status: To Do
assignee: []
created_date: '2026-11-24T09:05:00Z'
labels:
  - review-ide
  - effort-high
  - ceka-na-uzivatele
milestone: m-9
dependencies:
  - TASK-172
  - TASK-173
  - TASK-174
  - TASK-175
documentation:
  - docs/review-ide/10-tok-prace.md
priority: medium
type: task
ordinal: 160000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Pravidla toku práce vznikla nad smyšlenými daty. Než uživatel milník přijme, má je Orca ukázat nad jeho skutečnými větvemi, pull requesty, tikety a tagy, aby se našly případy, se kterými model nepočítal.

### Rozsah

- Druhá skrytá instance Orca Dev nad sdíleným nastavením, jen čtení (postup a záloha podle oprávnění v CLAUDE.local.md).
- Porovnání přehledu se stavem v Azure DevOps a v Jiře pro několik jednotek v každé fázi; rozdíly založit jako tikety.

### Čeká na uživatele

Čtení z Jiry přes připojení uložené v Orce pro účely ověření uživatel zatím nepotvrdil (čtení z Azure DevOps potvrzené je). Tiket začne po potvrzení.

### Omezení

- Nic se nezapisuje: žádný komentář, hlas, změna tiketu ani tag.
- Výsledky s názvy firemních projektů, větví a tiketů nepatří do sledovaných souborů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pro aspoň dvě skutečné jednotky v každé fázi, která se u uživatele vyskytuje, souhlasí přehled se stavem v Azure DevOps, v Jiře a s tagy repozitáře
- [ ] #2 Rozdíly jsou založené jako tikety; poznámky tiketu neobsahují názvy firemních projektů
- [ ] #3 Sdílené soubory mají po skončení stejné otisky jako před začátkem
<!-- AC:END -->
