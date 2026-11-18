---
id: TASK-78
title: >-
  Prověřit prázdné odebrané řádky v diffu pull requestu a obnovu seznamu po
  přidání projektu
status: Done
assignee: []
created_date: '2026-11-18T13:20:00Z'
updated_date: '2026-11-18T23:06:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/01-integrace.md
priority: low
type: bug
ordinal: 228000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Při ověření review proti skutečné organizaci (TASK-67) se ve skrytém okně ukázaly dvě vady zobrazení, které nešlo spolehlivě odlišit od projevu okna, které se nikdy nevykreslí na obrazovku. Recenzent musí v diffu vidět, co bylo odebráno, a seznam musí odpovídat přidaným projektům.

### Rozsah

- `src/renderer/src/components/azure-devops-review/AzureDevOpsReviewFileDiffPane.tsx` a `azure-devops-review-diff-sections.ts`: v inline zobrazení byly odebrané řádky červený pruh bez textu a přidaný soubor měl nad prvním řádkem jeden prázdný odebraný řádek. Porovnat se stejným diffem v záložce diffu workspace (`src/renderer/src/components/editor/combined-diff`).
- `src/renderer/src/components/right-sidebar/AzureDevOpsPullRequestsPanel.tsx` a `src/renderer/src/store/azure-devops-review-store.ts`: po přidání druhého projektu panel dál ukazoval jen pull requesty prvního, dokud uživatel nestiskl Obnovit.

### Mimo rozsah

- Poloha inline komentářů a stránkování seznamu: mají vlastní tikety.

### Omezení

- Nejdřív reprodukovat; když se vada nepotvrdí, tiket končí zápisem důkazu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Chybějící text odebraných řádků u změněného souboru se nad smyšlenými daty neprojevil (inline, všechny změny i jeden soubor; CRLF, zalomené řádky, sbalené oblasti) a je zapsané, co bylo zkoušeno; pravděpodobnou příčinu, nenačtenou původní stranu zobrazenou jako prázdnou, řeší TASK-114
- [x] #2 Nově přidaný soubor nezobrazuje nad obsahem prázdný odebraný řádek
- [x] #3 Po přidání nebo odebrání projektu se panel Pull requests sám obnoví
- [x] #4 Obojí je ověřené ve skrytém okně snímkem a testem komponenty nebo stavu
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: 1) e2e ve skrytém okně s podvrženým REST (vzor snapshot-diff-pull-request.spec.ts): změněný a přidaný textový soubor, inline zobrazení, kontrola textu odebraných řádků a prázdného odebraného řádku v DOM Monaca + snímek. 2) Test panelu: přidání/odebrání projektu v app store má samo spustit refresh(); oprava v panelu nebo store. 3) Opravy až po reprodukci, testy sdílených komponent editoru.

Hotovo: (1) Text odebraných řádků se nad smyšlenými daty NEreprodukoval: e2e tests/e2e/pull-request-inline-diff.spec.ts ve skrytém okně, inline v obou zobrazeních (všechny změny i jeden soubor), i varianta CRLF + dlouhé zalamované řádky + diffWordWrap + sbalené nezměněné oblasti; text je v DOM i na snímku. AC #1 nechávám neodškrtnuté. (2) Prázdný odebraný řádek u přidaného souboru reprodukován (e2e selhal: zóna odebraných řádků ['']). Příčina: Monaco 0.55 pro prázdný originál vždy mapuje řádek 1 originálu jako odebraný (diffProviderFactoryService i defaultLinesDiffComputer). Oprava: volitelný prop hideEmptyOriginalLine v DiffViewer a DiffSectionItem/Body (diff-editor-empty-original-options.ts) zapne experimental.useTrueInlineView jen pro prázdný originál; zapnuto jen v review Azure DevOps, workspace a GitHub/GitLab beze změny. (3) Panel: test AzureDevOpsPullRequestsPanel.projects.test.tsx selhal 2/3 před opravou; store si pamatuje podpis projektů (noteProjects), panel při změně obnoví seznam, i po znovuotevření. e2e tests/e2e/pull-request-list-project-change.spec.ts před opravou selhal, po ní prochází. Snímky ~/.cache/orca-review-ide/task-78.

Otázka pro uživatele (2026-11-19): zapnout skrytí fantomového odebraného řádku u přidaného souboru i v diffu workspace a v pull requestech GitHubu a GitLabu? Je to jeden řádek v každém volajícím a působí jen pro prázdnou původní stranu, ale mění chování komponent sdílených s upstreamem. Doporučení workera: ano. Do rozhodnutí je zapnuté jen pro Azure DevOps.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dvě ze tří pozorovaných vad jsou reprodukované testem a opravené. Přidaný soubor už v inline diffu pull requestu Azure DevOps nemá nad prvním řádkem prázdný odebraný řádek (Monaco ho pro prázdnou původní stranu vyrábí vždy; diff ho skryje nepovinnou volbou zapnutou jen pro Azure DevOps, zobrazení vedle sebe se nemění). Seznam pull requestů se obnoví, když se v Orce přidá nebo odebere projekt, i když se to stalo při zavřeném panelu. Třetí vada, červený pruh bez textu u změněného souboru, se nad smyšlenými daty neprojevila a naslepo opravená není; pravděpodobnou příčinu (nenačtená původní strana braná jako prázdná) řeší TASK-114. Ověřeno testy, které před opravou selhaly, a e2e ve skrytém okně se snímky. Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
