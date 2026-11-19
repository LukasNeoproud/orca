---
id: TASK-118
title: Jistota nálezu jen u nálezů review, ne u odpovědí agenta ve vláknech
status: To Do
assignee: []
created_date: '2026-11-19T04:10:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: bug
ordinal: 200600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Po TASK-84 má jistotu každý nepublikovaný draft agenta. Odpovědi agenta na komentáře vznikají v toku, kde po něm důkaz nikdo nechce, takže jsou všechny označené jako nejisté a značka ztrácí váhu u skutečných nálezů.

### Rozsah

- `src/main/azure-devops/review/azure-devops-review-draft-findings.ts` (kde se jistota odvozuje) a zobrazení v `src/renderer/src/components/azure-devops-review/`.
- Vyvrácená citace musí zůstat vidět i u odpovědi: je to chyba agenta, ne chybějící důkaz.

### Mimo rozsah

- Žádat důkazy i v promptech pro odpovědi a přepracování draftu (pozdější tiket).
- Zobrazení v mobilní aplikaci.

### Omezení

- Jen nepovinná pole; nic nepřejmenovávej.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Draft odpovědi agenta ve vlákně neukazuje na kartě ani v diffu značku jistoty; draft nálezu z AI review ji ukazuje jako dosud
- [ ] #2 Odpověď, ke které agent důkaz přiložil, ukazuje jeho kontrolu v seznamu důkazů a vyvrácená citace je vidět i u odpovědi
- [ ] #3 Rozhodnutí dělá jedno pravidlo ve sdíleném nebo hostitelském kódu s testem; desktop, CLI a MCP ho čtou ze stejné odpovědi
- [ ] #4 Starší klient dostane platnou odpověď; decision-10 a docs/review-ide/06-ai-a-review.md uvádějí pravidlo
<!-- AC:END -->
