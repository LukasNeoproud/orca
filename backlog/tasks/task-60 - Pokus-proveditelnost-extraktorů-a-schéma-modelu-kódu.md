---
id: TASK-60
title: 'Pokus: proveditelnost extraktorů a schéma modelu kódu'
status: To Do
assignee: []
created_date: '2026-11-18T12:42:00Z'
labels:
  - review-ide
  - effort-xhigh
milestone: m-0
dependencies: []
documentation:
  - docs/review-ide/01-integrace.md
priority: medium
type: spike
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Ověřit, že jeden model kódu jde naplnit ze tří jazyků dost rychle na to, aby se počítal na pozadí, a navrhnout jeho schéma. Na výsledku stojí milníky M4 a M5.

### Postup

- Kotlin: Gradle model projektu a Kotlin PSI (kotlin-compiler-embeddable) na JVM.
- Swift: `swift package describe`, seznam targetů `.xcodeproj` a SwiftSyntax. Jak Orca dnes sestavuje nativní pomocníky, ukazují `config/scripts/build-notification-status-macos.mjs` a `native/`.
- C#: Roslyn jako .NET nástroj.
- Prototypy drž mimo `src/`; do repozitáře patří jen smyšlené projekty pro testy a návrh schématu. Navrhni pro ně umístění, které nekoliduje s upstreamem.
- Na skutečných projektech z `CLAUDE.local.md` jen měř, nad kopií mimo jejich checkout.

### Mimo rozsah

- Obrazovky, intenty a controllery v prototypech; stačí je mít ve schématu.
- Proces na pozadí, cache a RPC v Orce.

### Omezení

- Z firemních projektů nesmí nic odejít ven a do záznamu rozhodnutí nepatří názvy modulů, tříd, adresy ani úryvky kódu.
- Způsob distribuce extraktorů je rozhodnutí uživatele; záznam ho jen připraví s doporučením.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pro Kotlin, Swift a C# existuje spustitelný prototyp, který z malého smyšleného projektu vypíše moduly a závislosti mezi nimi jako JSON ve společném schématu
- [ ] #2 Záznam rozhodnutí uvádí pro každý jazyk čas extrakce na skutečném projektu uživatele a co k ní bylo potřeba: build, synchronizace, nástroje
- [ ] #3 Záznam porovnává u Kotlinu statické čtení Gradle souborů s Gradle Tooling API a volí jedno jako výchozí
- [ ] #4 Návrh schématu verze 0 v docs/review-ide pokrývá moduly a vazby, obrazovky s intenty a přechody, controllery a akce, lokalizační klíče a metriky souborů a říká, co je klíčem cache
- [ ] #5 Záznam navrhuje, jak se extraktory dostanou k uživateli: nástroje nainstalované u uživatele, nebo přibalené k Orce, s dopadem na velikost instalace a na platformy
- [ ] #6 Smyšlené projekty pro testy jsou v repozitáři a neobsahují firemní kód
<!-- AC:END -->
