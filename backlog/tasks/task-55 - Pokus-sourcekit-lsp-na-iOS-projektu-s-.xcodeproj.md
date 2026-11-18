---
id: TASK-55
title: 'Pokus: sourcekit-lsp na iOS projektu s .xcodeproj'
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
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Ověřit, že sourcekit-lsp z toolchainu Xcode použitelně funguje na skutečném iOS projektu s `.xcodeproj`, ne jen na Swift balíčku. Dokumentace počítá s build serverem (např. xcode-build-server).

### Postup

- Pracuj nad kopií iOS projektu uvedeného v `CLAUDE.local.md` (sekce Review IDE), vytvořenou mimo jeho checkout.
- Build jen pro simulátor, bez podepisování.
- Server ovládej skriptem přes stdio, aby šla měření zopakovat. Skript z pokusu s kotlin-lsp použij znovu, pokud už existuje v `~/.cache/orca-review-ide`.

### Mimo rozsah

- Integrace do Orky, fyzická zařízení, SwiftUI Preview.

### Omezení

- Z firemních projektů nesmí nic odejít ven a do záznamu rozhodnutí nepatří názvy modulů, tříd, adresy ani úryvky kódu. Uváděj jen míry a obecné závěry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Záznam rozhodnutí uvádí pro definici, reference, hover, doplňování, diagnostiku, přejmenování a hledání symbolů stav funguje, částečně nebo nefunguje na souborech z hlavního targetu a z aspoň jednoho Swift balíčku projektu
- [ ] #2 Záznam popisuje, co je potřeba připravit, než server odpovídá: build server, první build, index; s časem a místem na disku
- [ ] #3 Záznam uvádí změřenou paměť procesu a dobu odezvy na opakované dotazy
- [ ] #4 Záznam končí doporučením, zda Orca přípravu udělá sama, nebo ji vyžádá od uživatele, a co se stane bez ní
- [ ] #5 Checkout uživatelova projektu zůstal beze změny, včetně nesledovaných souborů
<!-- AC:END -->
