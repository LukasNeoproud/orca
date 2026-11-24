---
id: TASK-164
title: 'Brány kvality: návrh od agenta smí bránu odebrat (hostitel, protokol, CLI)'
status: To Do
assignee: []
created_date: '2026-11-24T07:49:00Z'
labels:
  - review-ide
  - effort-high
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

Uživatel 2026-11-24 rozhodl, že agent smí navrhnout i odebrání brány (decision-14). Dnes návrh umí bránu jen přidat nebo změnit. Odebrání agentovi dovolí navrhnout zrušení kontroly, která nedává smysl; platit začne až po schválení uživatelem.

### Rozsah

- Model návrhu a `applyQualityGateProposalItems` (`src/shared/quality-gate-proposal.ts`), parametry (`src/shared/rpc-contract/quality-gate-params.ts`), hostitel (`src/main/quality-gates/quality-gate-proposals.ts`), CLI (`src/cli/quality-gate-proposal-input.ts`, `src/cli/quality-gate-proposal-format.ts`).

### Mimo rozsah

- Zobrazení v nastavení repozitáře: TASK-165.
- Kdo smí návrh vyřídit: beze změny (decision-14, decision-11).

### Omezení

- Odebráním agent oslabuje kontrolu své práce. Hostitel podle čekajícího návrhu nic neodebere ani nepřeskočí.
- Klient a hostitel se aktualizují nezávisle; starší klient z TASK-149 nesmí položku odebrání přijmout omylem jako něco jiného.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Návrh smí nést položku, která odebírá bránu repozitáře podle jejího id, s volitelným zdůvodněním; přes orca gates propose i RPC
- [ ] #2 Odebrání se provede až přijetím položky; přijmout ji smí jen okno aplikace nebo spárovaná desktopová aplikace, stejnou kontrolou a zápisem jako ostatní položky
- [ ] #3 Čekající návrh s odebráním nic nemění: brána dál platí, spouští se a smyčka zpětné vazby ji dál vyžaduje
- [ ] #4 Nový druh položky je za novou schopností hostitele; starší hostitel návrh s odebráním odmítne srozumitelně a starší klient položku, kterou nezná, neukáže jako přidání ani změnu; test kompatibility oběma směry
- [ ] #5 Testy pokrývají návrh odebrání, přijetí, zahození, odebrání brány, která mezitím zmizela, a pokus agenta položku přijmout
<!-- AC:END -->
