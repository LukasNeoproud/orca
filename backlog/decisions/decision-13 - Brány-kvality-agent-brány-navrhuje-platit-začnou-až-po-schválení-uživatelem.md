---
id: decision-13
title: 'Brány kvality: agent brány navrhuje, platit začnou až po schválení uživatelem'
date: '2026-11-20T09:40:00Z'
status: accepted
---
## Context

Definice bran kvality zapisuje jen okno aplikace; žádná metoda `qualityGates.*` ani CLI je nepíše (decision-11), aby agent nekontroloval svou práci příkazem, který si sám zvolil. Uživatel se 2026-11-20 zeptal, jestli může agent brány měnit aspoň ve chvíli, kdy se jejich podoba volí, a jestli dávají smysl předdefinované brány.

Zvažované možnosti:

- **Dočasné právo zápisu** („teď smíš měnit, potom ne“): agent, který právě opravuje selhávající testy, by v tom okně mohl bránu změkčit a Orca by to nepoznala.
- **Návrh ke schválení:** agent pošle návrh, uživatel ho v nastavení repozitáře přijme nebo zahodí.
- **Šablony bran podle typu projektu** (Gradle, Xcode, .NET, Node).

## Decision

- Agent brány jen navrhuje. Návrh (název, příkaz, povinná nebo volitelná, limit času) se uloží jako čekající a v nastavení repozitáře se ukáže jako rozdíl proti platným branám. Uživatel ho přijme celý, po položkách, nebo zahodí.
- Dokud návrh není přijatý, nic se podle něj nespouští a platí dosavadní brány.
- Šablony bran se nedělají (rozhodnutí uživatele 2026-11-20: založit tiket pouze na návrhy bran).

## Consequences

- Pravidlo z decision-11 platí dál: příkaz, kterým se práce agenta kontroluje, vždy potvrdil člověk.
- Přibude jedna metoda, kterou agent a CLI zapisují návrh; platné definice dál nepíše žádná.
- Tikety: TASK-148 (hostitel a protokol) a TASK-149 (rozhraní).

## Implementace na hostiteli (TASK-148)

### Model a úložiště

- **Návrh** (`src/shared/quality-gate-proposal.ts`) má vlastní id, repozitář, workspace, ze kterého přišel, čas, volajícího podle transportu, nepovinné zdůvodnění a položky. Položka nese název, příkaz, povinná nebo volitelná, limit času, nepovinné zdůvodnění a nepovinné `gateId` brány, kterou má změnit. Bez `gateId` jde o novou bránu. Smazání brány navrhnout nejde.
- **Meze:** nejvýš 20 položek, název 80 znaků, příkaz 4 000 znaků bez NUL, limit času 5 s až 4 h, zdůvodnění položky 500 a návrhu 1 000 znaků. Návrh, který je poruší, hostitel odmítne celý s chybou, aby ho agent opravil; nastavení repozitáře vadnou položku jen zahodí.
- **Odmítne se také** změna brány, kterou repozitář nemá, dvojí změna téže brány a název, který už nese jiná brána.
- **Úložiště:** soubor `quality-gate-proposals.json` v datech Orky na hostiteli, který vede řádek repozitáře s branami, jeden čekající návrh na repozitář. Do řádku repozitáře se návrh nezapisuje, takže to, co poslal agent, není v záznamu, ze kterého se brány spouští. Nový návrh nahradí předchozí. Soubor drží nejvýš 200 návrhů a čte se při každém volání, jako záznamy běhů.
- **Nic se nespouští:** běh, výpis i smyčka zpětné vazby čtou brány jen z řádku repozitáře (`resolveQualityGateTarget`); úložiště návrhů nečtou.
- **Text jako data:** název, příkaz a zdůvodnění se ukládají a vrací tak, jak přišly. Hostitel je nikam nevkládá, nespouští a neposílá agentovi; neznámá pole požadavku schéma zahodí.

### Metody a kdo je smí volat

Schopnost `quality-gates.proposals.v1`.

| Metoda | Parametry | Oprávnění | Kdo smí |
| --- | --- | --- | --- |
| `qualityGates.propose` | `worktree`, `gates`, nepovinné `rationale` | `workspace` | každý volající, kterého transport pojmenoval: runtime socket (agent, CLI), okno, spárovaná desktopová aplikace |
| `qualityGates.proposal` | `repo` | `workspace` | titíž; vrací čekající návrh nebo `null` |
| `qualityGates.resolveProposal` | `repo`, `proposalId`, `action` (`accept`, `dismiss`), nepovinné `itemIds` | `settings-write` | jen okno a spárovaná desktopová aplikace, stejná kontrola jako u `setRepositorySettings` |

- **Telefon** nevolá žádnou z nich: metody `qualityGates.*` nejsou v seznamu pro telefony, stejně jako u zápisu nastavení (decision-11, Zápis na dálku).
- **Přijetí** jde stejnou kontrolou volajícího a stejným zápisem jako nastavení repozitáře (`writeQualityGateRepositorySettings`), takže platí i jeho meze popsané v decision-11. Zapisuje se jen seznam bran; nastavení smyčky zůstává.
- **Co přijetí udělá:** položka s `gateId` nahradí bránu na jejím místě a ponechá její id. Položka bez něj, nebo s `gateId` brány, která mezitím zmizela, se přidá na konec s id odvozeným z názvu. Stejnou funkci (`applyQualityGateProposalItems`) může použít rozhraní pro zobrazení rozdílu.
- **Po položkách:** bez `itemIds` se odpověď týká všech čekajících položek. Přijaté a zahozené položky z návrhu zmizí, ostatní čekají dál pod stejným id návrhu. Návrh bez položek zanikne.
- **`proposalId` je povinné.** Odpověď na návrh, který mezitím nahradil jiný, hostitel odmítne, aby uživatel nepřijal text, který neviděl.
- **Kontrola při přijetí** proti branám té chvíle: shodný název s jinou branou nebo víc než 20 bran odpověď odmítne a nezapíše nic.
- **Hostitel `runtime:<env>` a `ssh:<target>`:** návrh pro workspace jiného hostitele hostitel odmítne jako ostatní metody bran. Agent v terminálu vzdáleného workspace volá runtime socket Orky na tom stroji, takže návrh skončí tam, kde jsou definice. Čtení a odpověď pro řádek, který hostitel jen zrcadlí, odmítne také.
- **Folder workspace:** složka bez gitu s nastavením repozitáře návrh přijímá. Folder workspace skupiny projektů nastavení repozitáře nemá a návrh odmítne.

### CLI

- `orca gates propose (--gates <json> | --file <cesta>) [--rationale <text>] [--worktree <výběr>]`. `--gates` je pole JSON objektů `{"name","command"}` s nepovinnými `required`, `timeoutSeconds`, `rationale` a `gateId`; `--file` čte totéž pole nebo `{"gates": [...], "rationale": "..."}`.
- Vypíše uložený návrh a větu, že se nic nezměnilo a o návrhu rozhodne uživatel v aplikaci.
- Příkaz pro přijetí ani zahození CLI nemá.

### Starší protějšky

- **Starší hostitel** metody nezná a odpoví `method_not_found`; CLI to přeloží na výzvu k aktualizaci Orky na hostiteli. Klient se před nabídkou ptá na schopnost.
- **Starší klient** metody nevolá. Stávající metody, jejich parametry a odpovědi se nezměnily; návrh na hostiteli čeká, dokud na něj neodpoví novější aplikace.
- **Odpovědi** čte klient tolerantně (`readQualityGateProposalResult`): neznámá pole zahodí, vadnou položku vynechá, odpověď bez návrhu čte jako nic nečeká.
- **Testy:** `quality-gates-proposals.test.ts` (nad skutečným dispatcherem), `quality-gate-proposal-store.test.ts`, `quality-gate-proposal.test.ts`, `quality-gate-proposal-compatibility.test.ts`, `index-quality-gates-propose.test.ts` a `tests/e2e/quality-gates-proposal.spec.ts` (CLI proti běžící aplikaci, odpověď z runtime socketu odmítnuta, z okna přijata).

### Co hostitel nedělá

- Změnu návrhu nehlásí proudem `qualityGates.subscribe`; rozhraní (TASK-149) si návrh přečte při otevření nastavení nebo oddílu Local gates a pak po 15 s, dokud je vidět.
- Návrh nemá platnost v čase a po odebrání repozitáře zůstane v souboru, dokud ho nevytlačí novější.

