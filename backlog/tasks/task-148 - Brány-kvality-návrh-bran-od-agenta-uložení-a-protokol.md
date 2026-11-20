---
id: TASK-148
title: 'Brány kvality: návrh bran od agenta, uložení a protokol'
status: Done
assignee: []
created_date: '2026-11-20T09:41:00Z'
updated_date: '2026-11-20T15:37:00Z'
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
- [x] #1 Agent pošle návrh bran přes CLI (orca gates propose) a RPC; návrh nese u každé brány název, příkaz, povinná nebo volitelná a limit času a volitelné zdůvodnění
- [x] #2 Návrh se uloží jako čekající u repozitáře; platné brány se nezmění a podle návrhu se nic nespustí, ani smyčka zpětné vazby
- [x] #3 Přijmout návrh celý nebo po položkách a zahodit ho smí jen aplikace nebo spárované zařízení; agent ani CLI ne
- [x] #4 Nový návrh nahradí předchozí čekající návrh téhož repozitáře; počet a velikost položek jsou omezené a text návrhu se dál předává jako data
- [x] #5 Metody jsou za novou schopností hostitele; starší klient i hostitel fungují dál a test to dokládá
- [x] #6 SSH worktree: návrh se ukládá tam, kde jsou definice bran repozitáře; folder workspace s repozitářem návrh přijímá také
- [x] #7 Testy pokrývají návrh, přijetí celku, přijetí části, zahození a pokus agenta návrh přijmout
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker 2026-11-20): model a tolerantní čtení v src/shared/quality-gate-proposal.ts; úložiště quality-gate-proposals.json v datech Orky na hostiteli, jeden čekající návrh na repozitář (src/main/quality-gates/quality-gate-proposal-store.ts); metody qualityGates.propose (worktree, kdokoli pojmenovaný), qualityGates.proposal (čtení podle repo) a qualityGates.resolveProposal (accept/dismiss, celek nebo itemIds; kontrola volajícího a zápis přes writeQualityGateRepositorySettings z TASK-151); schopnost quality-gates.proposals.v1; CLI orca gates propose (--gate JSON opakovaně, --file, --rationale); testy hostitele, CLI a kompatibility; doplnění decision-11/13 a 06-ai-a-review.md. Klient v rendereru nechávám TASK-149.

Hotovo: model, úložiště, tři metody RPC, schopnost, CLI gates propose, testy (hostitel nad dispatcherem, úložiště, sdílený model, kompatibilita, kontrakt parametrů, CLI). Zbývá: širší běh testů, brány kvality kódu, dokumentace (decision-11, decision-13, 06-ai-a-review.md), odškrtnutí kritérií.

Ověřeno: pnpm tc 0; check:code-quality:changed 0 nálezů; oxlint 0; audit:anti-slop bez mých souborů; ratchety 0; vitest 184 souborů bran, RPC, shared a CLI (2931 passed) a 50 souborů registru metod a schopností (599 passed); e2e tests/e2e/quality-gates-proposal.spec.ts ve skrytém okně 2x passed (návrh z CLI, odpověď z runtime socketu odmítnuta, z okna přijata po položce, nahrazení, zahození), snímek ~/.cache/orca-review-ide/task-148/01-accepted-item-in-settings.png. tests/e2e/quality-gates-settings.spec.ts v mém prostředí 2x selhal na kroku 'Out of date: another commit' (zůstává 'files changed'); na HEAD se mi ho ověřit nepodařilo, od TASK-128 ho žádný tiket nespouštěl. Otevřené: telefon návrh přijmout nesmí (kritérium #3 říká spárované zařízení) - otázka pro uživatele; klient v rendereru a signál změny návrhu nechány TASK-149.

Otevřené otázky na uživatele (položeny při zastavení koordinátora 2026-11-20): 1) smí návrh přijmout nebo zahodit telefon (kritérium #3 říká spárované zařízení, pravidlo z TASK-151 telefon nepouští; platí TASK-151); 2) má návrh umět bránu smazat (teď jen přidat a změnit).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Agent nebo CLI pošle návrh bran (orca gates propose, qualityGates.propose); hostitel ho uloží jako čekající u repozitáře do vlastního souboru, platné brány nezmění a nic nespustí. Přijmout celek nebo položky a zahodit návrh (qualityGates.resolveProposal) smí jen okno aplikace nebo spárovaná desktopová aplikace, stejnou kontrolou a zápisem jako nastavení bran z TASK-151; runtime socket a telefon jsou odmítnuti. Nový návrh nahradí starý, meze velikosti hlídá schéma. Metody jsou za schopností quality-gates.proposals.v1, kompatibilita oběma směry má test. Ověřeno testy nad dispatcherem a e2e se zkompilovaným CLI proti běžící aplikaci; SSH jen testy.
<!-- SECTION:FINAL_SUMMARY:END -->
