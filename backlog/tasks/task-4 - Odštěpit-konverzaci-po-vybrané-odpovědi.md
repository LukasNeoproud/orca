---
id: TASK-4
title: Odštěpit konverzaci po vybrané odpovědi
status: In Progress
assignee: []
created_date: 2026-09-17 12:38
updated_date: '2026-11-09T20:51:00Z'
labels: []
dependencies: []
references:
  - https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed
type: feature
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Uživatel potřebuje rozvinout vedlejší otázku nebo alternativu bez zahlcení původního vlákna. Umožnit ruční historické odštěpení a uchovat jeho původ. Tento úkol dodává základ větvení se zachováním kontextu; cílený kontext, rozšířená navigace a automatické dělení mají vlastní úkoly. Historie konverzace není snapshot souborů a odštěpení nemá samo vracet změny kódu.

Společné požadavky: navázat na existující strukturovaný chat a runtime Orcy; podporovat SSH execution host i folder workspace bez Gitu, zachovat kompatibilitu různých verzí klienta a hostitele a respektovat docs/STYLEGUIDE.md. Konkrétní dostupnost agentních API ověřit při implementaci; tvrzení ze zdrojové diskuse nejsou ověřeným kontraktem instalované verze.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 U dokončené odpovědi lze vytvořit odvozené vlákno s konverzačním kontextem nejvýše po zvolený bod; pozdější zprávy rodiče se nepřenášejí.
- [x] #2 Uložený vztah obsahuje identitu zdroje, bod odštěpení, cílové vlákno, execution host a pracovní prostředí a přežije restart.
- [ ] #3 Uživatel vidí pracovní prostředí nového vlákna a může využít existující workspace nebo dostupný tok vytvoření worktree; folder workspace nevyžaduje Git.
- [x] #4 UI výslovně rozlišuje historický kontext a současné soubory, pokud historický stav souborů není k dispozici; žádný checkout ani reset neproběhne implicitně.
- [x] #5 Vytvoření odbočky samo nespustí implementaci agenta; opakované potvrzení nebo opakované doručení nevytvoří duplicitní potomky.
- [x] #6 Probíhající turn a nepodporovaná verze poskytovatele mají srozumitelný výsledek bez poškození rodiče; testy pokrývají hranici historie, obnovu a opakování operace.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementace: commity 532b087c24 (hostitel), 140f22f09f až 8b937d340d (chat), eeb61b4e46 (terminál), 907f175bfa (Android); návrh v docs/reference/conversation-branching.md.
Odchylka podle rozhodnutí uživatele: větve sdílejí workspace rodiče s pojistkou proti souběžnému odesílání; volba jiného workspace ani worktree pro větev není (AC #3 zůstává otevřené). Odštěpení funguje pro Claude chat, Claude v terminálu i Android.
<!-- SECTION:NOTES:END -->
