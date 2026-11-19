---
id: TASK-86
title: 'Brány kvality: oddíl místních bran v panelu Checks'
status: In Progress
assignee: []
created_date: '2026-11-18T15:17:00Z'
updated_date: '2026-11-19T09:35:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-85
documentation:
  - docs/review-ide/06-ai-a-review.md
  - docs/review-ide/03-rozlozeni.md
priority: high
type: feature
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Výsledek bran kvality má být vidět v panelu kontrol aktivního workspace a odtud má jít brány spustit a zrušit. Bez toho o bránách ví jen ten, kdo je spustil z nastavení nebo z CLI.

### Rozsah

- Panel: nový oddíl v panelu Checks (`src/renderer/src/components/right-sidebar/ChecksPanel.tsx`, adresář `checks-panel/`). Komponenty oddílu patří do `src/renderer/src/components/quality-gates/`; do panelu jen registrace.
- Data a akce z RPC `qualityGates.*` z TASK-85 (`src/renderer/src/lib/quality-gate-client.ts`); odběr změn stavu místo dotazování v intervalu, pokud to hostitel umí.
- Položka v hlavním menu, pokud už existuje registr z TASK-62.

### Mimo rozsah

- Stav bran na kartě workspace v sidebaru: TASK-121.
- Smyčka zpětné vazby agentovi a její stav: TASK-87.
- Stav bran na stránce pull requestu a před založením pull requestu: TASK-104.
- Odkazy z výstupu na soubor a řádek (M3).

### Omezení

- Nový tab pravého sidebaru nepřidávej: `STATIC_RIGHT_SIDEBAR_TABS` v `src/shared/rpc-contract/client-ui-params.ts` je součást kontraktu se spárovanými klienty a starší klient by rozložení odmítl.
- Panel Checks dnes pro workspace s pull requestem Azure DevOps vrací prázdný výběr (`checks-panel-review.ts`); oddíl místních bran na tom nesmí záviset.
- Vzhled podle `docs/STYLEGUIDE.md`, stavové barvy jen ze stávajících tokenů, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Panel Checks pro aktivní workspace má oddíl místních bran: u každé výsledek, čas, commit a rozbalitelný konec výstupu, tlačítka Spustit vše, Spustit jednu a Zrušit
- [ ] #2 Stav v oddílu se po doběhnutí brány, po commitu a po úpravě souboru obnoví sám, bez ruční obnovy
- [ ] #3 Oddíl místních bran je vidět i u workspace s pull requestem Azure DevOps, GitHubu a GitLabu a u workspace bez pull requestu; folder workspace ho má také
- [ ] #4 SSH workspace ukazuje v oddílu stav ze vzdáleného hostitele; při ztrátě spojení je stav unverifiable, ne selhání
- [ ] #5 Starší spárovaný klient dál načte rozložení pravého sidebaru
- [ ] #6 Komponenty oddílu mají testy a panel je ověřený ve skrytém okně se snímkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Z TASK-119 (2026-11-19), vyřeš v tomto tiketu: (1) zrušený nebo ukončením aplikace zastavený běh ukazuje čerstvost Up to date, jako by byl výsledkem; u běhu bez výsledku čerstvost neukazuj. (2) Důvod zastavení ukončením aplikace je dnes jen text v poli error (QUALITY_GATE_STOPPED_BY_QUIT); když ho stav u workspace nebo agent potřebuje rozlišit, přidej nepovinné pole stopReason, ne novou hodnotu stavu.

Rozděleno 2026-11-19 podle pravidla velikosti: TASK-121 převzal stav bran na kartě workspace v sidebaru.
<!-- SECTION:NOTES:END -->
