---
id: decision-10
title: >-
  Nálezy AI v review: závažnost, důkazy a jistota odvozená hostitelem; ověřená
  citace kódu znamená jen pravděpodobný nález
date: '2026-11-19T03:42:00Z'
status: accepted
---
## Context

Drafty review od agenta nesly jen text a polohu. Reviewer z nich nepoznal, jak vážný nález je, ani jestli se opírá o kód, který v pull requestu opravdu je. Bod 7 v [06-ai-a-review.md](../../docs/review-ide/06-ai-a-review.md) žádá, aby každý nález AI nesl ověření a nález bez důkazu byl označený jako nejistý. TASK-84 zavádí model nálezu a první druh důkazu.

- **Co už existovalo:** drafty v souboru `~/.orca/azure-devops-review-drafts.json`, který sdílí všechna sestavení Orky na stroji; nástroje agenta `ado_create_draft` a `ado_update_draft` (MCP server `orca ado mcp`, rozšíření pro Pi, příkazy `orca ado draft`); čtení obsahu souboru na commitu přes Azure DevOps se sdílenou mezipamětí a stropem požadavků (TASK-76).
- **Omezení:** klient a hostitel se aktualizují nezávisle, takže starší mobil i starší hostitel musí drafty dál číst, vytvářet a publikovat. Text, citace a důkazy od agenta jsou nedůvěryhodný vstup.
- **Nerozhodnuto jinde:** jestli má publikovaný komentář nést závažnost a důkaz (TASK-69). Do rozhodnutí se publikuje jen text draftu.

## Findings

### Model nálezu

Model je ve sdíleném kódu a nezávisí na poskytovateli review (`src/shared/review-finding.ts`).

- **Závažnost:** `error`, `warning`, `suggestion`, `nit`. Je nepovinná a smí ji nastavit agent i uživatel.
- **Důkaz:** seznam položek, každá s polem `kind`. V protokolu, v nástrojích agenta i v úložišti má položka stejný tvar.
- **Kontrola důkazu:** co hostitel zjistil, když položku porovnal s kódem. `confirmed` (volitelně s řádky, kde citát opravdu je), `refuted` (s důvodem a s textem, který na citovaném místě je) nebo `unchecked` (s důvodem).
- **Jistota:** `verified`, `likely`, `uncertain`, `contradicted`. Odvozuje ji hostitel z důkazů a jejich kontrol; agent ji poslat nemůže.
- **Priorita (TASK-126):** odvozuje ji klient čistou funkcí `deriveReviewFindingPriority` (`src/shared/review-finding-priority.ts`) jako součet bodů za závažnost (chyba 40, varování 30, návrh 20, drobnost 10, bez závažnosti 0) a za jistotu (ověřeno +4, pravděpodobné i bez jistoty 0, nejisté −4, rozporné −50), takže seznam řadí podle závažnosti, v ní podle jistoty a rozporné nálezy až za drafty bez závažnosti; další faktor (četnost a ruční přepsání z TASK-103) přibude jako další sčítanec.

### Druhy důkazu

| Druh | Pole | Kdo ho ověří | Co potvrzený důkaz dokazuje |
| --- | --- | --- | --- |
| `code-citation` | `filePath`, `startLine`, `endLine` (nepovinné), `quote`, `note` (nepovinné) | hostitel porovnáním se souborem na commitu draftu | `likely` |
| `command-run` (TASK-88) | `source` (`quality-gate`), `runId`, `note` (nepovinné) | hostitel ze svého záznamu běhu brány | `verified` |
| jakýkoli jiný | uchová se, jak přišel | nikdo | nic |

- **Neznámý druh** od novějšího klienta nebo z úložiště se uchová a zobrazí jako neověřený. Do jistoty se nepočítá. Nástroje agenta ho odmítnou s chybou, protože agent smí přikládat jen to, co Orca umí ověřit.
- **Další druhy** z bodu 7 (výsledek testu, reprodukce v emulátoru, reference z language serveru) přibudou jako nové hodnoty `kind` a nové řádky tabulky důkazní síly (`REVIEW_CONFIRMED_EVIDENCE_PROVES`). Schéma se kvůli nim nemění.

### Pravidla jistoty

Jistotu počítá čistá funkce `deriveReviewFindingCertainty`. Pravidla se vyhodnocují shora dolů:

| Stav důkazů | Jistota |
| --- | --- |
| aspoň jeden důkaz je vyvrácený | `contradicted` |
| aspoň jeden potvrzený důkaz druhu, který dokazuje `verified` | `verified` |
| aspoň jeden potvrzený důkaz druhu, který dokazuje `likely` | `likely` |
| žádný důkaz, jen neověřené důkazy nebo jen neznámé druhy | `uncertain` |

- **`verified` je vyhrazené** pro důkaz, který Orca sama vyrobila nebo strojově potvrdila spuštěním. Do TASK-88 takový druh nebyl; od něj je to běh brány (oddíl Ověření běhu brány). Citát, který v souboru je, dokazuje jen to, že kód existuje, ne že je nález správný.
- **Jeden vyvrácený důkaz přebije všechny ostatní.** Agent, který si citát vymyslel, si nezaslouží důvěru ani u zbytku nálezu.
- **Jistotu má jen nepublikovaný draft agenta.** Ručně psaný draft ji nemá, ani když mu uživatel nastaví závažnost.
- **Jistotu má jen nález, ne odpověď ve vlákně (TASK-118).** Draft agenta je nález, když není odpovědí (`kind` není `reply`), nebo když odpověď nese závažnost. Odpověď bez závažnosti odpovídá na vlákno: jistotu nemá a pole `certainty` hostitel vynechá, s jedinou výjimkou: když některý její důkaz vyvrátí, dostane `contradicted`. Vymyšlený citát je chyba agenta, ne chybějící důkaz, a má být vidět i u odpovědi. Kontroly důkazů (`evidenceChecks`) hostitel počítá u všech draftů jako dřív.
  - **Proč druh draftu nestačí:** prompt AI review dovoluje nálezy i jako odpovědi do existujících vláken a u každého nálezu žádá závažnost. Prompt odpovědí na komentáře (vlastní pull request) závažnost nezmiňuje a popis závažnosti v nástrojích agenta říká, že odpověď, která jen odpovídá na vlákno, ji nemá. Druh draftu se po vytvoření nemění a odpověď má vždy `threadId`.
  - **Kde:** pravidlo je jedna čistá funkce hostitele (`azureDevOpsReviewDraftCertainty` v `src/main/azure-devops/review/azure-devops-review-draft-certainty.ts`), kterou volá popis draftů pro detail, seznam, vytvoření i úpravu. Desktop, CLI i MCP čtou výsledek ze stejné odpovědi. Pravidla v `deriveReviewFindingCertainty` se nemění.
  - **Mez:** odpověď z AI review, u které agent závažnost vynechá, se ukáže jako odpověď bez značky. Odpověď, které uživatel nastaví závažnost, se stane nálezem a jistotu dostane.
  - **Starší peer:** nová hodnota nevzniká, jen chybí u odpovědí. Starší klient a mobil odpověď bez `certainty` ukážou bez značky; novější klient nad starším hostitelem ukáže `uncertain` jako dřív.
- **Test** prochází všechny seznamy do tří důkazů (citace a neznámý druh, dvanáct stavů kontroly) a ověřuje pravidlo i to, že z nich `verified` nevznikne; `verified` dá jen potvrzený běh brány.

### Ověření citace kódu

- **Proti čemu:** obsah souboru na commitu draftu, čtený z Azure DevOps. Lokální checkout není potřeba.
- **Jen commity pull requestu:** citace se ověřuje jen tehdy, když je commit draftu zdrojovým commitem některé iterace. Jinak je kontrola `unchecked` a hostitel se na soubor vůbec nezeptá.
- **Porovnání:** bílé znaky se slučují a prázdné řádky vynechávají. Citát smí být částí citovaných řádků.
  - Citát na citovaných řádcích: potvrzeno.
  - Citát v souboru jinde, právě jednou: potvrzeno, s řádky, kde opravdu je. Čísla řádků agenti pletou mnohem častěji, než si kód vymýšlejí.
  - Jinak vyvráceno, s textem, který na citovaných řádcích je (nejvýš 12 řádků a 1 200 znaků).
  - Citované řádky jsou za koncem souboru nebo soubor na commitu neexistuje: vyvráceno.
  - Binární nebo příliš velký soubor: neověřeno.
- **Strop:** jedno načtení přečte nejvýš 80 dosud neznámých verzí souborů, společně se sledováním vláken z TASK-76. Co se nevešlo, je `unchecked` a doplní se při dalším načtení. Verze souboru na commitu se nemění, takže zůstává v mezipaměti.
- **Kdy:** při každém čtení draftů (detail, seznam, vytvoření, úprava). Výsledek kontroly se neukládá. Agent tak dostane výsledek hned v odpovědi nástroje a po přesunu draftu na novou iteraci se citace ověří znovu.

### Ověření běhu brány (TASK-88)

Důkaz `command-run` jmenuje běh, který provedla Orca. Agent pošle zdroj a id běhu; všechno ostatní čte hostitel ze svého záznamu běhů bran ([decision-11](decision-11%20-%20Br%C3%A1ny-kvality-definice-v-nastaven%C3%AD-repozit%C3%A1%C5%99e-v-Orce-b%C4%9Bh-a-jeho-z%C3%A1znam-na-hostiteli-kter%C3%BD-worktree-vlastn%C3%AD.md)). Review podporuje jen místní klony, takže hostitel draftů je i hostitel, který review worktree vlastní a brány v něm spouští; záznam tedy čte ve vlastním procesu, i když je sám vzdálený stroj.

Pravidla se vyhodnocují shora dolů (`checkAzureDevOpsReviewGateRunEvidence`); první, které neplatí, dá kontrolu `unchecked` s důvodem:

| Co hostitel zjistí | Odkud | Důvod, když neplatí |
| --- | --- | --- |
| hostitel umí běhy hledat | služba bran v procesu | `runs-unavailable` |
| záznam běhu s tím id existuje | úložiště běhů hostitele | `run-not-found` |
| běh proběhl ve worktree, který registr review worktrees vede pro tento pull request, a v jeho repozitáři | registr review worktrees | `run-other-worktree` |
| brána je v řádku repozitáře se stejným příkazem, jaký běžel | nastavení repozitáře | `run-gate-changed` |
| commit draftu je commitem některé iterace pull requestu | iterace z Azure DevOps | `commit-not-in-review` |
| běh skončil | záznam běhu | `run-not-finished` |
| běh proběhl na commitu draftu | `source.head` záznamu | `run-stale-commit` (commit starší iterace), jinak `run-other-commit` |
| commit draftu je commitem poslední iterace | iterace | `run-stale-commit` |
| strom byl při startu příkazu čistý | `source.clean` záznamu | `run-dirty-tree` |
| příkaz skončil nenulovým kódem (`failed`) | záznam běhu | `run-passed`, jinak `run-no-verdict` |

- **Výsledek pro klienta:** kontrola nese shrnutí běhu (`run`: zdroj, id, worktree, název a příkaz brány, stav, návratový kód, commit, čistota stromu, čas konce, příznak zkráceného výstupu), jakmile běh patří k review worktree pull requestu. U běhu z jiného worktree shrnutí chybí. Výstup příkazu v kontrole není; klient ho čte od hostitele metodou `qualityGates.output` a zachází s ním jako s daty.
- **Nikdy `refuted`:** běh, který nic nedokazuje, je chybějící důkaz, ne vymyšlený citát. Platí i pro běh, který prošel. Druhý důvod je starší klient: `refuted` popisuje textem „citát v souboru není“, což by o běhu brány nebyla pravda.
- **Co agent neovlivní:** výsledek kontroly a shrnutí běhu (pole od agenta se zahazují už při čtení vstupu), záznam běhu (zakládá ho jen služba bran hostitele, id je náhodné UUID), příkaz brány (jen z řádku repozitáře, který přes runtime socket zapsat nejde), návratový kód, commit a čistotu stromu (čte hostitel gitem při startu příkazu), registr review worktrees a seznam iterací.
- **Co agent ovlivnit může:**
  - Který běh přiloží. Ověření říká, že brána na commitu selhala, ne že selhala kvůli tomu, co nález tvrdí; selhání, které je i v cílové větvi, projde stejně.
  - Stav, který git nevidí: soubory ignorované gitem (závislosti, mezipaměti buildu), soubory označené `assume-unchanged` nebo `skip-worktree`, lokální `.git/info/exclude` a prostředí stroje. Prompt úpravy souborů zakazuje; vynucené to není.
  - Data Orky na disku. Kdo smí zapisovat do souboru s běhy, záznam podvrhne; stejná mez jako u nastavení bran v decision-11.
- **Retence:** úložiště drží 5 dokončených běhů na bránu a worktree. Když záznam vypadne, kontrola je `run-not-found` a jistota klesne.
- **Rozšíření:** další zdroj běhu (jednorázový příkaz z TASK-122) je nová hodnota `source` a nové úložiště záznamů, ne nový druh důkazu. Běh ze zdroje, který sestavení nezná, se uchová jako neznámý důkaz.
- **Starší protějšky:** hostitel hlásí schopnost `azure-devops-review.gate-run-evidence.v1`. Starší hostitel `command-run` uloží jako neznámý druh (`unknown-kind`) a `verified` nedá. Starší klient hodnotu `verified` zná, důvody začínající `run-` čte jako „neověřeno“ bez vysvětlení a pole `run` ignoruje. Nástroje agenta ze starší instalace `command-run` odmítnou dřív, než se zeptají hostitele. Protokol RPC se nezměnil.
- **Testy:** pravidla (`azure-devops-review-gate-run-evidence.test.ts`), celá cesta se skutečným příkazem nad smyšleným repozitářem (`azure-devops-review-gate-run-evidence.real-run.test.ts`), data draftu (`azure-devops-review-draft-findings.gate-run.test.ts`), nástroje agenta (`azure-devops-review-gate-tool-calls.test.ts`), kompatibilita oběma směry (`review-command-run-evidence-compatibility.test.ts`).

### Hranice důvěry

- **Limity vstupu:** 10 důkazů na draft, cesta 1 024 znaků, 400 citovaných řádků, citát 4 000 znaků, poznámka 500 znaků, důkaz neznámého druhu 4 000 znaků.
- **Cesta** musí být relativní k repozitáři, bez `..`, bez zpětných lomítek a bez řídicích znaků.
- **Pole hostitele:** `origin` a `check` na důkazu smí psát jen hostitel. Ze vstupu od agenta a od klienta se zahazují, takže si agent potvrzení nepodvrhne.
- **Vykreslení:** citát, poznámka, úryvek kódu i data neznámého důkazu se vykreslují jako prostý text.
- **Chyby:** neplatná závažnost nebo důkaz vrátí chybu se jménem pole a pravidlem (například `evidence[0].quote must hold the cited lines as they are in the file`). Nástroje agenta ji vrátí dřív, než se zeptají hostitele.

### Úložiště a starší sestavení

- **Formát:** stejný soubor, stejná verze 1. Draft má nová nepovinná pole `severity` a `evidence`; draft bez nich se zapisuje přesně jako dřív.
- **Starší sestavení nad stejným souborem** přečte všechny drafty. Když soubor přepíše, zahodí `severity` a `evidence`, protože draft skládá z polí, která zná. Text, poloha a stav draftu zůstanou. Test to dokládá přepisem starého normalizátoru.
- **Starší klient nebo hostitel:** nová pole jsou nepovinná a schéma parametrů neznámá pole zahazuje. Starší hostitel tedy draft uloží bez závažnosti a důkazů a nespadne. Hostitel, který nálezy umí, to hlásí schopností `azure-devops-review.findings.v1`; klient bez ní změnu závažnosti nenabízí, protože by ji hostitel potichu zahodil.

## Decision

Draft review nese nepovinnou závažnost a seznam důkazů. Jistotu nálezu odvozuje hostitel při čtení a nikdy ji neukládá ani nepřebírá od agenta.

- **Proč jistotu neposílá agent:** hodnota, kterou si píše ten, koho má hlídat, nic neříká. Agent dodá tvrzení (citaci) a Orca ho ověří.
- **Proč je ověřená citace jen `likely`:** potvrzuje existenci kódu, ne závěr. `verified` zůstává pro důkazy, které Orca sama spustila.
- **Proč se kontrola neukládá:** uložený výsledek by zastaral při každém přesunu draftu a starší sestavení by ho při přepisu souboru zahodilo nebo nechalo viset u jiného textu.
- **Proč tolerantní porovnání:** přísné porovnání po znacích by označilo za rozpor většinu poctivých citací (odsazení, posun o řádek). Rozpor má znamenat, že citovaný kód v souboru není.
- **Proč stejný soubor úložiště:** nová verze formátu by starší sestavení donutila soubor odmítnout nebo přepsat, a uživatel by přišel o drafty.
- **Publikace:** do Azure DevOps odchází jen text draftu. Závažnost a důkazy zůstávají v Orce, dokud se nerozhodne TASK-69.

## Consequences

- **Nález bez důkazu je vidět:** agentův draft bez citace je na kartě i v diffu označený jako nejistý, s vymyšlenou citací jako rozporný a s důvodem.
- **`verified` dává od TASK-88 běh brány,** který selhal na commitu poslední iterace s čistým stromem. Další druhy (emulátor, language server) přibudou stejnou cestou.
- **Starší sestavení důkazy nezachová.** Kdo střídá starou a novou Orcu nad stejnými drafty, přijde po úpravě draftu ve staré o závažnost a důkazy, ne o draft.
- **Každý draft s citací stojí čtení souboru.** Platí se jednou na verzi souboru; při stovkách draftů nad různými soubory se část ověří až při dalším načtení.
- **Odpovědi ve vláknech jistotu nemají** (TASK-118), pokud nenesou závažnost; vyvrácená citace se u nich ukáže jako rozporná.
- **Mobilní aplikace** nová pole přenáší, ale nezobrazuje.
