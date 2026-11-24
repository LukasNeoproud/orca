---
id: TASK-149
title: 'Brány kvality: schválení návrhu bran v nastavení repozitáře'
status: Done
assignee: []
created_date: '2026-11-20T09:41:00Z'
updated_date: '2026-11-24T07:49:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-2
dependencies:
  - TASK-148
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 207900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Návrh bran od agenta z TASK-148 má uživatel vidět a vyřídit v nastavení repozitáře.

### Rozsah

- Zobrazení a vyřízení návrhu u definic bran v nastavení repozitáře; upozornění v oddílu Local gates.

### Mimo rozsah

- Model, úložiště a protokol návrhu: TASK-148. Tento tiket nemění, co si vyměňují klient a hostitel.

### Omezení

- Vzhled podle docs/STYLEGUIDE.md, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nastavení repozitáře ukazuje čekající návrh bran jako rozdíl proti platným branám: nové, změněné a odebrané brány s příkazem a zdůvodněním agenta
- [x] #2 Uživatel návrh přijme celý, po položkách, nebo zahodí; přijatou položku jde před přijetím upravit
- [x] #3 Oddíl Local gates v panelu Checks upozorní, že čeká návrh, a odkáže na něj
- [x] #4 U hostitele bez schopnosti návrhů se nic z toho neukazuje; SSH i folder workspace fungují
- [x] #5 Komponenty mají testy; průchod návrh, přijetí části a zahození je ověřený ve skrytém okně se snímkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker):
- Klient v rendereru: src/renderer/src/lib/quality-gate-proposal-client.ts (schopnost, qualityGates.proposal, qualityGates.resolveProposal), tolerantní čtení přes readQualityGateProposalResult.
- Čistý pohled rozdílu (quality-gate-proposal-view.ts) nad applyQualityGateProposalItems: nová / změněná brána, změněná pole, zmizelý cíl, konflikt názvu a limit 20.
- Hook usePendingQualityGateProposal: jen hostitel tohoto počítače nebo runtime prostředí se schopností quality-gates.proposals.v1; SSH relay nic. Čte při otevření a po 15 s, protože hostitel změnu návrhu nehlásí proudem.
- Nastavení repozitáře: blok návrhu nad branami (přijmout vše, zahodit vše, po položkách přijmout / upravit / zahodit). Úprava = zápis brány přes useRepositoryQualityGateSettingsWriter a pak zahození položky; selhání druhého kroku ukáže chybu a položka zůstane k zahození.
- Local gates: řádek upozornění s odkazem do nastavení.
- Odebrání brány protokol nemá: kritérium #1 jen pro nové a změněné.
- Texty v šesti jazycích, testy komponent, e2e ve skrytém okně se snímky.

Stav (worker): hotové klient (src/renderer/src/lib/quality-gate-proposal-client.ts), pohled rozdílu, hook usePendingQualityGateProposal, blok návrhu v nastavení (RepositoryQualityGateProposal + QualityGateProposalItemCard), upozornění v Local gates, texty v 6 jazycích, testy komponent a e2e tests/e2e/quality-gates-proposal-ui.spec.ts (prochází, snímky ~/.cache/orca-review-ide/task-149). Zbývá: brány kvality kódu (tc, code-quality, anti-slop, oxlint, ratchety), dokumentace 06-ai-a-review.md.

Hotovo (worker): kritéria #2-#5 splněná a ověřená; #1 jen pro nové a změněné brány, odebrání protokol neumí (otevřená otázka z TASK-148). Ověřeno: pnpm tc 0; check:code-quality:changed 0 nálezů; oxlint 0; audit:anti-slop 0; focus-read a layout-writer ratchety 0; vitest 31 souborů (242 testů) v čistém prostředí s Node 24, i18n testy 16 souborů a verify-localization-catalogs; e2e ve skrytém okně quality-gates-proposal-ui, quality-gates-proposal, quality-gates-settings-link a quality-gates-checks-panel 4 passed po čistém buildu; snímky ~/.cache/orca-review-ide/task-149/01-05.

Kritérium #1 je splněné pro nové a změněné brány. Odebranou bránu návrh nenese (TASK-148); jestli ji má nést, je otevřená otázka na uživatele položená 2026-11-20. Při odpovědi ano vznikne samostatný tiket se změnou protokolu, při ne se kritérium přepíše.

Rozhodnutí uživatele 2026-11-24: decision-14 (telefon návrh nevyřizuje; agent smí navrhnout odebrání brány, TASK-164 a TASK-165; zápisu na dálku stačí spojení spárované aplikace).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Nastavení repozitáře ukazuje čekající návrh bran nad platnými branami: nové a změněné brány s příkazem, změněnými poli a zdůvodněním agenta. Uživatel přijme vše, položku, nebo zahodí; upravená položka se uloží jako jeho vlastní brána a položka se zahodí. Oddíl Local gates upozorní na čekající návrh a odkáže do nastavení. Hostitel bez schopnosti návrhů neukazuje nic; návrh se čte při otevření a pak po 15 s. Protokol se nezměnil. Odebrání brány návrhem chybí a čeká na rozhodnutí uživatele. Ověřeno testy komponent a e2e průchodem ve skrytém okně.
<!-- SECTION:FINAL_SUMMARY:END -->
