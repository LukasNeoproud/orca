# AI a review

Vylepšení, která těsněji propojují agenty, IDE a review. Navazují na hooky agentů (`agent-hook-listener`), drafty review z TASK-51, panel emulátoru a analytické jádro (viz [Integrace do forku](./01-integrace.md)).

## Přehled

| # | Vylepšení | Oblast | Stav |
| --- | --- | --- | --- |
| 1 | Plán změny v grafických pohledech | vývoj | přijato |
| 2 | Review během práce agenta | vývoj | přijato |
| 3 | Brány kvality jako zpětná vazba agentovi | vývoj | přijato, priorita |
| 4 | Rozdělení velké změny | vývoj | přijato, nízká priorita |
| 5 | Důvod u každého hunku | vývoj, review | přijato |
| 6 | Hodnocení celků a nálezů | review | přijato |
| 7 | Nálezy AI s důkazem | review | přijato, priorita |
| 8 | Inkrementální re-review | review | přijato, priorita |
| 9 | Spustitelné review s průvodcem | review | přijato |
| 10 | Naučené konvence týmu | review | přijato |
| 11 | Dopad na ostatní platformy | review | přijato |
| – | Kritéria zadání jako testy | review | zamítnuto, viz konec |

Pořadí realizace: nejdřív 3, 7 a 8. Navazují přímo na hooky a drafty z TASK-51 a nepotřebují analytické jádro.

## Během vývoje

### 1. Plán změny v grafických pohledech

Agent před implementací navrhne plán a Orca ho zobrazí ve stejných pohledech jako hotový kód, ale v hrubším měřítku. Plán je z principu kratší a implementace je v něm jen v náznacích, takže se neporovnává řádkový diff.

- **Co plán zobrazí:** dotčené moduly a vrstvy, nové nebo změněné obrazovky a přechody, nové a změněné endpointy, nové vazby mezi moduly, lokalizační klíče.
- **Granularita:** úroveň modulů, obrazovek, intentů a endpointů. Ne soubory a řádky.
- **Schválení:** plán schvaluje uživatel před začátkem implementace; může ho upravit nebo vrátit agentovi s připomínkou.
- **Porovnání po dokončení:** Orca porovná plán s modelem hotového kódu na stejné úrovni a ukáže odchylky, např. „nová vazba Feature → Data nebyla v plánu“ nebo „obrazovka Správa karet přibyla navíc“. Review začíná u odchylek.
- **Uložení:** plán se ukládá k workspace a k PR, aby ho reviewer viděl jako kontext.

### 2. Review během práce agenta

Diff po celcích se staví průběžně, jak agent upravuje soubory, a uživatel ho může komentovat ještě před dokončením.

- Zápisy agenta zachycené v hookách (Edit, Write) se průběžně řadí do celků.
- Komentář k hunku nebo celku během běhu se pošle agentovi jako pokyn do kontextu („tohle dej do repozitáře, ne do ViewModelu“).
- Komentáře se zobrazí jako vlákna, která agent po zapracování označí jako vyřešená; uživatel je potvrdí.
- Chyby se opraví dřív, než vznikne PR, a review hotového PR je kratší.

### 3. Brány kvality jako zpětná vazba agentovi

Agent dostane od nástrojů zpětnou vazbu o kvalitě kódu a může ho vylepšit dřív, než práci ohlásí jako hotovou.

- **Spouštění:** při ukončení kroku agenta (hook Stop) a volitelně po každém zápisu do souboru.
- **Kontroly:** diagnostika language serveru, lint projektu, vlastní kontroly IDE, pravidla vrstev, build a testy změněných modulů.
- **Smyčka:** nálezy se agentovi vrátí automaticky jako zpráva, agent je opraví a kontroly proběhnou znovu.
- **Limit opakování:** po nastaveném počtu kol bez zlepšení se smyčka zastaví a nálezy zůstanou uživateli.
- **Výsledek:** stav bran je vidět u workspace a v PR; review nedostává chyby kompilace ani lintu.
- **Nastavení:** které brány jsou povinné, je v nastavení projektu v Orce.

**Stav po TASK-85:**

- **Hotovo:** brány se nastavují u repozitáře v Orce (název, příkaz, povinná nebo volitelná, časový limit, pořadí) a spouštějí se jen na pokyn: tlačítkem v nastavení repozitáře nebo příkazem `orca gates run`. Git repozitář i složka bez gitu.
- **Výsledek brány:** prošla, selhala, vypršel limit, nešla spustit nebo zastavena; k tomu návratový kód a konec výstupu.
- **Vazba na kód:** záznam běhu nese commit, zda byl strom čistý, a kdo běh spustil. Po dalším commitu nebo úpravě souboru se výsledek hlásí jako zastaralý. Složka bez gitu se na commit neváže.
- **Kde to běží:** na hostiteli, který worktree vlastní, včetně WSL a Orky na vzdáleném stroji. Při ztrátě spojení je běh „nelze ověřit“, ne selhání; starší hostitel odpoví, že brány neumí.
- **Bezpečnost:** příkazy bran se nikdy nečtou z repozitáře ani z `orca.yaml` a přes RPC ani CLI je nejde založit ani změnit. Agent smí přes CLI spustit jen bránu, kterou nastavil uživatel.
- **CLI:** `orca gates list`, `orca gates run [<brána>...]`, `orca gates status`, `orca gates cancel [<brána>...]`. `run` čeká na konec a skončí kódem 0, jen když prošly všechny povinné brány; s `--no-wait` vrátí hned id běhů a průběh pak ukáže `status`. `cancel` zastaví běžící brány workspace nebo jmenované a bez běžící brány skončí úspěšně (TASK-120).
- **Ukončení Orky:** běžící brána se zastaví i s procesy, které spustila, a po startu je „zastavena, protože se Orca ukončila“. Po pádu je „nelze ověřit“ (TASK-119).
- **Zbývá:** stav bran u workspace a panel výsledků (TASK-86), spuštění po kroku agenta, smyčka s limitem opakování a vrácení nálezů agentovi (TASK-87), ostatní kontroly (diagnostika language serveru, pravidla vrstev) a běh brány jako důkaz nálezu (TASK-88). Zápis stavu bran do pull requestu rozhodnutý není. Brány repozitáře u jiného hostitele jdou nastavit jen v Orce na něm.

Model brány a běhu, úložiště a vlastníka běhu popisuje [decision-11](../../backlog/decisions/decision-11%20-%20Br%C3%A1ny-kvality-definice-v-nastaven%C3%AD-repozit%C3%A1%C5%99e-v-Orce-b%C4%9Bh-a-jeho-z%C3%A1znam-na-hostiteli-kter%C3%BD-worktree-vlastn%C3%AD.md).

### 4. Rozdělení velké změny

Velikost PR se dnes neřeší, ale menší celky jsou pro reviewera přehlednější. Funkce je proto volitelná.

- Když diff přeroste nastavenou velikost, Orca navrhne rozdělení podle celků na navazující PR (stacked PR).
- Rozdělení je návrh; uživatel ho může upravit nebo ignorovat.
- Nízká priorita, dokud se neukáže potřeba v týmu.

### 5. Důvod u každého hunku

Kromě původu změny (zadání, vývojář, AI) se ukládá i důvod.

- Ke každému hunku od agenta se uloží odkaz na místo v přepisu agenta, kde změnu zdůvodnil.
- Reviewer klikne na řádek a uvidí krátké zdůvodnění a odkaz na celý kontext v konverzaci.
- U hunků od vývojáře lze důvod doplnit ručně (komentář v PR).

## Review

### 6. Hodnocení celků a nálezů

Celky i nálezy dostanou strukturované hodnocení, podle kterého se řadí a filtrují.

**Celky diffu (riziko):**

| Faktor | Zdroj |
| --- | --- |
| Složitost | metriky z analytického jádra |
| Četnost změn | historie souborů |
| Pokrytí testy | výsledky testů a pokrytí |
| Podíl kódu od AI | původ řádků |
| Citlivost oblasti | nastavení projektu (platby, migrace, oprávnění, bezpečnost) |

- Review začíná nejrizikovějším celkem.
- Bezpečné celky (přejmenování, generovaný kód, formátování) jde schválit hromadně.

**Nálezy (AI review, lint, kontroly IDE):**

| Atribut | Hodnoty |
| --- | --- |
| Závažnost | chyba, varování, návrh, drobnost |
| Jistota | ověřeno důkazem, pravděpodobné, nejisté (viz bod 7) |
| Četnost | kolikrát se stejný problém v PR nebo projektu opakuje |
| Dopad | rozsah (řádek, soubor, modul, platforma) a citlivost oblasti |
| Priorita | odvozená ze závažnosti, jistoty, dopadu a četnosti; jde ručně přepsat |

- Nálezy jsou seřazené podle priority, opakované nálezy jsou seskupené do jednoho s výčtem míst.
- Publikovat jde s filtrem, např. jen chyby a varování s jistotou ověřeno.

**Stav po TASK-126:**

- **Hotovo:** záložka draftů řadí nepublikované drafty podle priority ze závažnosti a jistoty (pravidlo v [decision-10](../../backlog/decisions/decision-10%20-%20N%C3%A1lezy-AI-v-review-z%C3%A1va%C5%BEnost-d%C5%AFkazy-a-jistota-odvozen%C3%A1-hostitelem-ov%C4%9B%C5%99en%C3%A1-citace-k%C3%B3du-znamen%C3%A1-jen-pravd%C4%9Bpodobn%C3%BD-n%C3%A1lez.md)) nebo podle souboru a řádku. Filtr zužuje seznam podle závažnosti, jistoty, autora a souboru; odpověď ve vlákně patří k souboru svého vlákna.
- **Publikace podle filtru:** „Vybrat zobrazené“ zaškrtne právě zobrazené publikovatelné drafty a publikuje se stávajícím dialogem, který uvede jejich počet. Kolik draftů filtr skrývá, kolik z nich nemá závažnost a kolik skrytých zůstává vybraných, stojí vedle filtru.
- **Zapamatování:** řazení si Orca pamatuje jako režim zobrazení Files; filtr platí, dokud je stránka otevřená. Publikované drafty se neřadí ani nefiltrují.
- **Zbývá:** četnost a ruční přepsání priority se seskupením opakovaných nálezů (TASK-103), dopad nálezu (M4) a nálezy z lintu a kontrol IDE ve stejném seznamu (M3, M5).

### 7. Nálezy AI s důkazem

Každý draft nálezu od AI nese ověření, aby bylo méně falešných nálezů.

- **Druhy důkazu:** reference a typy z language serveru, výsledek spuštěného testu, reprodukce v emulátoru, porovnání s kontraktem v referenci jiné platformy.
- Nález bez důkazu má jistotu „nejisté“ a je tak označený.
- Reviewer vidí důkaz u nálezu a může ho otevřít (reference, výstup testu, snímek).

**Stav po TASK-84:**

- **Hotovo:** draft nese závažnost (chyba, upozornění, návrh, drobnost) a seznam důkazů. První druh důkazu je citace kódu: soubor, řádky a citovaný text na commitu draftu. Hostitel citaci porovná se souborem a z výsledku odvodí jistotu nálezu.
- **Jistota:** bez důkazu nejisté, s citací, která v souboru je, pravděpodobné, s citací, která tam není, rozporné s důvodem. „Ověřeno“ zatím nevznikne; je vyhrazené pro důkazy, které Orca sama spustí.
- **Kde je to vidět:** karta draftu (závažnost, jistota, úryvek komentovaného kódu, rozbalovací důkazy s otevřením v diffu) a komentář draftu v diffu. Závažnost může uživatel změnit; ručně psaný draft jistotu nemá.
- **Odpovědi ve vláknech (TASK-118):** jistotu má jen nález. Odpověď agenta do vlákna bez závažnosti (například odpověď na komentáře k vlastnímu pull requestu) značku „nejisté“ ani „pravděpodobné“ nenese; když ale přiloží citaci, která v souboru není, je označená jako rozporná. Odpověď se závažností je nález, jak ho píše AI review.
- **Agent:** závažnost a důkazy ukládá přes `ado_create_draft` a `ado_update_draft` (MCP i rozšíření pro Pi) a přes `orca ado draft create` a `update`. Prompt AI review je žádá u každého nálezu a říká, co se stane bez nich.
- **Publikace:** do Azure DevOps odchází jen text draftu.
- **Zbývá:** ostatní druhy důkazu (reference a typy z language serveru, výsledek testu, reprodukce v emulátoru, kontrakt jiné platformy), zobrazení na mobilu a rozhodnutí, jestli publikovaný komentář ponese závažnost a důkaz.

Model, druhy důkazu a pravidla jistoty popisuje [decision-10](../../backlog/decisions/decision-10%20-%20N%C3%A1lezy-AI-v-review-z%C3%A1va%C5%BEnost-d%C5%AFkazy-a-jistota-odvozen%C3%A1-hostitelem-ov%C4%9B%C5%99en%C3%A1-citace-k%C3%B3du-znamen%C3%A1-jen-pravd%C4%9Bpodobn%C3%BD-n%C3%A1lez.md).

### 8. Inkrementální re-review

Po pushi autora reviewer vidí jen to, co se změnilo od jeho posledního review.

- Orca si pamatuje commit, u kterého reviewer review dokončil.
- Diff od tohoto commitu je rozdělený na celky stejně jako první review.
- U každého otevřeného vlákna AI posoudí, jestli nová změna připomínku řeší, a navrhne vlákno uzavřít; uzavírá uživatel.
- Změny mimo vlákna jsou zvýrazněné jako nové.

### 9. Spustitelné review s průvodcem

Reviewer si může aplikaci ve stavu PR skutečně projít, nejen prohlédnout snímky.

- **Sestavení:** Orca sestaví aplikaci z review worktree a spustí ji v panelu emulátoru (Android emulátor, iOS simulátor).
- **Interaktivní průchod:** reviewer aplikaci normálně ovládá; navigační graf ukazuje, kde se nachází, a zvýrazňuje změněné obrazovky.
- **Průvodce od AI:** z diffu, zadání a navigačního grafu AI připraví návod, na co se zaměřit, např. „Platba: vyber jinou než výchozí kartu“, „Správa karet: odeber kartu a vypni síť“. Kroky jde odškrtávat.
- **Rychlý přechod:** AI umí aplikaci dovést na konkrétní obrazovku přes strom přístupnosti emulátoru (deep link nebo automatický průchod).
- **Záznam nálezu:** z emulátoru jde vytvořit komentář k PR se snímkem a krokem průvodce.
- **Snímky:** automatické snímky změněných obrazovek zůstávají jako rychlý náhled.

### 10. Naučené konvence týmu

Review se učí z rozhodnutí týmu, ale jen se souhlasem.

- Orca sleduje, které typy draftů se přijímají a které zahazují.
- Opakovaně přijímaný typ nálezu navrhne jako pravidlo projektu; opakovaně zahazovaný navrhne potlačit.
- Pravidla se mění jen se souhlasem uživatele a ukládají se do repozitáře, aby je sdílel tým.

### 11. Dopad na ostatní platformy

Změna v jedné platformě se propíše jako upozornění vývojářům ostatních platforem.

- Když PR backendu změní kontrakt, Orca přes Funkci a reference najde volání v Android a iOS kódu.
- Vývojář dotčené platformy dostane upozornění se seznamem míst a s popisem změny kontraktu.
- Funguje i obráceně: mobilní PR, který začne volat nový nebo změněný endpoint, ukáže, zda ho backend v referenci Funkce už má.

## Zamítnuté

- **Kritéria zadání jako testy** (AI navrhne test pro nepokryté kritérium jako draft nálezu): přínos není přesvědčivý. Pokrytí kritérií zůstává jen jako upozornění v diffu po celcích.
