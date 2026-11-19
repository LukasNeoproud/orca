---
id: TASK-132
title: 'Pokus: tree-sitter místo tří extraktorů modelu kódu'
status: To Do
assignee: []
created_date: '2026-11-19T11:46:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-4
dependencies: []
documentation:
  - docs/review-ide/09-model-kodu.md
type: spike
ordinal: 399000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

decision-9 navrhuje tři extraktory modelu kódu nad knihovnami kompilátorů (Kotlin, Swift, C#) s distribucí knihoven a omezením Swiftu na macOS. Uživatel chce před rozepsáním M4 ověřit (decision-12), zda jeden společný parser tree-sitter s hotovými gramatikami pro tyto jazyky dá dost věrný model. Pokud ano, odpadne distribuce, závislost na Javě a .NET i omezení Swiftu.

### Rozsah

- Prototyp mimo repozitář v `~/.cache/orca-review-ide/`: tree-sitter (Node binding nebo WASM) s gramatikami pro Kotlin, Swift a C#; licence a stav údržby každé gramatiky.
- Porovnání s výsledky extraktorů z TASK-60 nad stejnými vstupy (`tests/fixtures/code-model` a kopie projektů pro pokusy z `CLAUDE.local.md`): deklarace, moduly, importy, lokalizační klíče a části schématu `references`.
- Čas, paměť, velikost balíčku, běh na Linuxu a Windows (aspoň podle dokumentace) a přes SSH.
- Co tree-sitter neumí z principu (rozlišení typů, přetížení, rozšiřující funkce) a které pohledy z `docs/review-ide` to omezí.

### Mimo rozsah

- Produkční extraktor a změny v Orce.
- Statické čtení build souborů (přijato v decision-9, zůstává).

### Omezení

- Kopie projektů jen mimo checkout; nic z nich nepatří do sledovaných souborů ani do záznamu (jen počty a druhy rozdílů).
- Výsledek jako doplněk decision-9 nebo nový záznam rozhodnutí s doporučením.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Záznam rozhodnutí porovnává tree-sitter s extraktory z TASK-60 po jazycích: shoda deklarací, modulů, importů a lokalizačních klíčů v procentech a druhy rozdílů
- [ ] #2 Záznam uvádí licence a stav gramatik, čas, paměť a velikost balíčku a běh mimo macOS
- [ ] #3 Záznam doporučí tree-sitter, tři extraktory, nebo kombinaci po jazycích, a jmenuje pohledy, které by doporučená varianta omezila
- [ ] #4 V repozitáři nepřibyl žádný kód, binárka ani údaj z firemních projektů
<!-- AC:END -->
