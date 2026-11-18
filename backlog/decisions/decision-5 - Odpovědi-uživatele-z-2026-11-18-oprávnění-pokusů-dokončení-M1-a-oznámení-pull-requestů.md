---
id: decision-5
title: >-
  Odpovědi uživatele z 2026-11-18: oprávnění pokusů, dokončení M1 a oznámení
  pull requestů
date: '2026-11-18T22:11:00Z'
status: accepted
---
## Context

Během prvních dvou milníků se v tiketech nasbíraly otázky, které patří uživateli. Uživatel na část z nich odpověděl 2026-11-18. Otázky k rozpisu M2 (poznámky TASK-69), k výsledkům pokusů pro M3 (poznámky TASK-70) a k rozšíření tiketů pro Opus zůstávají otevřené.

## Decision

Oprávnění a úklid:

- Agent smí spustit druhou skrytou instanci nainstalované Orca Dev nad sdílenými daty uživatele, jen když nejdřív zálohuje sdílené soubory (registr review worktrees, úložiště draftů) a po skončení porovná jejich otisky.
- Zápisové části review z TASK-51 (drafty přes rozhraní a CLI, zahození změn v review worktree) se doověří spolu se zkušební publikací (TASK-68), se zálohou.
- Pracovní data pokusu se skutečnou organizací (TASK-67) jsou smazaná.
- Pull request pro zkušební publikaci je určený; jeho adresa je jen v místních instrukcích, ne v repozitáři. Publikaci provádí uživatel sám, agent do Azure DevOps nezapisuje.
- Docker pro SSH test Annotate (TASK-109) spouští uživatel. Způsob, jak získat Git 2.25, je otevřený.
- Mezipaměť závislostí SwiftPM z TASK-55, stažený language server pro Kotlin z TASK-53 a místní větev s prototypem mostu z TASK-54 zůstávají; větev do rozepsání M3.

Dokončení M1:

- Brány forku (TASK-81) se opraví teď.
- Open in na skutečných IDE (TASK-80) ověří agent; uživatel ví, že se okna IDE otevřou do popředí. Otevírání celého worktree jako projektu se zavede až po tomto ověření.

Oznámení nových pull requestů (TASK-82):

- Oznámení na telefon neodchází. Uživatel se ptal, zda by to šlo i na forku: technicky ano přes bránu provozovanou upstreamem, která by dostala název pull requestu, repozitář a autora; cesta úplně mimo upstream znamená vlastní bránu a vlastní sestavení mobilní aplikace.
- Oznámení a značka Nový jsou nezávislé na nabídce AI review.
- Akce Provést review na řádku dál otevírá stránku pull requestu.

## Consequences

- TASK-80, TASK-81 a TASK-82 přestávají čekat na uživatele. TASK-68 čeká dál: publikaci provádí uživatel a hlasování dodá až TASK-83.
- Ověření proti skutečné organizaci může dělat worker bez uživatele, pokud dodrží zálohu.
- U TASK-82 odpadá práce na mobilní aplikaci a na vyjednání nového zdroje oznámení pro telefon; zbývá vlastní přepínač, nezávislost na nabídce AI review a označení při ruční obnově.
- Otevřené zůstávají: způsob získání Gitu 2.25, deset otázek k M2, deset otázek k M3 a rozšíření tiketů pro Opus.
