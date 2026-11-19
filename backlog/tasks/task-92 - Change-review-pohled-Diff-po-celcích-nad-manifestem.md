---
id: TASK-92
title: 'Change review: pohled Diff po celcích nad manifestem'
status: To Do
assignee: []
created_date: '2026-11-18T15:19:00Z'
updated_date: '2026-11-19T09:37:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-2
dependencies:
  - TASK-124
documentation:
  - docs/review-ide/05-funkce.md
priority: high
type: feature
ordinal: 212000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Recenzent velkého diffu má hned vidět, kolik z něj musí opravdu číst, a procházet ho po skupinách místo po abecedě souborů. Je to první viditelná část Diffu po celcích; celky a komentáře od AI přidají navazující tikety.

### Rozsah

- Vstup: tlačítko v liště porovnání s bází (`src/renderer/src/components/right-sidebar/source-control/panel/header-toolbar.tsx`); odkaz ze stránky pull requestu (`src/renderer/src/components/azure-devops-review/AzureDevOpsPullRequestPage.tsx`); položka v nabídce Review, pokud už existuje registr z TASK-62. Název v rozhraní je Change review (potvrzeno v TASK-52), v dokumentaci Diff po celcích.
- Pohled staví na souhrnném diffu (`src/renderer/src/components/editor/combined-diff/`, `DiffSectionItem.tsx`, `diff-section-types.ts`): stejné sekce, jiné seskupení. Nový kód patří do `src/renderer/src/components/change-review/`; do sdílených souborů diffu jen registrace.
- Data: `changeReview.getManifest` z TASK-124 (jádro TASK-91); text hunků stávajícím diffem větve.
- Odznak druhu u hunku: dekorace a view zone stejným mechanismem jako inline komentáře (`src/renderer/src/components/diff-comments/`).
- Strom souborů se seskupením podle skupin; stávající strom je `combined-diff/browse-files/`.

### Mimo rozsah

- Celky, souhrn a komentáře od AI; zaškrtnutí Zkontrolováno a průběh; přesuny; riziko a řazení podle něj: navazující tikety.
- Původ řádků na okraji diffu a panel rozhodnutí mimo zadání (M7); panel zadání s kritérii má vlastní tiket.
- Pohled v mobilní aplikaci.

### Omezení

- Fork se slučuje s upstreamem: do `combined-diff` a `DiffSectionItem` jen malé registrační zásahy.
- Limity velkých diffů (`src/renderer/src/components/editor/large-diff-render-limit.ts`) platí i tady.
- Vzhled podle `docs/STYLEGUIDE.md`; barvy druhů jen z tokenů v `src/renderer/src/assets/main.css`; texty v šesti jazycích.
- Pohled nesmí záviset na Azure DevOps: vstupem je worktree a báze.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tlačítko Change review v porovnání s bází v Source Control otevře pohled pro aktuální worktree; ve folder workspace bez gitu není a u staršího vzdáleného hostitele je vypnuté s vysvětlením
- [ ] #2 Přehled nad diffem ukazuje počet souborů, přidaných a odebraných řádků a commitů a podíl řádků podle druhu; čísla sedí s manifestem
- [ ] #3 Diff je rozdělený podle skupin manifestu; skupina ukazuje počet souborů a změněných řádků a jde sbalit
- [ ] #4 Generované soubory, čistá přejmenování a hunky jen s bílými znaky nebo importy jsou skryté; soubor ukazuje počet skrytých řádků a přepínač je zobrazí; přehled říká, kolik souborů je skrytých celých
- [ ] #5 Ze stránky pull requestu Azure DevOps vede do pohledu odkaz, když pro pull request existuje review worktree nebo vlastní workspace; pohled funguje stejně nad worktree s pull requestem GitHubu a GitLabu
- [ ] #6 Manifest označený jako oříznutý pohled ohlásí a diff zůstane použitelný; SSH worktree se chová jako lokální
- [ ] #7 Komponenty mají testy; pohled je ověřený ve skrytém okně na smyšleném repozitáři se snímkem; docs/review-ide/05-funkce.md oddíl 7 uvádí stav po tomto tiketu
<!-- AC:END -->
