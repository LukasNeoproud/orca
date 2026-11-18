---
id: TASK-57
title: 'Pokus: agenti ve složce se symbolickými odkazy na worktrees'
status: Done
assignee: []
created_date: '2026-11-18T12:42:00Z'
updated_date: '2026-11-18T23:44:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-0
dependencies: []
documentation:
  - docs/review-ide/04-projekty-a-funkce.md
  - docs/review-ide/README.md
priority: medium
type: spike
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Rozhodnout, jak agent uvidí vlastní platformu i reference ostatních platforem v jedné Funkci: přes složku se symbolickými odkazy (`android/`, `ios/`, `api/`), nebo přes seznam cest předaný v kontextu.

### Postup

- Vytvoř mimo repozitář tři malé smyšlené git repozitáře, ke každému worktree, a složku s odkazy na ně. Firemní kód není potřeba.
- V té složce spusť agenty s krátkým zadáním: přečíst soubor v jednom odkazu, upravit soubor v druhém, najít řetězec napříč všemi, zjistit stav gitu. Zadání drž krátká, běží na předplatném uživatele.
- Zápisy sleduj i přes hooky Orky: výchozí bod `src/shared/agent-hook-listener` a `src/main/agent-hooks`.
- Variantu se seznamem cest vyzkoušej přes přidané adresáře agenta (u Claude Code `--add-dir`).

### Mimo rozsah

- Implementace Funkcí a referencí.

### Omezení

- Pravidlo z AGENTS.md o obrazovkách agentů: co agent vypsal, dokládej zachyceným přepisem, ne zpaměti.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Záznam rozhodnutí uvádí pro Claude Code a Codex, zda přes symbolický odkaz funguje čtení a úprava souborů, hledání, git status a commit ve správném repozitáři
- [x] #2 Záznam uvádí, jakou cestu hlásí hooky agenta při zápisu přes odkaz a zda Orca zápis přiřadí správnému worktree
- [x] #3 Záznam porovnává variantu se složkou odkazů s variantou, kdy agent dostane seznam cest referencí, včetně chování na Windows
- [x] #4 Záznam končí volbou varianty pro Funkce a seznamem úprav, které Orca kvůli ní potřebuje
- [x] #5 Otevřená otázka v docs/review-ide/README.md je odškrtnutá s odkazem na záznam
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (2026-11-19): 1) smyšlené repozitáře android/ios/api s worktrees a složkou odkazů v ~/.cache/orca-review-ide/task-57; 2) Claude Code -p, model haiku, nejvýš 15 běhů, bez uživatelských nastavení, MCP a proměnných ORCA_*: čtení, úprava, hledání, git status a commit přes odkaz, oprávnění, CLAUDE.md a nastavení; 3) vlastní hook v nastavení pokusu zachytí payload PreToolUse/PostToolUse, k tomu čtení kódu Orky, podle čeho hook přiřazuje worktree; 4) varianta --add-dir z worktree vlastní platformy; 5) Codex jen podle dokumentace, nespouštět; 6) záznam rozhodnutí proposed a odškrtnutí otázky v README.

Průběh: pokus připraven v ~/.cache/orca-review-ide/task-57 (scripts/setup-git.sh, run.sh, show-run.py; přepisy v runs/, payloady hooků v logs/). Hotovo 6 běhů Claude Code 2.1.327 ve složce odkazů: čtení přes odkaz bez přidaného adresáře zamítnuto (cíl mimo pracovní adresáře), pravidlo na cestu odkazu nepomůže; s --add-dir skutečných cest čtení, úprava i commit fungují; Grep a Glob bez cesty odkazy neprocházejí; hook hlásí cestu přes odkaz; deny pravidla chrání reference v obou zápisech cesty. Zbývá: cwd přímo v odkazu, varianta --add-dir z worktree vlastní platformy, Codex z dokumentace, záznam rozhodnutí, README.

Hotovo (2026-11-19): 13 běhů Claude Code 2.1.327 (-p, model haiku, cena podle výpisu 0,023 USD), Codex nespuštěn a posouzen jen podle dokumentace. Záznam: decision-7 (proposed), návrh varianta 2: agent ve worktree vlastní platformy, reference jako přidané adresáře se skutečnými cestami, seznam v kontextu a zákaz úprav; složku odkazů nevytvářet. Dokumentace: README (otázka odškrtnutá), 04-projekty-a-funkce.md (odstavec s návrhem u oddílu Agenti). Podklady mimo repozitář: ~/.cache/orca-review-ide/task-57 (scripts/REPRODUCE.txt, runs/, logs/). V ~/.claude/projects přibyly tři složky pokusu (13 přepisů), ~/.claude/settings.json beze změny, v ~/.claude.json žádný nový projekt, po bězích nezůstal proces. Nezkoušeno: interaktivní relace, Codex během, Windows, WSL, SSH. Pro TASK-74: seznam úprav Orky je v oddílu Consequences záznamu; otevřené zůstává, jestli blokovat přepnutí reference relacím, které ji mají přidanou.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pokus s Claude Code 2.1.327 (13 krátkých běhů na levném modelu nad smyšlenými repozitáři) ukázal, že složka se symbolickými odkazy jako pracovní adresář agenta nic neušetří: čtení přes odkaz je bez přidání skutečné cesty zamítnuto, hledání bez cesty odkazy neprochází, po cd přes odkaz přestanou platit relativní jména, složka není repozitář a Orca by zápisy, relace i spotřebu připsala složce místo worktree platformy. S přidanými skutečnými cestami fungují čtení, úprava i commit do správného repozitáře a zakazující pravidlo na cestu reference zastaví i úpravu přes shell. Návrh v decision-7 (proposed): agent běží ve worktree vlastní platformy, reference dostane jako přidané adresáře se skutečnými cestami, jako seznam cest v kontextu a se zákazem úprav; složku odkazů Orca nevytváří. Codex nebyl spuštěn a je posouzen jen podle dokumentace; Windows, WSL, SSH a interaktivní relace nezkoušeny. V ~/.claude/projects přibyly tři složky pokusu s přepisy běhů, nastavení uživatele se nezměnilo.
<!-- SECTION:FINAL_SUMMARY:END -->
