---
id: TASK-91
title: 'Change review: identita hunku, jádro manifestu změn a strojově rozpoznaný šum'
status: To Do
assignee: []
created_date: '2026-11-18T15:18:00Z'
updated_date: '2026-11-19T11:41:00Z'
labels:
  - review-ide
  - effort-xhigh
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
  - docs/review-ide/01-integrace.md
priority: high
type: feature
ordinal: 211000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Diff po celcích, stav revize po částech a ověřování tvrzení AI potřebují společný popis změny: seznam hunků s identitou, která přežije push a rebase, a strojové oddělení šumu od kódu, který je potřeba číst. Tento tiket dodá jádro manifestu bez AI, bez rozhraní a bez protokolu; ověřuje se testy nad smyšlenými repozitáři. RPC a CLI přidá TASK-124.

Spojuje návrh z TASK-52 (revize změn s ověřenými tvrzeními) s Diffem po celcích z dokumentace do jednoho řešení.

### Rozsah

- Převzatá rozhodnutí z TASK-52: interní název `change-review` (adresáře, RPC `changeReview.*`, CLI `orca change-review`); nic se nezapisuje do repozitáře ani do gitu (žádné trailery, notes ani konfigurace v repozitáři); nastavení žije v Orce; jádro je deterministické a AI do něj nezasahuje.
- `src/shared/change-review-types.ts`: manifest s verzí schématu, rozsahem (báze, merge base, head, větev), soubory, hunky, skupinami a statistikami.
- Hunk je blok z `git diff -U0`. Otisk obsahu se počítá z odebraných a přidaných řádků po normalizaci konců řádků a koncových mezer, bez čísel řádků a bez kontextu. Klíč hunku je cesta, otisk a pořadí stejného otisku v souboru; identifikátor je krátký otisk klíče.
- Druh hunku: `generated` (cesty podle `src/shared/generated-code-path.ts` a atribut `linguist-generated` přes `git check-attr`), `rename-only`, `whitespace`, `imports`, jinak `semantic`. Druh nese úroveň důvěry `verified`; hodnoty `claimed` a `contradicted` jsou vyhrazené pro tvrzení AI v navazujících tiketech.
- Skupiny bez AI: kořen modulu (nejbližší předek se souborem sestavení, například `build.gradle(.kts)`, `Package.swift`, `*.csproj`, `package.json`) a dělení na kód a testy (`src/shared/test-code-path.ts`).
- `src/main/change-review/`: sběr hunků, identita, klasifikace, skupiny, sestavení manifestu se stabilním řazením, keš podle repozitáře, merge base, head, verze schématu a otisku nastavení. Merge base a porovnávaný ref dávají `resolveMergeBase` a `resolveCompareRef` v `src/main/git/source-control/compare-ref-oids.ts`; seznam změn `src/shared/git-change-list.ts`.
- Text hunků se do manifestu neukládá; rozhraní ho čte stávajícím diffem.

### Mimo rozsah

- RPC `changeReview.getManifest`, most v preloadu, CLI `orca change-review manifest` a kontraktní test: TASK-124.
- Rozhraní pohledu, detekce přesunů, stav revize, celky od AI a riziková pravidla: navazující tikety.
- Původ řádků a důvod u hunku (M7), pokrytí testy a projekce (M4, M5).
- Python prototyp z TASK-52 se nepřebírá.

### Omezení

- Stejný vstup a stejná verze analyzátorů dají bajtově stejný manifest.
- Git běží na hostiteli, který worktree vlastní, nikdy lokálně za vzdálený worktree.
- Git 2.25 je základ; ověř, kdy vznikl každý použitý příkaz a přepínač, a pro novější chování použij `GitCapabilityCache` (`src/main/git/git-capability-state.ts`) s úzkým predikátem. `-C` a `--find-copies-harder` nepoužívej.
- Git Scan Safety z AGENTS.md: žádné procházení všech refů, jen pojmenovaný commit, ohraničený výstup, nízká priorita a možnost zrušení.
- Nic v tomto tiketu nesmí záviset na poskytovateli pull requestů.
- Testovací repozitář je smyšlený.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Posun hunku v souboru, změna sousedního řádku ani rebase na novou bázi nemění klíč hunku; dva stejné hunky v jednom souboru mají různé klíče
- [ ] #2 Generovaný soubor, soubor s atributem linguist-generated, čisté přejmenování, změna jen bílých znaků a změna jen importů dostanou svůj druh; všechno ostatní je semantic
- [ ] #3 Sběr zvládá přidání, úpravu, smazání, přejmenování, binární soubory a cesty s mezerami a znaky mimo ASCII
- [ ] #4 Sběr volá git hostitele, který worktree vlastní (lokální, WSL, SSH), nikdy lokální git za vzdálený worktree; folder workspace bez gitu dostane výsledek nepodporováno, ne chybu
- [ ] #5 Druhé sestavení pro stejný rozsah jde z keše; nad stropem velikosti je manifest označený jako oříznutý a neselže
- [ ] #6 Použité příkazy a přepínače gitu fungují s Git 2.25; pro každý mladší je záložní cesta a hranice verze v kontraktu kompatibility v CI
- [ ] #7 Záznam rozhodnutí popisuje schéma manifestu, klíč hunku, úrovně důvěry a úložiště a říká, co z TASK-52 převzal a co ne; docs/review-ide/05-funkce.md oddíl 7 na něj odkazuje
- [ ] #8 Parser, identita, klasifikace a sestavení manifestu mají jednotkové testy; test proti skutečnému gitu na smyšleném repozitáři ověří soubory, hunky s identifikátorem, druhem a skupinou, počty řádků podle druhu a bajtově stejný výsledek dvou sestavení
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rozděleno 2026-11-19 podle pravidla velikosti: TASK-124 převzal RPC changeReview.getManifest, most v preloadu, CLI orca change-review manifest a kontraktní test.

Odpověď uživatele 2026-11-19 (decision-12): až tento tiket zapíše záznam rozhodnutí, archivovat TASK-52 (backlog task archive 52).
<!-- SECTION:NOTES:END -->
