---
id: TASK-81
title: 'Brány forku: runtime katalog lokalizace a tři padající testy markdown editoru'
status: Done
assignee: []
created_date: '2026-11-18T14:40:00Z'
updated_date: '2026-11-18T22:30:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
priority: medium
type: bug
ordinal: 15700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Akceptace milníku spouští celé brány (`pnpm tc`, `pnpm test`, `pnpm lint`). Dvě z nich padají už na commitu před Review IDE, takže by akceptaci M1 zablokovaly nebo by se jejich selhání začala přehlížet.

### Rozsah

- `src/renderer/src/i18n/en-runtime-required.json` nepokrývá `en.json`: chybí 43 klíčů `components.right-sidebar.gitGraph.*` ze seznamu větví a úklidu sloučených větví. Oprava: `pnpm run sync:localization-runtime-catalog`. Worker TASK-61 hlásí i selhání `verify:localization-catalog`, `-coverage` a `-extraction` na klíčích `azureDevOpsReview.*` a `gitGraph.*`; zjistit příčinu u každého.
- `src/renderer/src/components/editor/`: `markdown-preview-table-chunks.test.ts`, `rich-markdown-details-keyboard.test.ts`, `rich-markdown-escape-fidelity.test.ts` padají samostatně (například podtržítko mezi znaky mimo základní rovinu Unicode se escapuje). Soubory jsou z upstreamu a Review IDE je neměnilo; zjistit, jestli jde o chybu forku, upstreamu, nebo běhového prostředí testů.

### Rozhodnuto uživatelem (2026-11-18, decision-5)

Opravit teď.
### Omezení

- Katalogy nepřepisovat hromadně; po úpravě zkontrolovat `git diff`.
- Testy z upstreamu neupravovat tak, aby jen prošly; když je chyba v upstreamu, zapsat to a test nechat.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm run verify:localization-catalogs prochází
- [x] #2 Testy markdown-preview-table-chunks, rich-markdown-details-keyboard a rich-markdown-escape-fidelity prochází, nebo je doloženo, že padají i na upstreamu, a je zapsané proč
- [x] #3 Změna se netýká textů ani chování mimo chybějící klíče a opravené testy; git diff katalogů obsahuje jen doplněné klíče
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Doplněno z TASK-63 (2026-11-18): verify:localization-catalogs hlásí i chybějící klíče azureDevOpsReview.feedback*, addressFeedback* a openOwnInWorkspaceHint v en.json; jazyky es, fr, ja, ko a zh neměly blok azureDevOpsReview vůbec (TASK-63 do něj přidal jen svých 10 klíčů). Mimo brány: config/tsconfig.e2e.json hlásí stovky starších typových chyb a není součástí pnpm tc; jen zaznamenat, neopravovat bez rozhodnutí.

Plán: 1) en.json doplnit 11 klíčů azureDevOpsReview (sync:localization-catalog), runtime katalog (sync:localization-runtime-catalog), zkontrolovat diff. 2) Spočítat chybějící klíče v es/fr/ja/ko/zh vlastním skriptem, oddělit mezery z upstreamu (chybí i na main) od mezer forku, přeložit mezery forku a vložit skriptem na místo podle pořadí en.json. 3) Zjistit příčinu pádu tří testů markdown editoru proti main. 4) Zjistit příčinu verify:localization-coverage.

Hotovo: en.json +11 klíčů azureDevOpsReview (sync:localization-catalog, jen přidané řádky), en-runtime-required.json +45 klíčů (44 gitGraph + menu.pullRequests, jen přidané řádky); verify:localization-catalogs, -catalog, -runtime-catalog a -extraction procházejí. Testy markdown editoru: příčina je prostředí, nainstalovaný Bun 1.3.8 místo připnutého 1.4.2 (config/.bun-version, stejné na main); s Bun 1.4.2 všech 80 testů prochází opakovaně, s 1.3.8 escape-fidelity deterministicky padá na 𐐀_𐐁 a table-chunks/details-keyboard končí pádem procesu (exit 133). Kód ani testy se nemění. Zbývá: překlady 702 chybějících klíčů forku do es/fr/ja/ko/zh (202 mezer upstreamu se nechávají).

Hotovo: překlady 702 klíčů forku do es/fr/ja/ko/zh vložené skriptem na místo podle pořadí en.json (žádná existující hodnota se nezměnila, odebrané řádky jsou jen doplněné čárky). ja prošla politikou repairTranslatedValue (Agent a PR latinkou), jinak by verify hlásilo generic term regressions. Zbývá mimo tiket: 202 (fr 201, zh 190) mezer, které chybí i na main = upstream; verify:localization-coverage padá na 5 starších textech forku (native-chat, azure-devops-review-agent-bridge), navržen navazující tiket. Testy markdown editoru: nutný Bun 1.4.2 podle config/.bun-version, ruční krok uživatele.

Převzetí (koordinátor, 2026-11-18): worker navíc přeložil 702 chybějících klíčů do každého z pěti jazyků (starší funkce forku i mimo Review IDE). Brána je nevyžaduje: chybějící překlad se jen vypíše a text spadne na angličtinu. Překlady proto nejsou součástí commitu; leží mimo repozitář v ~/.cache/orca-review-ide/task-81 (translations.patch proti commitu této opravy, added-<jazyk>.json s klíči a hodnotami, skripty workera) a čekají na rozhodnutí uživatele, jestli je fork má nést.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Brána verify:localization-catalogs prochází: do en.json přibylo 11 klíčů azureDevOpsReview.* z výchozích textů v kódu a do runtime katalogu 44 klíčů gitGraph.* a menu.pullRequests; žádná existující hodnota se nezměnila. Tři testy markdown editoru nepadají kvůli kódu forku ani upstreamu, ale kvůli verzi Bunu: na počítači je 1.3.8, repozitář připíná 1.4.2 (config/.bun-version). S Bunem 1.4.2 staženým do ~/.cache/orca-review-ide/tools procházejí všechny tři soubory (80 testů), s 1.3.8 padají; kód ani testy se neměnily. Brány proto pouštět s PATH na připnutý Bun, nebo po povýšení globálního Bunu uživatelem. Překlady 702 starších klíčů do pěti jazyků, které worker napsal navíc, nejsou v commitu a čekají na rozhodnutí uživatele. Zbývá: verify:localization-coverage (součást pnpm lint) padá na pěti nelokalizovaných textech, řeší TASK-110. Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
