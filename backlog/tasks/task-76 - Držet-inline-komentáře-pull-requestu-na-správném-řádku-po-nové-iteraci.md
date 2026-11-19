---
id: TASK-76
title: Držet inline komentáře pull requestu na správném řádku po nové iteraci
status: Done
assignee: []
created_date: '2026-11-18T13:20:00Z'
updated_date: '2026-11-19T02:05:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/01-integrace.md
priority: high
type: bug
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Azure DevOps vrací polohu vlákna vůči iteraci, na které komentář vznikl. Orca ji dnes přikládá na diff poslední iterace, takže po dalším pushi komentář ukazuje na jiný kód. Recenzent i autor musí vidět komentář u kódu, ke kterému patří.

### Rozsah

- `src/main/azure-devops/review/azure-devops-review-client.ts` (`listAzureDevOpsReviewThreads`) a `azure-devops-review-mappers.ts` (`mapAnchor`, `mapAzureDevOpsReviewThread`): poloha vlákna přepočtená na poslední iteraci.
- Zjištění z TASK-67 proti skutečné organizaci: `threadContext` nese původní řádky; `pullRequestThreadContext.iterationContext` říká, na které iteraci vlákno vzniklo. Dotaz na vlákna s `$iteration=<poslední>&$baseIteration=<původní>` vrátí `pullRequestThreadContext.trackingCriteria` (`origRightFileStart`, porovnávané iterace) a `threadContext` už bez `rightFileStart`; samotné `$iteration` polohu nezmění. Ve vzorku s deseti vlákny z první iterace mělo po čtvrté iteraci sedm z nich na původním čísle řádku jiný text.
- Nejdřív zjistit, jak polohu sleduje webové rozhraní Azure DevOps (parametry dotazu, nebo přepočet z diffu iterací), a zvolit jednu cestu. Záložní cesta bez API: přepočet řádku z rozdílu obsahu souboru mezi původní a poslední iterací.
- `src/renderer/src/components/azure-devops-review/azure-devops-review-inline-comments.ts` a mobilní obrazovka vláken: označení zastaralého vlákna.

### Mimo rozsah

- Poloha draftů: ty už nesou iteraci a značí se jako zastaralé.
- Publikace odpovědí a změna stavu vlákna.

### Omezení

- Jen čtení z Azure DevOps. Odpověď hostitele čtou i starší mobilní klienti: nová pole jen volitelná.
- Do testů a tiketu nepatří data ze skutečných pull requestů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Vlákno založené na starší iteraci se v diffu poslední iterace zobrazí u řádku, kam se komentovaný kód posunul
- [x] #2 Vlákno, jehož řádek v poslední iteraci zanikl nebo ho nejde dohledat, je označené jako zastaralé a není připnuté k nesouvisejícímu řádku
- [x] #3 Seznam vláken, CLI `orca ado pr` a MCP vracejí stejnou polohu jako diff na desktopu; starší mobilní klient dál dostane platnou odpověď
- [x] #4 Testy mapování pokrývají vlákno z první iterace u pull requestu se čtyřmi iteracemi: posunutý řádek, změněný řádek a nezměněný řádek
- [x] #5 Chování je ověřené čtením proti skutečnému pull requestu s více iteracemi ve skrytém okně
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker, 2026-11-19): 1) záloha sdílených souborů ~/.orca s otisky SHA-256, druhá skrytá instance Orca Dev s izolovaným profilem, jen GET: zjistit tvar trackingCriteria a chování $iteration/$baseIteration, ověřit sledovanou polohu proti obsahu souborů; 2) zvolit cestu (parametry dotazu, nebo přepočet z diffu iterací) a implementovat ji v novém modulu vedle mapperů, do sdílených typů jen nepovinná pole; 3) označení zastaralého vlákna v diffu na desktopu, v seznamech, CLI/MCP a na mobilu; 4) testy mapování (čtyři iterace: posunutý, změněný, nezměněný řádek), kontraktní test odpovědi, hermetické ověření ve skrytém okně s podvrženým serverem; 5) ověření implementace nad skutečným pull requestem jako vyhodnocený skript ve skryté instanci, úklid a porovnání otisků.

Zjištění ze skutečných dat (worker, 2026-11-19, 130 požadavků GET funkcí Orky ve skryté instanci, otisky 19 sdílených souborů po ukončení shodné, úloha launchd instance odebraná): $iteration samotné polohu nemění; $iteration=<poslední>&$baseIteration=0 (nebo =<poslední>) vrací sledovanou polohu na pravé straně a trackingCriteria {firstComparingIteration, secondComparingIteration, origFilePath, origRightFileStart, origRightFileEnd}; $baseIteration=<původní> přesune vlákno na levou stranu. Sledování serveru ale nestačí: ze 30 souborových vláken starších iterací ve třech pull requestech vrátil server posun jen u 4, u dalších 7 se řádek prokazatelně posunul (jediný výskyt textu jinde) a poloha zůstala původní; vlákna s iterationContext 1-N (zakládá je Orca) nesleduje vůbec; řádek upravený na místě vrací beze změny a bez trackingCriteria, takže nejde odlišit od nezměněného; zaniklý řádek sbalí na sousední řádek. Zvolená cesta: vlastní přepočet z obsahu souboru v původní a poslední iteraci.

Hotovo (1/4, hlavní proces): přepočet polohy v novém modulu azure-devops-review-thread-tracking.ts (plán a aplikace), azure-devops-review-line-tracking.ts (řádky přes diff) a azure-devops-review-file-line-cache.ts (obsah souboru v commitu, paměťová cache, strop 80 požadavků na načtení); zapojeno v getAzureDevOpsReviewDetail; sdílený typ vlákna má nepovinná pole iterationId, outdated, originalAnchor; CLI, MCP popis a prompt pro nálezy; testy mapování, služby (tvar pro staršího klienta, shoda s CLI) a cache. Zbývá: desktop (inline komentáře, seznam vláken, komentáře souboru, lokalizace), mobil, hermetické ověření ve skrytém okně, ověření implementace proti skutečnému pull requestu, brány.

Hotovo (2/4): desktop (inline komentář nese stav „Outdated“, seznam vláken má štítek a původní řádek, seznam komentářů souboru přeškrtne zaniklý řádek), mobil (popisky vláken v seznamu, v diffu a u souboru), lokalizace tří klíčů v šesti jazycích, testy rendereru a mobilu, e2e tests/e2e/pull-request-thread-tracking.spec.ts ve skrytém okně s podvrženým serverem (helper umí víc iterací a vlákna); snímky v ~/.cache/orca-review-ide/task-76/screenshots. Zbývá: ověření implementace proti skutečnému pull requestu ve skryté instanci, brány, dokumentace.

Hotovo (3/4), ověření proti skutečným pull requestům (2026-11-19): kód tohoto tiketu (getAzureDevOpsReviewDetail s mappery, sledováním a cache; požadavky šly funkcí Orky, jen GET) běžel jako vyhodnocený skript v hlavním procesu druhé skryté instance Orca Dev. Tři pull requesty s 5 až 7 iteracemi a 30 souborovými vlákny ze starších iterací (konečný kód): 5 beze změny, 7 posunutých, 11 zastaralých s polohou na nahrazujícím řádku, 7 zastaralých bez řádku (z toho 3 mají smazaný soubor); u všech 12 nezastaralých je text řádku v poslední iteraci shodný s textem v původní iteraci, žádné zastaralé vlákno nemá na nové poloze původní text; výpis CLI nese stejné řádky u 23 z 23 vláken s polohou; tvar odpovědi platný pro staršího klienta u všech 31 vláken; první načtení 14 až 27 požadavků, opakované 4 a žádný na obsah souborů. Další čtyři pull requesty (5 vláken) prošly stejnou kontrolou se sestavením před doplněním dohledání přesunutého kódu. Server sledoval 4 z těchto vláken, ve 2 se shoduje; 6 posunů, které server nevrátil, kód dohledal. Neověřeno na skutečných datech: vykreslení v rendereru (nainstalovaná Orca Dev změnu neobsahuje; ověřeno hermeticky e2e), vlákna na staré straně diffu a přejmenovaný soubor (ve vzorku nejsou). Úklid: instance ukončená, její úloha launchd odebraná (cesta profilu task-76), otisky 19 sdílených souborů před a po obou bězích shodné, kopie zálohy, surová data a profil smazané.

Hotovo (4/4, worker 2026-11-19, čeká na ověření koordinátorem): doplněno dohledání kódu přesunutého přes jiný kód (jediný shodný výskyt v obou verzích), dokumentace 05-funkce.md (pravidla Code review). Brány: pnpm tc, oxlint změněných souborů, check:code-quality:changed, 294 souvisejících testů desktopu, lokalizační testy, mobil (typecheck, lint, 21 testů), e2e tři specy s podvrženým serverem ve skrytém okně prochází; ratchety hlásí jen cizí soubory. Kritérium 5 je splněné během kódu tiketu ve skryté instanci nad skutečnými pull requesty; vykreslení skutečných dat v rendereru ověřené není (nainstalované sestavení změnu neobsahuje), rozhraní je ověřené jen na smyšleném pull requestu. Vědomá rozhodnutí: přepsaný řádek = zastaralé vlákno u nahrazujícího řádku, zaniklý řádek nebo soubor = zastaralé vlákno bez řádku; při nedostupném obsahu souboru je vlákno zastaralé bez řádku; první načtení detailu čte obsah souborů (ve vzorku 14 až 27 požadavků), další načtení ho bere z paměti.

Otázka pro uživatele (2026-11-19): má vlákno na přepsaném řádku zůstat v diffu u nahrazujícího řádku se štítkem Outdated (současný stav, doporučeno, jako ve webu Azure DevOps), nebo z diffu zmizet a být jen v seznamech jako zastaralé drafty?
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Inline komentáře pull requestu Azure DevOps se po dalším pushi zobrazují u řádku, kam se komentovaný kód posunul. Vlákno, jehož řádek byl přepsán, zůstává u nahrazujícího řádku se štítkem Outdated; vlákno, jehož řádky zanikly nebo je nejde dohledat, je zastaralé bez řádku a nese původní polohu. Hostitel polohu přepočítává sám porovnáním obsahu souboru v původní a poslední iteraci, protože sledování na straně serveru se na skutečných datech ukázalo jako nespolehlivé (posun vrátilo u 4 vláken, prokazatelně se posunulo dalších 7). Stejnou polohu dostává desktop, mobil, CLI i MCP z jedné odpovědi; vlákno má tři nová nepovinná pole a starší klient dostane platnou odpověď. Ověřeno testy mapování nad pull requestem se čtyřmi iteracemi, e2e ve skrytém okně nad smyšlenými daty a během kódu tiketu nad třemi skutečnými pull requesty (30 vláken ze starších iterací: u všech 12 nezastaralých sedí text řádku s původním) v druhé skryté instanci, jen čtením; otisky 19 sdílených souborů jsou po běhu shodné. Neověřeno: vykreslení skutečných dat v rozhraní, vlákna na staré straně diffu a přejmenovaný soubor na skutečných datech. Známá omezení: první otevření detailu čte obsah souborů (14 až 27 požadavků, strop 80), přechodná chyba sítě může vlákno dočasně označit jako zastaralé, u silně přepsaných souborů může vlákno skončit bez řádku.
<!-- SECTION:FINAL_SUMMARY:END -->
