---
id: TASK-66
title: 'Annotate: autor a commit u řádků a historie vybraného bloku'
status: Done
assignee: []
created_date: '2026-11-18T12:43:00Z'
updated_date: '2026-11-18T19:28:00Z'
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
- [x] #1 Přepínač Annotate v editoru zobrazí u řádků zkrácený commit, autora a datum; souvislé řádky stejného commitu tvoří jednu skupinu
- [x] #2 Najetí na anotaci ukáže předmět commitu a klik otevře commit v historii
- [x] #3 Akce Show history for selection vypíše commity, které měnily vybrané řádky, a výběr commitu ukáže jeho změnu toho bloku
- [x] #4 Necommitnuté řádky jsou označené jako necommitnuté a anotace odpovídají obsahu editoru i s neuloženými změnami, nebo se pro neuložený soubor nenabízejí
- [x] #5 Funguje pro lokální worktree; WSL a SSH worktree jdou na hostitele stejnou cestou jako historie commitů (testy klienta, RPC a provideru); ve folder workspace bez gitu se akce nenabízejí. Běh proti skutečnému SSH hostiteli ověří TASK-109
- [x] #6 Proti hostiteli se starší verzí Orky, který nové dotazy nezná, jsou akce skryté nebo vypnuté s vysvětlením, bez chybové hlášky
- [x] #7 Příkazy Gitu používají jen volby starší než Git 2.25, mají případ v kontraktu git-binary-compatibility a jejich výstup je omezený počtem commitů a jedním souborem. Běh proti binárce Gitu 2.25 ověří TASK-109
- [x] #8 Parsování výstupu blame a historie bloku pokrývají testy proti skutečnému gitu; chování v editoru je ověřené ve skrytém okně
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker, 2026-11-18):
1. shared: git-blame.ts (git blame --porcelain --contents - -- <path>, parser, sloučení sousedních řádků stejného commitu) a git-line-history.ts (rev-parse HEAD, git diff -U0 <oid> -- <path> pro přepočet řádků pracovního stromu na HEAD, git log -n<limit+1> -L<a>,<b>:<path> <oid>, parser).
2. main: git/annotate.ts, getBlame/getLineHistory v IGitProvider + local provider, IPC git:blame a git:lineHistory ve vlastním souboru, RPC git.blame a git.lineHistory (git-annotate-params.ts, git-annotate-methods.ts, RuntimeGitAnnotateCommands), katalog a kontraktní test.
3. preload: vlastní jmenný prostor gitAnnotate (web-git-api.ts je na limitu 300 řádků) pro Electron i web klienta.
4. renderer: components/git-annotate/ – stav per soubor, anotace přes lineNumbers Monaca + dekorace s hoverem, přepočet na neuložený obsah diffem řádků, položky v gutter menu a akce v kontextovém menu editoru, historie bloku v GitHistoryPanel (volitelný render rozbalené položky), klik na anotaci otevře Git graph na commitu.
5. Starší hostitel: úzký predikát method_not_found, zapamatovaný per prostředí, akce vypnuté s vysvětlením.
6. Testy proti skutečnému gitu, případy do git-binary-compatibility, ověření ve skrytém okně.

Hotovo (1/3): shared git-blame.ts + git-line-history.ts s testy proti skutečnému gitu, main git/annotate.ts, provider, IPC git:blame/git:lineHistory, RPC git.blame/git.lineHistory, katalog, kontraktní test, preload gitAnnotate (Electron i web), renderer runtime-git-annotate-client.ts, případ v git-binary-compatibility. Zbývá: renderer UI (components/git-annotate), lokalizace, historie bloku v panelu, skok do Git graphu, ověření ve skrytém okně.

Hotovo (2/3): renderer v src/renderer/src/components/git-annotate (store, mapování řádků, HTML gutteru, hook use-monaco-git-annotate, položky gutter menu, SourceControlCommitList s historií bloku, GitLineHistoryPatch, fokus commitu v Git grafu); registrace v MonacoEditor, MonacoGutterContextMenu, git-history-panel (renderExpandedCommit), panel-content, git-graph-view/tab. pnpm tc exit 0. Zbývá: lokalizační klíče gitAnnotate.* do 6 jazyků, oxlint + check:code-quality:changed, ověření ve skrytém okně, odškrtnutí AC.

Dokončeno workerem 2026-11-18, čeká na ověření koordinátorem. Hotovo (3/3): lokalizace gitAnnotate.* v 6 jazycích, jednotkové a komponentové testy (kontext souboru, starší hostitel, položky menu, klient, RPC metody), e2e tests/e2e/git-annotate.spec.ts ve skrytém okně (prochází), docs/review-ide/07-funkce-z-ide.md oddíl 5. pnpm tc, oxlint nad 55 soubory a check:code-quality:changed prochází. Snímky: ~/.cache/orca-review-ide/task-66/01..06-*.png. Neodškrtnuto: AC 5 (WSL a SSH ověřeny jen testy směrování, RPC a provideru, ne proti skutečnému hostiteli; lokální worktree a folder workspace doloženy) a AC 7 (Git 2.25 lokálně není; případ je v CI kontraktu git-binary-compatibility a lokálně prošel na Gitu 2.54; omezení výstupu doloženo).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Přepínač Annotate v editoru ukazuje u řádků zkrácený commit, datum a autora (souvislé řádky jednoho commitu jako skupina), najetí ukáže předmět a klik otevře commit v záložce Git graph. Akce Show History for Selection vypíše commity, které měnily vybrané řádky, a u každého jen změnu toho bloku. Anotace odpovídají obsahu editoru i s neuloženými změnami (necommitnuté řádky jsou označené); historie bloku u neuloženého souboru požádá o uložení. Git běží na hostiteli workspace (git blame --porcelain --contents, git log -L, obojí starší než Git 2.25), výstup je omezený na jeden soubor, 200 commitů, 2 MB a 50 000 řádků; starší hostitel se pozná podle method_not_found a akce jsou vypnuté s vysvětlením. Ověřeno testy proti skutečnému gitu 2.54 a e2e ve skrytém okně. Neověřeno během: Git 2.25, SSH a WSL hostitel, skutečná starší Orca; běh proti Gitu 2.25 a SSH má TASK-109. Historie bloku ukazuje posledních 50 commitů bez načtení dalších; přepínač nepřežije restart.
<!-- SECTION:FINAL_SUMMARY:END -->
