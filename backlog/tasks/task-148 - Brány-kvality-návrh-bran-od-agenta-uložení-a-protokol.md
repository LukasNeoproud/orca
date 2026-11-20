---
id: TASK-148
title: 'Brány kvality: návrh bran od agenta, uložení a protokol'
status: To Do
assignee: []
created_date: '2026-11-20T09:41:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-87
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 207800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Agent má pomoct s volbou bran, ale příkaz, kterým se jeho práce kontroluje, musí vždy potvrdit člověk (decision-13). Agent proto brány jen navrhne a platit začnou až po schválení.

### Rozsah

- Model návrhu a jeho úložiště vedle definic bran (TASK-85), metody RPC qualityGates.* pro návrh, čtení návrhu a jeho vyřízení, příkaz CLI.
- Vyřízení návrhu zapisuje definice stejnou cestou jako nastavení repozitáře (repos:update), ne novou.

### Mimo rozsah

- Zobrazení návrhu v nastavení repozitáře: TASK-149.
- Šablony bran podle typu projektu (decision-13: nedělají se).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Agent pošle návrh bran přes CLI (orca gates propose) a RPC; návrh nese u každé brány název, příkaz, povinná nebo volitelná a limit času a volitelné zdůvodnění
- [ ] #2 Návrh se uloží jako čekající u repozitáře; platné brány se nezmění a podle návrhu se nic nespustí, ani smyčka zpětné vazby
- [ ] #3 Přijmout návrh celý nebo po položkách a zahodit ho smí jen aplikace nebo spárované zařízení; agent ani CLI ne
- [ ] #4 Nový návrh nahradí předchozí čekající návrh téhož repozitáře; počet a velikost položek jsou omezené a text návrhu se dál předává jako data
- [ ] #5 Metody jsou za novou schopností hostitele; starší klient i hostitel fungují dál a test to dokládá
- [ ] #6 SSH worktree: návrh se ukládá tam, kde jsou definice bran repozitáře; folder workspace s repozitářem návrh přijímá také
- [ ] #7 Testy pokrývají návrh, přijetí celku, přijetí části, zahození a pokus agenta návrh přijmout
<!-- AC:END -->
