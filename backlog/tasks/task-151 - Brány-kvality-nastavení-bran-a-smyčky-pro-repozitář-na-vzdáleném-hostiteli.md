---
id: TASK-151
title: 'Brány kvality: nastavení bran a smyčky pro repozitář na vzdáleném hostiteli'
status: To Do
assignee: []
created_date: '2026-11-20T13:05:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-139
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 207650
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-139 zjistil, že brány ani smyčku nejde z desktopu nastavit pro repozitář na vzdáleném hostiteli: repos:update píše jen místní úložiště a runtime rozhraní pole nezná. Uživatel tak u SSH worktree brány nezapne.

### Výchozí body

- Nejdřív ověř zjištění v kódu (src/main/quality-gates, repos:update, runtime RPC) a zapiš do poznámek, kde se definice čtou při běhu na vzdáleném hostiteli.
- Šablona orcad pro linux-arm64 je v ~/.cache/orca-review-ide/task-139.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Uživatel v nastavení repozitáře, jehož worktree běží na vzdáleném hostiteli (SSH, vzdálený runtime), nastaví brány a zapne smyčku; definice se uloží tam, kde je čte hostitel, který brány spouští
- [ ] #2 Definice dál zapisuje jen okno aplikace na pokyn uživatele, ne agent ani CLI (decision-11)
- [ ] #3 Starší klient i starší hostitel: nové pole je volitelné a vyjednané schopností; testy kompatibility oběma směry
- [ ] #4 Průchod ověřen proti hostiteli v kontejneru se smyšleným agentem: brána selže, smyčka doručí zprávu, stav vlastní vzdálený hostitel
<!-- AC:END -->
