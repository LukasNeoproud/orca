---
id: TASK-138
title: 'Brány kvality: ovládání a stav smyčky zpětné vazby v rozhraní'
status: Done
assignee: []
created_date: '2026-11-19T21:30:00Z'
updated_date: '2026-11-20T14:17:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-2
dependencies:
  - TASK-87
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 207500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Smyčku zpětné vazby z TASK-87 jde zapnout jen úpravou dat. Uživatel ji má zapnout v nastavení repozitáře, vypnout u workspace a vidět, v jakém je stavu.

### Rozsah

- Nastavení repozitáře: přepínač smyčky a limit kol u definic bran (precedent: nastavení bran z TASK-85).
- Přepínač u workspace nad metodou z TASK-87.
- Stav smyčky v oddílu Local gates (TASK-86) a na kartě workspace (TASK-121), ze stavu bran, který už renderer odebírá.

### Mimo rozsah

- Řízení smyčky, zprávy agentovi a protokol: TASK-87. Tento tiket nemění, co si vyměňují klient a hostitel.

### Omezení

- Vzhled podle docs/STYLEGUIDE.md, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Nastavení repozitáře má u bran zapnutí smyčky a limit kol; výchozí stav je vypnuto a text říká, že smyčka spotřebovává tokeny agenta
- [x] #2 Workspace má přepínač, který smyčku pro něj vypne a zastaví běžící
- [x] #3 Oddíl Local gates a karta workspace ukazují stav smyčky: běží kolo N z M, prošlo, nálezy čekají na uživatele; u hostitele bez smyčky neukazují nic
- [x] #4 Ovládání i stav fungují pro folder workspace i SSH worktree; při ztrátě spojení je stav unverifiable
- [x] #5 Komponenty mají testy; jeden průchod smyčky se smyšleným agentem je ověřený ve skrytém okně se snímkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán workera (2026-11-20): (1) čtení stavu smyčky pro zobrazení v rendereru (quality-gate-feedback-loop-view.ts nad readQualityGateFeedbackLoopStatus; nic, když hostitel pole nemá nebo smyčka v repozitáři vypnutá; při ztrátě spojení unverifiable); (2) nastavení repozitáře: přepínač a limit kol v oddílu Quality Gates (jen místní repozitář, jako brány), zápis přes repos:update; (3) řádek smyčky s přepínačem v oddílu Local gates, volání stávající qualityGates.setFeedbackLoop (bez změny drátu); (4) karta workspace: stav smyčky ve značce a tooltipu, počítadlo kola; (5) texty v šesti jazycích, testy komponent; (6) průchod se smyšleným agentem ve skrytém okně (dočasný spec mimo repozitář), snímek; dokumentace 06 a decision-11.

Stav: hotové rozhraní (nastavení repozitáře RepositoryQualityGateFeedbackLoopSettings, řádek smyčky WorkspaceQualityGateFeedbackLoop v Local gates, stav na kartě s počítadlem kola, čtení quality-gate-feedback-loop-view.ts, klient setQualityGateFeedbackLoop nad stávající metodou), texty v šesti jazycích, testy komponent (108 + 2 prochází). Zbývá: pnpm tc, brány kvality kódu, průchod ve skrytém okně se smyšleným agentem a snímek, dokumentace 06/decision-11.

Hotovo (2026-11-20): průchod ve skrytém okně se smyšleným agentem (python skript posílající hooky ve tvaru Claude přes hooky nainstalované buildem, falešný claude jen pro --version, aby se hooky nainstalovaly): zapnutí smyčky v nastavení repozitáře kliknutím, kolo 1 z 3 v Local gates i na kartě (1/3, tooltip), oprava, Passed after round 1 of 3; druhý řetěz vypnutý přepínačem u workspace během čekání na opravu, agent pak žádnou zprávu nedostal, zapnutí zpět ukáže Stopped: it was turned off. Snímky a timeline v ~/.cache/orca-review-ide/task-138/out (shots/, timeline.log, agent.log), spec a skripty v ~/.cache/orca-review-ide/task-138/specs a scripts; z repozitáře odstraněno. SSH ověřeno testy se smyšleným hostitelem (environment target), ne živým strojem. Brány: pnpm tc, check:code-quality:changed, oxlint, anti-slop, ratchety rendereru, verify:localization-catalogs/coverage prochází; 271 souborů testů (1853 testů) v čistém prostředí s Node 24 prochází. Dokumentace 06 a decision-11 doplněny.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Nastavení repozitáře má pod branami přepínač Feedback loop (výchozí vypnuto, text upozorňuje na tokeny agenta) a limit kol 1 až 10. Oddíl Local gates má řádek smyčky se stavem a přepínačem pro workspace; karta workspace ukazuje během kola počítadlo N/M a v tooltipu řádek smyčky. Hostitel bez pole feedbackLoop a repozitář s vypnutou smyčkou neukazují nic, při ztrátě spojení je stav neznámý a přepínač nejde použít. Protokol se nezměnil. Ověřeno testy komponent (80 testů) a průchodem se smyšleným agentem ve skrytém okně; SSH jen testy.
<!-- SECTION:FINAL_SUMMARY:END -->
