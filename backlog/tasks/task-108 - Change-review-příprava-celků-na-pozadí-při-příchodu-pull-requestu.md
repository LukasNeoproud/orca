---
id: TASK-108
title: 'Change review: příprava celků na pozadí při příchodu pull requestu'
status: To Do
assignee: []
created_date: '2026-11-18T15:27:00Z'
labels:
  - review-ide
  - effort-high
  - ceka-na-uzivatele
milestone: m-2
dependencies:
  - TASK-96
documentation:
  - docs/review-ide/05-funkce.md
  - docs/review-ide/01-integrace.md
priority: low
type: feature
ordinal: 230000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Když recenzent otevře pull request, mají být celky a komentáře AI už připravené, aby nečekal minuty na běh agenta. Dokumentace počítá s výpočtem na pozadí při příchodu pull requestu a s uložením podle commitu.

### Čeká na uživatele

Tiket spouští AI bez pokynu u každého příchozího pull requestu, a tím spotřebovává tokeny agenta uživatele a zakládá review worktree. O tom rozhoduje uživatel; otázka s možnostmi a doporučením je v poznámkách TASK-69 (otázka 1). Akceptační kritéria odpovídají doporučené variantě a po odpovědi se upraví.

### Rozsah

- Spouštěč: pravidelná kontrola nových pull requestů, která už nabízí AI review (`src/renderer/src/lib/azure-devops-auto-review-check.ts`, `src/renderer/src/components/azure-devops-review/AzureDevOpsAutoReviewHost.tsx`, stav v `src/renderer/src/store/azure-devops-auto-review.ts`).
- Běh na pozadí: stávající cesta `startAzureDevOpsReviewAgentInBackground` (`src/renderer/src/lib/azure-devops-review-agent.ts`, `azure-devops-review-background-run.ts`) s promptem pro celky z TASK-96.
- Nastavení: zapnutí, denní strop, strop velikosti diffu; stav přípravy u pull requestu.

### Mimo rozsah

- Automatické AI review s drafty nálezů (dnes se jen nabízí).
- Příprava celků pro vlastní workspace po každém commitu.
- Příprava na telefonu.

### Omezení

- Výchozí stav je vypnuto, dokud uživatel nerozhodne jinak.
- Kontrola nových pull requestů nesmí dostat další požadavky na Azure DevOps.
- Běh na pozadí nesmí ukázat okno ani přepnout workspace (pravidla Electron UI Validation v AGENTS.md platí i pro testy).
- SSH: review worktree a agent běží na hostiteli repozitáře.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Podle rozhodnutí uživatele se pro nový pull request, kde jsem reviewer, celky připraví na pozadí samy, nebo se nabídnou jedním kliknutím; bez zapnutí v nastavení se žádný běh AI sám nespustí
- [ ] #2 Běh na pozadí založí nebo použije review worktree pull requestu, nepřepne aktivní workspace a nevezme fokus
- [ ] #3 Při otevření pohledu Change review pro commit, pro který celky existují, jsou vidět hned; pro novější commit je nabídnuté obnovení
- [ ] #4 Nastavení má denní strop počtu běhů a strop velikosti diffu; pull request nad stropem se jen nabídne
- [ ] #5 Pro jeden commit pull requestu se běh nespustí dvakrát ani po restartu; draft pull request, vlastní pull request a pull request z forku se nezpracovávají
- [ ] #6 Běžící přípravu jde zrušit a její stav je vidět u pull requestu
- [ ] #7 Testy pokrývají rozhodování o spuštění, stropy a opakování; průchod je ověřený ve skrytém okně se smyšleným agentem a smyšleným serverem
<!-- AC:END -->
