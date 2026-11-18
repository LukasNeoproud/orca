---
id: TASK-66
title: 'Annotate: autor a commit u řádků a historie vybraného bloku'
status: To Do
assignee: []
created_date: '2026-11-18T12:43:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/07-funkce-z-ide.md
priority: medium
type: feature
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

U řádku vidět, kdo a kdy ho změnil, a u vybraného bloku projít jeho historii, bez odchodu do jiného nástroje.

### Rozsah

- Čtení přes `GitProvider` (`src/main/providers/git-provider-contract.ts`), stejnou cestou jako historie commitů (`src/main/git/history.ts`), aby fungovalo SSH a WSL.
- Anotace na okraji Monaca; výchozí body `src/renderer/src/components/editor/MonacoEditor.tsx` a `MonacoGutterContextMenu.tsx`.
- Výpis historie bloku ve stávajícím seznamu commitů (`src/renderer/src/components/right-sidebar/source-control/sync/git-history-panel.tsx`).
- Nové dotazy runtime: parametry v `src/shared/rpc-contract`, katalog přegeneruj a doplň párování v `runtime-git-api-contract.test.ts`.

### Mimo rozsah

- Vysvětlení od AI, proč kód vypadá tak, jak vypadá.
- Blame v diffu a v review pull requestu.

### Omezení

- Pravidla Git Scan Safety z AGENTS.md: pojmenovaný ref, jedna cesta, `--max-count`.
- Nový dotaz je pro starší protějšek neznámý; rozliš to úzkým predikátem, ne obecným zachycením chyby.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Přepínač Annotate v editoru zobrazí u řádků zkrácený commit, autora a datum; souvislé řádky stejného commitu tvoří jednu skupinu
- [ ] #2 Najetí na anotaci ukáže předmět commitu a klik otevře commit v historii
- [ ] #3 Akce Show history for selection vypíše commity, které měnily vybrané řádky, a výběr commitu ukáže jeho změnu toho bloku
- [ ] #4 Necommitnuté řádky jsou označené jako necommitnuté a anotace odpovídají obsahu editoru i s neuloženými změnami, nebo se pro neuložený soubor nenabízejí
- [ ] #5 Funguje pro lokální, WSL i SSH worktree; ve folder workspace bez gitu se akce nenabízejí
- [ ] #6 Proti hostiteli se starší verzí Orky, který nové dotazy nezná, jsou akce skryté nebo vypnuté s vysvětlením, bez chybové hlášky
- [ ] #7 Příkazy Gitu fungují s Gitem 2.25 a jejich výstup je omezený počtem commitů a jedním souborem
- [ ] #8 Parsování výstupu blame a historie bloku pokrývají testy proti skutečnému gitu; chování v editoru je ověřené ve skrytém okně
<!-- AC:END -->
