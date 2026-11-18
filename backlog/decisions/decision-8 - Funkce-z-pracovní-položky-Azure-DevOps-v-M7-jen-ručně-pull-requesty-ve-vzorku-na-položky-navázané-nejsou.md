---
id: decision-8
title: >-
  Funkce z pracovní položky Azure DevOps: v M7 jen ručně, pull requesty ve
  vzorku na položky navázané nejsou
date: '2026-11-18T23:54:00Z'
status: proposed
---
## Context

Funkce má podle [04-projekty-a-funkce.md](../../docs/review-ide/04-projekty-a-funkce.md) (oddíl Vznik Funkce) vznikat ručně, nebo automaticky z pracovní položky Azure DevOps: pull requesty ze všech repozitářů navázané na stejnou položku se nabídnou jako členové. TASK-59 měl zjistit, jestli tým pull requesty na položky váže dost konzistentně, a ověřit volání API. Na záznam navazuje rozpis M7 (TASK-74) a čtení zadání u pull requestu (TASK-105).

- **Jak se měřilo:** 2026-11-19, druhá skrytá instance nainstalované Orca Dev s izolovaným profilem, připojení uložená v Orce. Dotazy šly funkcí Orky pro požadavky na Azure DevOps (`sendAzureDevOpsRequest` v `src/main/azure-devops/azure-devops-api-request.ts`), volanou v hlavním procesu; token neopustil proces Orky.
- **Rozsah:** 474 požadavků, všechny `GET`, s rozestupem 250 ms; 467 skončilo úspěšně, 7 stavem 401 (všechna volání pracovních položek, viz níže). Žádný zápis.
- **Vzorek:** dva produkty ve dvou organizacích, u každého repozitáře platformy posledních nejvýš 100 dokončených pull requestů. Backend produktu A neleží v Azure DevOps, ale na jiném git hostingu, takže do měření nevstoupil.
- **Data:** surové odpovědi zůstaly jen v paměti instance a po měření jsou pryč. Záznam obsahuje jen počty; názvy, čísla ani texty pull requestů a položek v něm nejsou. Skripty bez názvů a souhrn počtů: `~/.cache/orca-review-ide/task-59`.
- **Sdílená data uživatele:** soubory v `~/.orca` a nastavení hooků agentů měly před během i po něm stejné otisky SHA-256 (19 souborů), ze zálohy nebylo třeba nic obnovovat.

## Findings

### Směr pull request → položky

| Platforma | Dokončené pull requesty ve vzorku | S aspoň jednou navázanou položkou | Podíl | Období vzorku |
| --- | --- | --- | --- | --- |
| Android, produkt A | 55 (repozitář jich víc nemá) | 0 | 0 % | 337 dní |
| iOS, produkt A | 100 | 0 | 0 % | 365 dní |
| Backend, produkt A | neměřeno, repozitář není v Azure DevOps | | | |
| Android, produkt B | 100 | 0 | 0 % | 210 dní |
| iOS, produkt B | 100 | 0 | 0 % | 183 dní |
| Backend, produkt B | 100 | 0 | 0 % | 207 dní |

- **Celkem 0 ze 455.** Žádný pull request ve vzorku nemá navázanou pracovní položku, v novější ani starší polovině vzorku, u žádného autora (mobilní repozitáře mají ve vzorku po jednom autorovi, backend čtyři) a u žádné cílové větve.
- **Podpůrné signály čitelné se stejným oprávněním:**
  - Zásada větve „Work item linking“ není nastavená v žádném z obou projektů (0 konfigurací).
  - Z posledních 100 commitů každého z pěti repozitářů nemá navázanou položku žádný (0 z 500, dotaz na commity s `searchCriteria.includeWorkItems=true`).
- **Výhrada:** token nesmí číst pracovní položky (viz Oprávnění). Dokumentace u volání pro položky pull requestu žádá jen rozsah `vso.code` a volání vracelo 200 s prázdným seznamem; neříká ale, jestli server položky, které volající číst nesmí, ze seznamu vynechává. Nulu proto nejde odlišit od „vazby existují, ale token je nevidí“ jinak než tokenem s oprávněním číst položky, nebo potvrzením uživatele. Tři shodné nuly (pull requesty, commity, zásada) ukazují, že vazby opravdu nejsou.

### Položky s pull requesty z více repozitářů

- **Podíl nejde určit.** Ve vzorku není žádná navázaná položka (0 položek), takže není z čeho počítat. Směr od položek k pull requestům token přečíst nesmí: typy položek projektu, dávkové čtení položek podle čísel i výpis revizí položek za poslední rok skončily ve všech 7 pokusech v obou organizacích stavem 401.
- **Jestli tým pracovní položky Azure DevOps vůbec používá,** se proto zjistit nepodařilo. Je to otázka pro uživatele.

### Co v datech je místo vazeb

- **Číslo ve jméně větve.** Většina zdrojových větví má tvar `předpona/číslo-popis`. Třímístné číslo nese 84 až 100 % větví (Android A 55 z 55, iOS A 86 ze 100 a dalších 13 dvoumístné, Android B 92 ze 100, iOS B 100 ze 100, backend B 84 ze 100). Kterému systému evidence čísla patří, z Azure DevOps poznat nejde.
- **Číslo platformy nespojuje.** Stejné číslo se nevyskytlo ve větvích dvou platforem ani jednou: produkt A 0 z 86 různých čísel, produkt B 0 ze 197. Každá platforma má tedy vlastní úkoly a číslo ve větvi jako klíč Funkce napříč platformami neposlouží.
- **Klíč ve tvaru `ABC-123`** (jak ho píší jiné systémy evidence) je ve jméně větve nebo v názvu jen u 2 až 11 % pull requestů.

### Volání API

Základ adresy je `https://dev.azure.com/{organizace}`, verze API 7.1. Rozsahy podle dokumentace Microsoftu čtené 2026-11-19 ([položky pull requestu](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-work-items/list?view=azure-devops-rest-7.1), [čtení položek](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/list?view=azure-devops-rest-7.1), [dotaz podle adresy artefaktu](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/artifact-uri-query/query?view=azure-devops-rest-7.1), [typy vazeb](https://learn.microsoft.com/en-us/azure/devops/boards/queries/link-type-reference?view=azure-devops)).

| Směr | Volání | Rozsah tokenu | Ověřeno |
| --- | --- | --- | --- |
| Pull request → položky | `GET /{projekt}/_apis/git/repositories/{repozitář}/pullRequests/{id}/workitems` vrací pole odkazů `{ id, url }`, bez polí položky | `vso.code` (Code: Read) | živě, 455 volání, vždy 200 |
| Pole položek (název, typ, stav, popis, kritéria) | `GET /_apis/wit/workitems?ids=1,2,3&fields=…` nebo `&$expand=relations`; nejvýš 200 čísel v požadavku, `errorPolicy=omit` vynechá nečitelné | `vso.work` (Work Items: Read) | živě jen odmítnutí: 401 |
| Položka → pull requesty | stejné volání s `$expand=relations`; vazba na pull request je relace `rel: "ArtifactLink"` s `attributes.name: "Pull Request"` a adresou `vstfs:///Git/PullRequestId/{id projektu}%2F{id repozitáře}%2F{číslo}` | `vso.work` | jen podle dokumentace |
| Více pull requestů → položky naráz | `POST /_apis/wit/artifacturiquery` s polem adres artefaktů | `vso.work` | jen podle dokumentace; metoda POST, v pokusu nepoužita |
| Hledání položek (WIQL) | `POST /_apis/wit/wiql` | `vso.work` | jen podle dokumentace; metoda POST, v pokusu nepoužita |

- **Tvar adresy vazby** na pull request je odvozený z typu artefaktu `PullRequestId` v přehledu typů vazeb a z příkladu adresy commitu v dokumentaci; živě ověřený není.
- **Směr položka → pull requesty vrací id projektu a repozitáře, ne názvy.** Na název a platformu se převedou seznamem repozitářů (`GET /{projekt}/_apis/git/repositories`, `vso.code`). Vazba na pull request je vazba na objekt téže organizace; pull requesty z jiné organizace položka nést nemůže (podle dokumentace typů vazeb).
- **Počet požadavků:** směr od pull requestu stojí jeden požadavek na pull request a druhý na pole položek; dávkové čtení položek pro seznam pull requestů bez POST neexistuje.

### Oprávnění tokenu

- **Tokeny uložené v Orce položky číst nesmějí.** Nastavení Orky žádá token s rozsahem „Code (Read & write)“; s ním projdou pull requesty, commity i zásady, pracovní položky ne.
- **Odmítnutí přichází jako 401, ne 403.** Funkce Orky ho hlásí textem „Azure DevOps rejected the credentials. Reconnect the organization in Settings.“ (stejně hlásí i odpověď 203 s přihlašovací stránkou). U chybějícího rozsahu je ta rada zavádějící: připojení je v pořádku, chybí mu jen Work Items (Read).

## Decision

Návrh: v M7 zakládá Funkce uživatel jen ručně. Automatické zakládání z pracovní položky Azure DevOps ani nabídka členů podle položky se nestaví.

- **Proč ne automaticky ani nabídka:** ve vzorku 455 dokončených pull requestů pěti repozitářů za půl roku až rok není navázaná ani jedna položka, žádný commit položku nenese a zásada, která by vazbu vyžadovala, neexistuje. Nabídka podle položek by neměla z čeho vycházet.
- **Proč ne číslo ve větvi:** je skoro v každé větvi, ale mezi platformami se neshoduje ani jednou, takže platformy nespojí.
- **Co by návrh změnilo:** kdyby uživatel potvrdil, že tým položky Azure DevOps používá a vazby jen nejsou tokenu vidět, měření se zopakuje s tokenem, který má navíc Work Items (Read). Skripty zůstaly a běh trvá několik minut. Hranice pro přehodnocení: nabídku členů má smysl stavět, až bude navázaná aspoň polovina pull requestů každé platformy a část položek ponese pull requesty z více repozitářů.
- **Ruční zakládání** zůstává podle dokumentace: výběr větve, pull requestu nebo commitu pro každý repozitář.

## Consequences

- **TASK-74 (rozpis M7):** tikety počítají jen s ručním vznikem Funkce. Model Funkce může nést nepovinný odkaz na zadání, aby šla nabídka podle položek později přidat bez změny uložených dat.
- **TASK-105 (zadání u pull requestu):**
  - Na datech tohoto týmu oddíl ukáže u každého pull requestu „bez položek“. Jestli má tiket při nulovém pokrytí cenu, je otázka pro uživatele.
  - Výpis položek pull requestu projde se stávajícím tokenem, jejich pole ne. Chybějící oprávnění se pozná podle 401 na voláních `_apis/wit` při fungujících voláních `_apis/git`; hláška má jmenovat Work Items (Read), ne radit k novému připojení. Kritérium 2 tiketu s tím musí počítat.
  - Text v Nastavení u tokenu by měl zmínit nepovinný rozsah Work Items (Read).
  - Odhad „nejvýš dva požadavky na pull request“ sedí: jeden na odkazy, jeden na pole položek.
- **Backend na jiném git hostingu:** u produktu A nemůže být backend členem Funkce přes Azure DevOps. Funkce napříč hostingy je otázka návrhu M7, ne tohoto záznamu.
- **Neověřeno:** směr položka → pull requesty a tvar adresy vazby (jen dokumentace); jestli volání položek pull requestu vynechává položky, které token číst nesmí; jestli tým položky Azure DevOps používá; kterému systému patří čísla ve větvích. Podíl položek s pull requesty z více repozitářů proto v záznamu není.
