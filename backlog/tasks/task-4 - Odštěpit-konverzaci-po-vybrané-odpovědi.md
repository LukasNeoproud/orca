---
id: TASK-4
title: Odštěpit konverzaci po vybrané odpovědi
status: To Do
assignee: []
created_date: '2026-09-17 12:38'
labels: []
dependencies: []
references:
  - 'https://chatgpt.com/share/6aabdbe7-faf4-83eb-a4ba-4ee0223b02ed'
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

- [ ] #1 U dokončené odpovědi lze vytvořit odvozené vlákno s konverzačním kontextem nejvýše po zvolený bod; pozdější zprávy rodiče se nepřenášejí.
- [ ] #2 Uložený vztah obsahuje identitu zdroje, bod odštěpení, cílové vlákno, execution host a pracovní prostředí a přežije restart.
- [ ] #3 Uživatel vidí pracovní prostředí nového vlákna a může využít existující workspace nebo dostupný tok vytvoření worktree; folder workspace nevyžaduje Git.
- [ ] #4 UI výslovně rozlišuje historický kontext a současné soubory, pokud historický stav souborů není k dispozici; žádný checkout ani reset neproběhne implicitně.
- [ ] #5 Vytvoření odbočky samo nespustí implementaci agenta; opakované potvrzení nebo opakované doručení nevytvoří duplicitní potomky.
- [ ] #6 Probíhající turn a nepodporovaná verze poskytovatele mají srozumitelný výsledek bez poškození rodiče; testy pokrývají hranici historie, obnovu a opakování operace.

<!-- AC:END -->
