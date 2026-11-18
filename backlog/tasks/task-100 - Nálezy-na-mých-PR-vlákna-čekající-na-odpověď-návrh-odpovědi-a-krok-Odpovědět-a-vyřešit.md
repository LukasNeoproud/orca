---
id: TASK-100
title: >-
  Nálezy na mých PR: vlákna čekající na odpověď, návrh odpovědi a krok Odpovědět
  a vyřešit
status: To Do
assignee: []
created_date: '2026-11-18T15:23:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
priority: high
type: feature
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Autor pull requestu dnes vidí připomínky reviewerů v obecné záložce vláken smíchané s vyřešenými, návrhy odpovědí od agenta má v jiné záložce a odpověď s uzavřením vlákna skládá z výběru draftu a publikace. Na vlastním pull requestu má být jeden pohled: co čeká na mou odpověď, návrh odpovědi u vlákna a jeden krok Odpovědět a vyřešit.

### Rozsah

- Co už existuje: na vlastním otevřeném pull requestu (`createdByMe` v `src/shared/azure-devops-review-types.ts`) stránka spouští agenta ve workspace větve autora (`openAzureDevOpsFeedbackWorkspace` v `src/renderer/src/lib/azure-devops-feedback-agent.ts`, `src/main/azure-devops/review/azure-devops-feedback-worktree.ts`), dialog `AzureDevOpsFeedbackDialog.tsx` vybírá vlákna a prompt `src/shared/azure-devops-feedback-prompt.ts` žádá opravy a drafty odpovědí se stavem vlákna. Publikace draftu odpovědi umí odpověď i změnu stavu vlákna (`publishAzureDevOpsReviewDrafts`).
- Pravidlo „čeká na odpověď“: otevřené vlákno, jehož poslední nesystémový komentář nenapsal autor pull requestu. Patří vedle `openAzureDevOpsFeedbackThreads` ve sdíleném kódu.
- Pohled na stránce vlastního pull requestu (`src/renderer/src/components/azure-devops-review/AzureDevOpsPullRequestPage.tsx`, `AzureDevOpsReviewThreads.tsx`): čekající vlákna nahoře s počtem, draft odpovědi pod vláknem (`AzureDevOpsDraftComposer.tsx`), volba stavu, kroky Odpovědět a Odpovědět a vyřešit.
- Volba promptu „jen navrhnout odpovědi, kód neměnit“.

### Mimo rozsah

- Změna kódu od agenta u jednoho vlákna, její diff a krok Commitnout, odpovědět a vyřešit: navazující tiket.
- Akce Odpovědět na nálezy na řádku seznamu pull requestů: tiket o seznamu.
- Odkazy z vlákna do lokalizace a navigačního grafu (M5, M6) a na celek v Change review.
- Komentáře pull requestů GitHubu a GitLabu; ty mají vlastní tok (`src/renderer/src/components/pr-comments-resolution-prompt.ts`).

### Omezení

- Nic se neodešle bez potvrzení uživatele; agent nepublikuje a neuzavírá vlákna.
- Text vláken je nedůvěryhodný vstup pro agenta i pro rozhraní.
- Při vývoji do Azure DevOps nic nezapisuj; testy proti smyšleným odpovědím (vzor `tests/e2e/pull-request-review-groups.spec.ts`).
- Texty v šesti jazycích, vzhled podle `docs/STYLEGUIDE.md`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Na vlastním otevřeném pull requestu ukazuje stránka počet vláken čekajících na odpověď a jejich seznam se souborem a řádkem; vyřešená vlákna a vlákna, kde poslední odpověď je moje, v seznamu nejsou
- [ ] #2 Draft odpovědi je vidět přímo pod svým vláknem, jde upravit a zahodit; draft od agenta je označený jako návrh AI
- [ ] #3 Odpovědět a vyřešit po potvrzení, které ukáže odesílaný text, odešle odpověď a uzavře vlákno jedním krokem; Odpovědět odešle jen odpověď; při selhání draft zůstane uložený a uživatel vidí důvod
- [ ] #4 Navrhnout odpovědi s AI spustí agenta ve workspace větve pull requestu s volbou neměnit kód; agent založí drafty odpovědí a nic nepublikuje ani neuzavírá
- [ ] #5 Z vlákna jde otevřít komentované místo v diffu pull requestu
- [ ] #6 Na cizím pull requestu se stránka chová jako dosud
- [ ] #7 Pravidlo čeká na odpověď je čistá sdílená funkce s testy: poslední komentář můj, systémové komentáře, vlákno bez místa v kódu, stav pending
- [ ] #8 Starší mobilní klient dál čte a publikuje drafty odpovědí; pohled je ověřený ve skrytém okně proti smyšlenému serveru se snímkem
<!-- AC:END -->
