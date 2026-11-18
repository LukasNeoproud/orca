---
id: TASK-56
title: 'Pokus: language server pro C# na .NET backendu'
status: To Do
assignee: []
created_date: '2026-11-18T12:41:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-0
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
priority: medium
type: spike
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Vybrat language server pro C# a ověřit ho na skutečném backendu. Dokumentace uvádí Roslyn language server, případně csharp-ls, a upozorňuje na licenční omezení některých součástí od Microsoftu.

### Postup

- Pracuj nad kopií backendu uvedeného v `CLAUDE.local.md` (sekce Review IDE), vytvořenou mimo jeho checkout.
- Servery instaluj do `~/.cache/orca-review-ide/tools`, ne globálně.
- Server ovládej skriptem přes stdio, stejně jako v ostatních pokusech.

### Mimo rozsah

- Integrace do Orky, ladění, C# Dev Kit.

### Omezení

- Z firemních projektů nesmí nic odejít ven a do záznamu rozhodnutí nepatří názvy modulů, tříd, adresy ani úryvky kódu. Uváděj jen míry a obecné závěry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Záznam rozhodnutí porovnává Roslyn language server a csharp-ls: stav definice, referencí, hoveru, doplňování, diagnostiky, přejmenování a hledání symbolů na řešení s více projekty
- [ ] #2 Záznam uvádí u obou serverů licenci a způsob získání a výslovně říká, zda je smí používat aplikace mimo produkty Microsoftu
- [ ] #3 Záznam uvádí čas načtení řešení, paměť procesu a dobu odezvy na opakované dotazy
- [ ] #4 Záznam končí volbou serveru pro M3 a požadavkem na verzi .NET SDK u uživatele
- [ ] #5 Checkout uživatelova projektu zůstal beze změny, včetně nesledovaných souborů
<!-- AC:END -->
