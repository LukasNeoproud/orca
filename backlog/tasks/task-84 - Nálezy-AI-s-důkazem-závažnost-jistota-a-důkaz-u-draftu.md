---
id: TASK-84
title: 'Nálezy AI s důkazem: závažnost, jistota a důkaz u draftu'
status: Done
assignee: []
created_date: '2026-11-18T15:16:00Z'
updated_date: '2026-11-19T04:10:00Z'
labels:
  - review-ide
  - effort-xhigh
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/06-ai-a-review.md
  - docs/review-ide/05-funkce.md
priority: high
type: feature
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Draft nálezu od AI je dnes jen text a recenzent nepozná, čemu věřit. Každý draft má nést závažnost a důkaz; nález bez důkazu je označený jako nejistý. Na tomto modelu stojí důkaz ze spuštěné kontroly, řazení nálezů a publikace podle filtru.

### Rozsah

- Model nálezu ve sdíleném kódu, pojmenovaný bez vazby na Azure DevOps (použijí ho i review GitHubu a GitLabu): závažnost `error`, `warning`, `suggestion`, `nit`; seznam důkazů; odvozená jistota.
- Druh důkazu v tomto tiketu: citace kódu (soubor, rozsah řádků, citovaný text na commitu draftu). Schéma počítá s dalšími druhy: běh kontroly (navazující tiket), reference z language serveru (M3), emulátor (M8), kontrakt jiné platformy (M7).
- Pravidla jistoty:
  - `verified` (ověřeno důkazem) smí vzniknout jen z důkazu, který vytvořila nebo strojově potvrdila Orca. V tomto tiketu žádný takový druh není.
  - `likely` (pravděpodobné): citace kódu, která na commitu draftu existuje.
  - `uncertain` (nejisté): žádný důkaz.
  - `contradicted` (vyvráceno): citace, která v souboru na daném místě není. Stejné úrovně důvěry použije Diff po celcích pro tvrzení AI.
- Ověření citace: obsah souboru na commitu přes `getAzureDevOpsReviewItemAtCommit` (`src/main/azure-devops/review/azure-devops-review-client.ts`); nepotřebuje lokální checkout.
- `AzureDevOpsReviewDraft` v `src/shared/azure-devops-review-types.ts` a normalizace v `src/main/azure-devops/review/azure-devops-review-drafts.ts`: nová pole nepovinná. Úložiště `azure-devops-review-draft-store.ts`.
- Nástroje agenta: `src/shared/azure-devops-review-tools.ts` (`ado_create_draft`, `ado_update_draft`), CLI (`src/cli/specs/azure-devops.ts`, `src/cli/handlers/azure-devops.ts`, `src/cli/azure-devops-review-requests.ts`), Pi rozšíření (`src/main/azure-devops/review/azure-devops-review-pi-extension-source.ts`), prompt `src/shared/azure-devops-review-prompt.ts`.
- RPC parametry v `src/shared/rpc-contract/azure-devops-review-params.ts`.
- Rozhraní: `src/renderer/src/components/azure-devops-review/AzureDevOpsReviewDraftCard.tsx` a inline komentáře v diffu (`azure-devops-review-inline-comments.ts`).

### Mimo rozsah

- Důkaz ze spuštěného příkazu nebo testu: navazující tiket nad branami kvality.
- Priorita, řazení, seskupení opakovaných nálezů a publikace podle filtru: vlastní tiket.
- Zobrazení nových polí v mobilní aplikaci; pole jím jen projdou.
- Připojování důkazu k publikovanému komentáři: otázka pro uživatele v TASK-69, do rozhodnutí se publikuje jen text.

### Omezení

- Klient a hostitel se aktualizují nezávisle a drafty čte i telefon: jen nepovinná pole, neznámé hodnoty nesmí shodit čtení.
- Text draftu, citace i výstupy jsou pro agenta i pro Orku nedůvěryhodná data.
- Barvy závažnosti a jistoty jen ze stávajících stavových tokenů v `src/renderer/src/assets/main.css`; texty ve všech šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Agent uloží k draftu závažnost a důkazy přes MCP, Pi rozšíření i orca ado draft create a update; neplatná závažnost nebo důkaz bez povinných polí vrátí chybu, kterou agent může opravit
- [x] #2 Draft od agenta bez důkazu je na kartě i v diffu označený jako nejistý; s citací kódu, která sedí s obsahem souboru na commitu draftu, jako pravděpodobný; s citací, která nesedí, jako vyvrácený s vysvětlením
- [x] #3 Jistota ověřeno důkazem z citace kódu nikdy nevznikne; odvození jistoty je čistá funkce ve sdíleném kódu s testem pro každou kombinaci
- [x] #4 Karta draftu ukazuje závažnost, jistotu, úryvek komentovaného kódu a rozbalitelný seznam důkazů; důkaz s místem v kódu jde otevřít v diffu pull requestu
- [x] #5 Uživatel může závažnost změnit; ručně psaný draft jistotu neukazuje
- [x] #6 Prompt AI review žádá u každého nálezu závažnost a důkaz a říká, že nález bez důkazu bude označený jako nejistý
- [x] #7 Publikovaný komentář obsahuje jen text draftu jako dosud
- [x] #8 Starší mobilní klient i starší hostitel dál čtou, vytvářejí a publikují drafty; neznámý druh důkazu od novějšího protějšku se zachová a zobrazí jako neověřený
- [x] #9 Katalog parametrů RPC je přegenerovaný, parametry draftů mají kontraktní test a karta je ověřená ve skrytém okně na smyšleném pull requestu
- [x] #10 Záznam rozhodnutí popisuje model nálezu, druhy důkazu a pravidla jistoty; docs/review-ide/06-ai-a-review.md bod 7 uvádí stav po tomto tiketu
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker, 2026-11-19):
1. Sdílený model bez vazby na Azure DevOps: src/shared/review-finding.ts (závažnost, důkaz code-citation, neznámé druhy, výsledek kontroly důkazu, jistota) a čistá funkce odvození jistoty s tabulkou síly druhu důkazu; vstupní parser s limity a chybami, které jdou opravit (review-finding-input.ts); porovnání citace s řádky souboru (review-code-citation-match.ts).
2. Hostitel: nepovinná pole severity a evidence v draftu (typy, normalizace, patch), úložiště beze změny verze souboru; ověření citace při čtení (detail, seznam draftů, create, update) přes cache řádků z TASK-76, jen na commitech iterací pull requestu a se stropem požadavků; view nese evidenceChecks, certainty a úryvek komentovaného kódu.
3. Protokol a nástroje: zod parametry createDraft/updateDraft, kontraktní test, ado_create_draft/ado_update_draft, orca ado draft create/update (--severity, --evidence, --evidence-file), Pi rozšíření (přebírá schéma nástrojů), prompt AI review.
4. Rozhraní: karta draftu (závažnost s výběrem, jistota, úryvek, rozbalitelné důkazy, otevření důkazu v diffu), označení v diffu, lokalizace 6 jazyků, e2e ve skrytém okně na smyšleném PR.
5. Záznam rozhodnutí (accepted), docs/review-ide/06-ai-a-review.md bod 7, katalog RPC, brány.
Publikace beze změny: odchází jen text draftu.

Stav 1/4 (sdílený model a hostitel hotové, testy procházejí): src/shared/review-finding.ts (závažnost, důkaz code-citation a neznámé druhy, kontrola důkazu, jistota, deriveReviewFindingCertainty), review-finding-input.ts (parser s limity a chybami se jménem pole, čtení z úložiště), review-code-citation-match.ts (porovnání citace se souborem). Hostitel: nepovinná pole severity a evidence v AzureDevOpsReviewDraft (normalizace, build, patch), azure-devops-review-draft-findings.ts (kontroly důkazů, certainty a codeExcerpt jen ve view, počítané při každém čtení, neukládané), čtení souboru na commitu přes cache z TASK-76 (createAzureDevOpsReviewFileReader rozlišuje chybějící a nečitelný soubor), jen pro commity iterací pull requestu. Testy: review-finding*.test.ts, review-code-citation-match.test.ts, azure-devops-review-drafts.finding-fields.test.ts, azure-devops-review-draft-findings.test.ts, azure-devops-review-draft-store.compat.test.ts (starý tvar, nový tvar čtený přepisem normalizátoru z 12480c6612), azure-devops-review-draft-actions.findings.test.ts (včetně publikace jen textu). Zbývá: zod parametry a kontraktní test, nástroje agenta a CLI, prompt, rozhraní, lokalizace, e2e, záznam rozhodnutí, dokumentace.

Stav 2/4 (protokol a nástroje agenta hotové): zod parametry severity a evidence v azure-devops-review-params.ts (sdílený parser, chyba se jménem pole), kontraktní testy vytvoření i úpravy draftu, schopnost azure-devops-review.findings.v1, katalog RPC parametrů beze změny (generátor hlásí aktuální). Nástroje ado_create_draft a ado_update_draft mají severity a evidence (schéma v azure-devops-review-tools.ts, tedy i v Pi rozšíření), CLI --severity, --evidence, --evidence-file (azure-devops-draft-evidence-flag.ts), textový výpis draftů ukazuje závažnost, jistotu a výsledek kontroly každého důkazu. Prompt AI review žádá závažnost a důkaz a říká, že nález bez důkazu bude označen jako nejistý. Testy: azure-devops-review-finding-surfaces.test.ts, rozšířené azure-devops-review-pi-extension-source.test.ts, azure-devops-review-prompt.test.ts, azure-devops-review-params.test.ts. Zbývá: rozhraní (karta, diff), lokalizace, e2e, záznam rozhodnutí, dokumentace.

Stav 3/4 (rozhraní hotové): karta draftu ukazuje závažnost (nabídka pro změnu, u publikovaného jen text), jistotu (jen u nepublikovaného draftu agenta), úryvek komentovaného kódu a rozbalovací důkazy; rozporný nález má důkazy rozbalené hned. Důkaz s polohou v souboru změněném v pull requestu jde otevřít v diffu (záložka Files se přepne na jeden soubor a posune na řádek). V diffu nese komentář draftu popisek jako Warning · Likely. Citát, poznámka, úryvek i data neznámého důkazu se vykreslují jako prostý text. Změna závažnosti se nabízí jen proti hostiteli se schopností azure-devops-review.findings.v1. Lokalizace: 32 klíčů v en, es, fr, ja, ko, zh. Typy nálezu draftu jsou v src/shared/azure-devops-review-draft-finding-types.ts, aby azure-devops-review-types.ts zůstal pod 300 řádky.

Stav 4/4 (dokumentace a ověření): decision-10 (model nálezu, druhy důkazu, pravidla jistoty, ověření citace, hranice důvěry, úložiště a starší sestavení), docs/review-ide/06-ai-a-review.md bod 7 (Stav po TASK-84) a 05-funkce.md oddíl 5. e2e tests/e2e/pull-request-draft-findings.spec.ts na smyšleném pull requestu ve skrytém okně s izolovaným HOME; snímky v ~/.cache/orca-review-ide/task-84 (01-draft-cards-with-findings.png, 02-evidence-expanded.png, 03-diff-opened-at-evidence.png).

Dokončení: Otevření důkazu v diffu čeká na spočítaný diff a dva snímky, protože sdílený prohlížeč diffu po spočítání sám posune na první změnu a dřívější posun by přebil (zachyceno e2e, kryto testem use-azure-devops-review-diff-reveal.test.tsx). Ověření na konečném kódu: pnpm tc, mobile pnpm typecheck, vitest 80 souborů a 688 testů, brána změněného kódu, oxlint 53 souborů, oxfmt --check, katalog RPC, lokalizace; e2e pull-request-*.spec.ts třikrát (8 z 8, dvakrát 7 z 8). Jediné selhání je pull-request-thread-tracking.spec.ts (The element is not laid out): spec z TASK-76 měří řádek Monaca hned po přepnutí záložky a padá i nad sestavením HEAD bez změn tohoto tiketu (6 z 12 opakování, s tímto tiketem 4 z 12).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Draft nálezu od AI teď nese závažnost (error, warning, suggestion, nit), důkazy a odvozenou jistotu. Agent je ukládá přes MCP, Pi rozšíření i orca ado draft create a update; neplatný vstup vrátí chybu, která jmenuje pole a pravidlo. Jediný druh důkazu v tomto tiketu je citace kódu: hostitel ji při každém čtení porovná s obsahem souboru na commitu draftu (jen commity iterací pull requestu, strop požadavků z TASK-76). Bez důkazu je nález nejistý, se sedící citací pravděpodobný, s nesedící vyvrácený s ukázkou skutečného kódu; ověřeno důkazem z citace nikdy nevznikne. Karta draftu i diff ukazují závažnost a jistotu, karta úryvek komentovaného kódu a rozbalitelné důkazy s otevřením v diffu; uživatel může závažnost změnit a ručně psaný draft jistotu neukazuje. Prompt AI review žádá závažnost a důkaz. Publikuje se dál jen text draftu. Nová pole jsou nepovinná, neznámý druh důkazu se zachová a zobrazí jako neověřený, změna závažnosti je vyjednaná schopnost hostitele. Starší sestavení Orky nad stejným úložištěm drafty nechá, ale při přepisu z nich zahodí závažnost a důkazy. Model, druhy důkazu a pravidla jistoty popisuje decision-10. Ověřeno testy sdíleného kódu, hostitele, nástrojů agenta, protokolu a karty a e2e ve skrytém okně na smyšleném pull requestu; skutečný agent ani Azure DevOps se nepoužily a otisk uživatelova úložiště draftů je beze změny. Známé: jistotu mají i odpovědi agenta ve vláknech, kde o důkaz nikdo nežádá (TASK-118); mobil nová pole přenáší, ale nezobrazuje; důkaz v souboru, který pull request nemění, otevřít nejde. Při práci worker nechtěně nechal pnpm přepsat 30 spouštěcích skriptů v node_modules/.bin a opravil je; kontrola nenašla žádný odkaz mimo checkout a brány poté prošly.
<!-- SECTION:FINAL_SUMMARY:END -->
