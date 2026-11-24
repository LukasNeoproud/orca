---
id: decision-17
title: >-
  Tok práce: jednotky skládá hostitel, který repozitář vede, a spojuje je
  aplikace, u které uživatel sedí
date: '2026-11-24T10:10:00Z'
status: accepted
---
## Context

Tok práce ([10-tok-prace.md](../../docs/review-ide/10-tok-prace.md), decision-16) skládá fakta z gitu, od poskytovatele pull requestů, z Jiry a z tagů do jednotek práce s fází a lhůtou. TASK-166 má určit model, na kterém stojí zbytek milníku M9, a rozhodnout, kde se jednotky skládají, když repozitáře vedou různí hostitelé.

Co platí v kódu dnes (čtením kódu na `review-ide`, 2026-11-24):

- **Git:** proces desktopové aplikace spouští git jen pro repozitáře na tomto počítači a ve WSL. Hostitele `ssh:<target>` neobsluhuje (`SshHostNotServedError`); stroj dosažený přes SSH vede jeho vlastní Orca (`orcad`) a klient ho vidí jako `runtime:<env>` (`src/main/providers/execution-host-provider-dispatch.ts`).
- **Seznam repozitářů a worktrees jiného hostitele** existuje jen v paměti okna (`repo.list`, `worktree.list`). Hlavní proces ho nemá a `listRepoWorktrees` pro `runtime` i `ssh` končí chybou.
- **Hlavní proces umí volat jiného hostitele:** `callRuntimeEnvironment`, `subscribeRuntimeEnvironment` a `listEnvironments` (`src/main/ipc/runtime-environment-transport-routing.ts`, `src/shared/runtime-environment-store.ts`).
- **Kdo co vlastní** (`src/shared/host-operation-ownership.ts`): git patří hostiteli repozitáře (`host`); poskytovatel pull requestů se volá s přihlášením hostitele, který repozitář vede (`credential`); Jira běží na hostiteli, kterého uživatel vybral (`scope-picked`).
- **Pull requesty:** seznam Azure DevOps nenese reviewery, čas poslední verze, nevyřešená vlákna ani commit sloučení a na pozadí ho obnovuje jen okno se zapnutým automatickým review. `HostedReviewInfo` nese rozhodnutí review jen u GitHubu a commit ani čas sloučení u nikoho.
- **Jira:** dávkové čtení podle klíčů není; připojená položka workspace nese klíč a adresu, označení webu Jiry jen někdy (v `taskSourceContext`).
- **Tagy:** Orca žádné tagy nečte a několik jejích fetchů běží s `--no-tags`.
- **Oznámení nového pull requestu** posílá okno a zdvojení brání záznam v jeho `localStorage`.

## Findings

### Model (`src/shared/work-flow/`)

Čistý kód bez `node:` importů, s testy vedle.

| Soubor | Co určuje |
| --- | --- |
| `work-fact.ts` | fakt je známý (s časem čtení), nebo neznámý s důvodem a s poslední známou hodnotou jen pro zobrazení |
| `work-unit-facts.ts` | fakta o větvi, pull requestu, review, vydání a tiketu |
| `work-phase.ts` | fáze z faktů |
| `working-day-deadline.ts`, `work-stall.ts` | lhůta v pracovních dnech a váznutí |
| `work-flow-settings.ts` | lhůty a vypínače oznámení (nastavení aplikace, pole `workFlow`) |
| `release-tag-patterns.ts` | vzory tagů (řádek repozitáře, pole `workFlowReleaseTags`) |
| `work-ticket-key.ts` | klíč tiketu z připojené položky, jména větve a názvu pull requestu |
| `hosted-review-work-facts.ts`, `work-review-verdict.ts` | fakta o pull requestu z `HostedReviewInfo`; výsledek hlasů reviewerů |
| `work-unit.ts` | jednotka práce, její označení a jednotka hostitele bez spojení |

**Neznámý fakt.** Důvody: `not-loaded`, `host-unreachable`, `host-unsupported`, `not-connected`, `source-failed`, `not-provided`, `not-found`, `not-permitted`, `no-matching-tags`, `tags-stale`. Důvod, který sestavení nezná, čte jako `source-failed`.

**Fáze.** Šest fází z tabulky v dokumentaci a dvě, které tabulka nepokrývá:

| Stav | Fáze | Lhůta běží od |
| --- | --- | --- |
| větev s vlastními commity, žádný pull request nebo jen zrušený | `no-pull-request` | posledního commitu |
| pull request je koncept | `draft` | bez lhůty |
| otevřený; reviewer hlasoval „čeká na autora“ nebo zamítl, nebo jsou nevyřešená vlákna od jiných, a autor od té doby neposlal verzi | `changes-requested` | poslední připomínky |
| otevřený, schválený, opravy nečekají | `approved` | bez lhůty |
| otevřený, jinak | `waiting-for-review` | poslední verze, nebo pozdější vyřešené připomínky |
| sloučený, ostrý vzor vypnutý | `merged` | bez lhůty, konec |
| sloučený, commit sloučení v žádném ostrém tagu | `merged-unreleased` | sloučení |
| sloučený, commit sloučení v ostrém tagu | `released` | bez lhůty, konec |

- **Pořadí pravidel:** nevyřešená vlákna mají přednost před schválením. Když autor po připomínce pošle novou verzi, je na tahu reviewer; platné schválení přitom zůstává schválením.
- **Schváleno z hlasů** znamená aspoň jeden souhlas, žádný blokující hlas a souhlas každého povinného reviewera.
- **Není jednotka práce:** větev bez vlastních commitů a bez pull requestu, pull request jiného autora, zrušený pull request bez větve s commity.
- **Neznámá fáze** s důvodem a s označením chybějícího faktu (`branch`, `pull-request`, `review`, `merge-commit`, `release`). Neznámý pull request nikdy nedá „bez pull requestu“, neznámé review nedá „čeká na review“ a neznámé nebo zastaralé tagy nedají „nevydáno“.
- **Začátek fáze, který poskytovatel nedá,** se bere jako poslední aktivita pull requestu a je označený jako nepřesný. Je to nejpozdější možný začátek, takže „vázne“ platí vždy; „ve lhůtě“ je v tom případě jen to nejlepší, co data dovolí.

**Lhůta.** N pracovních dní znamená stejný čas dne o N pracovních dní později; sobota a neděle se přeskakují a začátek o víkendu se počítá od pondělní půlnoci. Víkend se určuje podle hodin uživatele, ne podle UTC. Váznutí je `stalled`, `within`, `none` (fáze bez lhůty) nebo `unknown` (neznámá fáze nebo její začátek).

**Klíč tiketu.** Připojený tiket workspace, jinak jméno větve, jinak název pull requestu. Bez seznamu projektů se bere jen klíč velkými písmeny, aby `utf-8` ve jméně větve nebyl tiket. Se seznamem projektů se berou jen jejich klíče, v libovolné velikosti písmen. Holé číslo na začátku poslední části jména větve (`feature/123-nazev`) se čte jen tehdy, když volající dodá projekt, ke kterému patří.

**Nastavení.**

- Lhůty 1, 2, 1 a 3 pracovní dny, celá čísla 1 až 60; oznámení zapnutá pro všechny čtyři fáze a vypíná je jen výslovné `false`. Neplatná hodnota se čte jako výchozí.
- Vzory tagů: ostrý `v*`, dev `v*-dev`. `*` je libovolný úsek, `?` jeden znak. Tag, kterému odpovídají oba vzory, je dev build. `null` nebo prázdný text stupeň vypíná. Zápis odmítne mezery, řídicí znaky, znaky `~ ^ : \ [ ]`, vzor delší než 100 znaků a vzor začínající pomlčkou; neplatný uložený vzor se čte jako výchozí.
- Obě pole jsou v typech `GlobalSettings` a `Repo` jen deklarovaná. Ukládání a zápis staví TASK-169 (vzory) a TASK-173 s TASK-175 (lhůty a oznámení).

### Zvažované varianty skládání

| Varianta | Proč ne |
| --- | --- |
| Všechno skládá aplikace uživatele, vzdálený hostitel dává jen fakta z gitu | Hlavní proces nemá seznam worktrees cizího hostitele a pull requesty repozitáře, který vede jiná Orca, se podle pravidla `credential` čtou jejím přihlášením. |
| Skládá okno | Oznámení musí přijít i bez okna a dvě okna by ho zdvojila. |
| Váznutí počítá jen hostitel repozitáře | Lhůty a hodiny vzdáleného stroje nejsou lhůty a hodiny uživatele. |

## Decision

**Jednotky práce skládá hostitel, který repozitář vede. Aplikace, u které uživatel sedí, seznamy hostitelů spojí, doplní tikety a přepočítá váznutí.**

### Kdo co dělá

| Krok | Kdo | Jak |
| --- | --- | --- |
| Fakta o větvi a tagy | hostitel repozitáře | git ve vlastním procesu |
| Fakta o pull requestu | hostitel repozitáře | vlastním přihlášením k poskytovateli |
| Klíč tiketu | hostitel repozitáře | má připojené položky workspace |
| Tiket z Jiry | hostitel, který má Jiru připojenou; jinak aplikace uživatele | dávkou podle klíčů |
| Fáze | hostitel repozitáře | sdílený modul |
| Spojení seznamů, váznutí, oznámení | hlavní proces aplikace, u které uživatel sedí | vlastní nastavení a hodiny |

Aplikace uživatele při spojování:

1. vezme své jednotky a od každého uloženého hostitele se schopností `work-flow.v1` jeho seznam,
2. u převzatých jednotek přepíše hostitele na to, jak ho sama adresuje (`runtime:<env>`),
3. sloučí jednotky se stejným označením (klíč repozitáře, větev, číslo pull requestu) a nechá tu s workspace,
4. tiket s důvodem `not-connected` přečte ze své Jiry,
5. váznutí přepočítá svými lhůtami (`restallWorkUnit`).

### Metody a schopnosti

Všechny jsou jen pro čtení, s oprávněním `workspace`, a nejsou v seznamu metod pro telefony. Jmenný prostor `workFlow` se zapíše do `HOST_OPERATION_OWNERSHIP` jako `host`.

| Metoda | Schopnost | Tiket | Co dělá |
| --- | --- | --- | --- |
| `workFlow.branchFacts` | `work-flow.branch-facts.v1` | TASK-168 | fakta o větvi pro zadané workspaces hostitele |
| `workFlow.releaseFacts` | `work-flow.release-tags.v1` | TASK-169 | pro zadané commity repozitáře stav ostrého a dev stupně |
| `workFlow.releaseTags` | `work-flow.release-tags.v1` | TASK-169 | poslední tagy odpovídající vzorům, pro zkoušku v nastavení |
| `repo.update` s polem `workFlowReleaseTags` | `work-flow.release-tags.v1` | TASK-169 | zápis vzorů cestou ostatních nastavení repozitáře |
| `workFlow.list` | `work-flow.v1` | TASK-171 | jednotky práce; `scope: 'host'` (výchozí) jen vlastní repozitáře, `scope: 'all'` i převzaté od dalších hostitelů |
| `workFlow.subscribe`, `workFlow.unsubscribe` | `work-flow.v1` | TASK-171 | proud bez stavu (`ready`, `changed`, `end`) jako `qualityGates.subscribe` |

- **Okno i spárovaný klient** čtou `workFlow.list` se `scope: 'all'` u svého hostitele.
- **Spojující hostitel** volá ostatní vždy se `scope: 'host'`, takže se seznamy neřetězí ani nezacyklí.
- **Odpověď `workFlow.list`** nese jednotky, čas složení a u každého hostitele stav (`answered`, `unreachable`, `unsupported`, `not-served`).
- **Fakta o pull requestech** nemají vlastní metodu: `azureDevOpsReview.list` dostane nepovinná pole (TASK-167). Chybějící pole znamená neznámé, ne prázdné.
- **Jira** nemá novou metodu: hostitel čte tikety ve svém procesu stávajícím klientem.
- **Metody faktů** používá skladatel hostitele ve vlastním procesu. Jako metody runtime existují proto, aby šly ověřit proti vzdálenému hostiteli dřív, než existuje skládání, a `workFlow.releaseTags` potřebuje nastavení.

### Jak často se fakta obnovují

| Zdroj | Obnova | Strop |
| --- | --- | --- |
| Větev (git) | při každém skládání, jen když se pohnul commit větve nebo základu | jeden omezený dotaz na workspace |
| Pull requesty Azure DevOps | každých 15 minut v hlavním procesu hostitele, bez ohledu na automatické review | podrobnosti jen u otevřených pull requestů uživatele, které se změnily; 30 požadavků na kolo, zbytek příště |
| Ostatní poskytovatelé | stávající `hosted-review-branch-cache` (60 s aktivní workspace, 15 minut ostatní) | žádné nové dotazy |
| Jira | nalezený tiket 15 minut, nenalezený nebo nepřístupný 6 hodin | jeden dotaz na web Jiry a kolo, nejvýš 100 klíčů |
| Tagy | při skládání, jen pro sloučené jednotky, které ještě nejsou v ostrém tagu | jeden dotaz na dávku commitů |
| Seznam jiného hostitele | po rámci `changed` jeho proudu | nejvýš jednou za 30 s na hostitele |
| Skládání | každých 5 minut, po změně zdroje a na žádost | – |
| Váznutí | bez dotazu na zdroje, v okamžiku nejbližší lhůty | – |

Bez spojení se sítí obnova pull requestů a Jiry neběží.

### Když zdroj neodpoví

| Co se stalo | Co je neznámé | Důvod | Fáze |
| --- | --- | --- | --- |
| Poskytovatel pull requestů neodpověděl | pull request jednotek toho repozitáře | `source-failed` | neznámá |
| Hostitel nemá přihlášení k poskytovateli | pull request | `not-connected` | neznámá |
| Poskytovatel nedává rozhodnutí review | review | `not-provided` | u otevřeného pull requestu neznámá |
| Jira neodpověděla, není připojená nebo klíč neexistuje | tiket | `source-failed`, `not-connected`, `not-found`, `not-permitted` | beze změny; tiket fázi neurčuje |
| Git selhal | větev nebo vydání | `source-failed` | neznámá jen tam, kde ji ten fakt určuje |
| Repozitář nemá tag odpovídající vzoru | vydání | `no-matching-tags` | u sloučené práce neznámá |
| Tagy mohou být zastaralé a žádný commit neobsahuje | vydání | `tags-stale` | u sloučené práce neznámá |
| Hostitel ztratil spojení | všechno, co četl | `host-unreachable` | neznámá hned |

- **Platnost faktu:** fakt platí dva intervaly obnovy svého zdroje od času čtení. Neúspěšná obnova v té době nic nemění; potom je fakt neznámý a poslední hodnota zůstává jen k zobrazení. Další pokus přichází po 1 minutě a prodlužuje se do 15 minut.
- **Ztráta spojení s hostitelem** platnost nečeká: jednotky hostitele zůstanou v seznamu s poslední známou větví, pull requestem a tiketem, fáze je neznámá a nic nevázne (`workUnitOfUnreachableHost`). Slovník `live` / `unverifiable` / `exited` se fáze netýká; tok práce žádný proces nehlásí ani nezastavuje.
- **Výpadek jednoho zdroje** nemění jednotky, kterých se netýká.
- **Neznámá fáze nevyvolá oznámení** a nepočítá se do odznaku.

### SSH, folder workspace a starší protějšky

| Případ | Chování |
| --- | --- |
| Worktree na stroji dosaženém přes SSH (`runtime:<env>`) | Jednotky skládá `orcad` na tom stroji; aplikace je převezme přes `workFlow.list`. Pull request je známý, jen když je poskytovatel přihlášený tam; jinak `not-connected`. Tiket doplní aplikace uživatele. |
| Hostitel `ssh:<target>`, kterého nikdo neobsluhuje | Žádné jednotky; stav hostitele `not-served`. |
| Ztráta spojení se vzdáleným hostitelem | Jeho jednotky zůstanou, fáze neznámá, bez oznámení. Po obnovení spojení se seznam přečte znovu. |
| WSL | Skládá místní hostitel; git běží stávajícím spouštěčem pro WSL. |
| Folder workspace bez gitu | Nemá větev (`branch: ''`), takže není jednotka a git se pro něj nespouští. Pull request uživatele v jiném repozitáři tím dotčený není. |
| Starší klient, novější hostitel | Nové metody nevolá, nepovinná pole nečte a pole `workFlowReleaseTags` v `repo.update` neposílá, takže vzory zůstanou, jak jsou. |
| Novější klient, starší hostitel | Klient se na schopnost zeptá před každým voláním; `method_not_found` čte stejně. Bez `work-flow.v1` je hostitel `unsupported`, jeho jednotky chybí a přehled to řekne. Bez `work-flow.release-tags.v1` jsou vzory v nastavení jen ke čtení a klient pole přes `repo.update` neposílá, protože starší hostitel by ho tiše zahodil. |
| Hodnota, kterou sestavení nezná (důvod, fáze, stav vydání) | Čte se jako neznámá, nikdy jako známý stav. Čtečku odpovědi staví TASK-171. |

### Oznámení a nastavení

- **Oznámení** posílá jen hlavní proces desktopové aplikace, nad spojeným seznamem a podle svých vypínačů. Okno, spárovaný klient ani `orcad` neoznamují. Co už ohlásil, si drží ve svých datech podle označení jednotky a fáze.
- **Lhůty a vypínače** jsou v nastavení aplikace, u které uživatel sedí. Každý hostitel počítá váznutí ve své odpovědi svými lhůtami; spojující aplikace ho přepíše svými.
- **Vzory tagů** jsou na řádku repozitáře u hostitele, který ho vede.

## Consequences

- **Pull requesty u vzdáleného hostitele** jsou známé, jen když je tam poskytovatel přihlášený. Dokud není, je fáze jeho jednotek neznámá s důvodem.
- **GitHub, GitLab a další:** otevřený pull request má fázi jen tam, kde poskytovatel dává rozhodnutí review (dnes GitHub). Sloučený pull request má fázi neznámou, dokud fakta nenesou commit sloučení; doplnit ho je práce TASK-167. Lhůta se u nich počítá od poslední aktivity a je označená jako nepřesná.
- **Odpověď v diskusi bez nové verze** fázi „čekají opravy“ neukončí; ukončí ji vyřešení vláken nebo nová verze. Fakta z TASK-167 čas odpovědi autora nenesou.
- **Tagy:** několik fetchů Orky běží s `--no-tags`. TASK-169 musí ověřit, které tagy má repozitář aktuální, a jinak hlásit `tags-stale`; čtení tagů vzdáleného repozitáře bez zápisu je jedna z možností.
- **Repozitář bez tagů odpovídajících vzoru** má sloučenou práci s fází neznámou, dokud uživatel ostrý vzor nevypne; pak je sloučení konec.
- **Jira:** dotaz JQL na více klíčů může selhat celý, když jeden klíč neexistuje (neověřeno proti živé Jiře). TASK-170 to má ověřit, klíče omezit na projekty, které Jira zná, a ty předat i čtení klíče (`projectKeys`). Klíč sám neříká, ve kterém webu Jiry tiket je.
- **Holé číslo ve jménu větve** se bez projektu nečte. Odkud projekt vzít (nastavení repozitáře, nebo jen název pull requestu a připojený tiket), je otázka na uživatele.
- **Dvě desktopové aplikace spárované navzájem** oznámí váznoucí jednotku každá na svém počítači.
- **Folder workspace nad adresářem, který je git checkout,** jednotkou v M9 není.
- **Ověřeno** je jen sdílený modul testy (66 testů). Služby, metody a chování proti skutečnému vzdálenému hostiteli staví a ověřují TASK-167 až TASK-176.
- **Upřesnění z TASK-167:** vlákna otevřených pull requestů uživatele se čtou v každém kole, ne jen po změně, protože seznam Azure DevOps nový komentář neprozradí; iterace jen po změně commitu. Strop 30 platí pro dotazy na vlákna a iterace. Výjimku z pravidla `credential` pro vzdáleného hostitele bez přihlášení přidává decision-18.
