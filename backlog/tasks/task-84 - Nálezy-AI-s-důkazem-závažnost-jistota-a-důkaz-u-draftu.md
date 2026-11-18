---
id: TASK-84
title: 'Nálezy AI s důkazem: závažnost, jistota a důkaz u draftu'
status: To Do
assignee: []
created_date: '2026-11-18T15:16:00Z'
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
- [ ] #1 Agent uloží k draftu závažnost a důkazy přes MCP, Pi rozšíření i orca ado draft create a update; neplatná závažnost nebo důkaz bez povinných polí vrátí chybu, kterou agent může opravit
- [ ] #2 Draft od agenta bez důkazu je na kartě i v diffu označený jako nejistý; s citací kódu, která sedí s obsahem souboru na commitu draftu, jako pravděpodobný; s citací, která nesedí, jako vyvrácený s vysvětlením
- [ ] #3 Jistota ověřeno důkazem z citace kódu nikdy nevznikne; odvození jistoty je čistá funkce ve sdíleném kódu s testem pro každou kombinaci
- [ ] #4 Karta draftu ukazuje závažnost, jistotu, úryvek komentovaného kódu a rozbalitelný seznam důkazů; důkaz s místem v kódu jde otevřít v diffu pull requestu
- [ ] #5 Uživatel může závažnost změnit; ručně psaný draft jistotu neukazuje
- [ ] #6 Prompt AI review žádá u každého nálezu závažnost a důkaz a říká, že nález bez důkazu bude označený jako nejistý
- [ ] #7 Publikovaný komentář obsahuje jen text draftu jako dosud
- [ ] #8 Starší mobilní klient i starší hostitel dál čtou, vytvářejí a publikují drafty; neznámý druh důkazu od novějšího protějšku se zachová a zobrazí jako neověřený
- [ ] #9 Katalog parametrů RPC je přegenerovaný, parametry draftů mají kontraktní test a karta je ověřená ve skrytém okně na smyšleném pull requestu
- [ ] #10 Záznam rozhodnutí popisuje model nálezu, druhy důkazu a pravidla jistoty; docs/review-ide/06-ai-a-review.md bod 7 uvádí stav po tomto tiketu
<!-- AC:END -->
