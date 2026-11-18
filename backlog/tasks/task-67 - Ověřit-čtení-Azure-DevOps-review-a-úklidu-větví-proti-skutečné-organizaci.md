---
id: TASK-67
title: Ověřit čtení Azure DevOps review a úklidu větví proti skutečné organizaci
status: Done
assignee: []
created_date: '2026-11-18T12:43:00Z'
updated_date: '2026-11-18T13:22:00Z'
labels:
  - review-ide
  - effort-medium
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/01-integrace.md
priority: high
type: task
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Review z TASK-51 a dohledání dokončených pull requestů pro úklid větví jsou ověřené jen testy. Než na nich začne stavět M2, musí být vidět, že čtení funguje proti skutečné organizaci. Zkušební publikaci řeší navazující tiket.

### Postup

- Jen čtením: projdi v Orca Dev seznam, detail, vlákna, diff a review worktree na existujícím pull requestu a dotaz v `src/main/azure-devops/completed-pull-request-heads.ts`.
- Orca Dev ovládej ve skrytém okně podle AGENTS.md; okno uživatele neber.

### Mimo rozsah

- Publikace draftů, odpovědí a hlasů.

### Omezení

- Do tiketu, kódu ani dokumentace nepiš názvy organizací, repozitářů, čísla ani texty pull requestů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Každé akceptační kritérium TASK-51, které jde ověřit čtením, má stav ověřeno, selhalo nebo neověřeno s důvodem
- [x] #2 Seznam, detail, vlákna, diff souboru a review worktree jsou ověřené proti skutečnému pull requestu
- [x] #3 Dohledání dokončených pull requestů pro úklid sloučených větví je ověřené proti skutečnému repozitáři
- [x] #4 Každá nalezená chyba je opravená v tomto tiketu, nebo má vlastní tiket
- [x] #5 Agent do Azure DevOps nic nezapsal
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker): 1) čtení přes `orca-dev ado prs|pr` proti běžící Orca Dev (stejný kód azure-devops jako HEAD), kontrola invariantů a porovnání s lokálním gitem jen pro čtení; 2) rozhraní ve druhé, skryté instanci Orca Dev s izolovaným profilem (ORCA_DEV_USER_DATA_PATH, ORCA_BACKGROUND_LAUNCH=1, CDP) nad kopií repozitáře mimo checkout: seznam, detail, vlákna, diff souboru, review worktree, úklid větví; 3) nálezy opravit nebo založit tikety; 4) výsledky po kritériích TASK-51 do poznámek. Pracovní data jen v ~/.cache/orca-review-ide/task-67.

Výsledek ověření (worker, 2026-11-18). Sestavení Orca Dev má stejný kód azure-devops jako HEAD. Čteno přes `orca-dev ado` proti běžící aplikaci a ve druhé, skryté instanci s izolovaným profilem nad kopiemi dvou repozitářů mimo checkout. Do Azure DevOps šly jen dotazy GET a git fetch. Pracovní data a snímky: `~/.cache/orca-review-ide/task-67` (obsahují skutečná data, nepatří do repozitáře).

Rozsah vzorku: 5 repozitářů ve 2 organizacích, seznamy ve všech stavech (stovky pull requestů), 22 detailů porovnaných s lokálním gitem.

Kritéria TASK-51:
1. Připojení v Nastavení: neověřeno v rozhraní (krok ve skrytém okně zablokoval otevřený dialog). Nepřímo ověřeno: uložená připojení dvou organizací se dešifrují i ve druhé instanci a seznam se načte bez chyb. Detekce organizací bez tokenu: neověřeno.
2. Tab Pull requests, sloučený seznam a filtry s výchozím Active: ověřeno. Selhalo: filtr Vše vynechal starý aktivní pull request a oříznutí na 100 na repozitář se nehlásí (TASK-77). Seznam se po přidání projektu neobnovil sám (TASK-78, k potvrzení).
3. Detail: přehled, vlákna, drafty a soubory ověřeny; seznam změn a merge base sedí s gitem u 21 z 22 detailů (jeden neměl commit lokálně). Selhalo: smazané soubory v seznamu změn chyběly (opraveno zde). Selhalo: poloha vláken ze starší iterace neodpovídá poslední iteraci (TASK-76). Otevření v prohlížeči: neověřeno, otevřelo by okno uživateli.
4. Review worktree: ověřeno na dokončeném pull requestu cizího autora (detached HEAD na commitu pull requestu, baseRef na cílovém commitu, diff proti cíli shodný se seznamem změn, pomocná větev smazaná) a jen čtením na stávajících review worktrees uživatele včetně aktivního pull requestu. Server dovolí fetch commitu podle hashe. Proti textu TASK-51 je worktree na pull request, ne jeden na repozitář, a vlastní pull request se otevře ve worktree na větvi; kód to dělá záměrně. Zahození rozpracovaných změn a blokace běžícím agentem: neověřeno.
5. Drafty: ověřeno jen čtení a počty. Vytvoření, úprava, mazání a označení outdated: neověřeno, zapisovalo by do úložiště draftů uživatele. Publikace je mimo rozsah (TASK-68).
6. CLI a MCP: čtení ověřeno (`prs`, `pr`); MCP server nabízí jen čtení a správu draftů, žádnou publikaci. Zápis draftů přes CLI: neověřeno ze stejného důvodu jako bod 5.
7. Android: neověřeno, potřebuje spárované zařízení.

Úklid větví: dotaz z `completed-pull-request-heads.ts` server přijímá a vrací commit zdroje u všech položek; hlavy šesti lokálních větví kopie se shodují s dokončenými pull requesty a dialog úklidu je nabídl. Rozhodující případ (squash, kdy git sloučení nedokáže) se v ověřovaném repozitáři nevyskytuje, všechny nabídnuté větve jsou i předky cíle. Dotaz bere jen 500 nejnovějších (TASK-77).

Oprava v tomto tiketu: `mapAzureDevOpsReviewChange` bere cestu smazaného souboru z `originalPath`; test přidán.

Poznámka k postupu: druhá instance sdílí `~/.orca`; při otevření review worktree vyřadila ze sdíleného registru záznamy stejného repozitáře, registr je obnoven ze zálohy a kontrolní součty sdílených souborů sedí se stavem před během. Testovací worktrees a démon druhé instance jsou odstraněné.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Čtení review a dohledání dokončených pull requestů ověřeno proti skutečné organizaci (5 repozitářů ve 2 organizacích, 22 detailů porovnaných s lokálním gitem), do Azure DevOps šly jen dotazy GET a git fetch. Opraveno: smazané soubory chyběly v seznamu změn pull requestu (cesta se bere z originalPath). Navazující chyby: TASK-76 (poloha vláken po nové iteraci), TASK-77 (stránkování seznamu a dohledání dokončených), TASK-78 (prázdné odebrané řádky v diffu, obnova seznamu). Neověřeno: review worktree otevřený na aktivním cizím pull requestu, squash případ úklidu větví (ve vzorku se nevyskytl), zápisové části TASK-51 (drafty, zahození změn), připojení v Nastavení a Android.
<!-- SECTION:FINAL_SUMMARY:END -->
