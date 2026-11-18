---
id: TASK-63
title: >-
  Pull requesty: skupiny Čeká na mě, Moje a Ostatní a oznámení nového pull
  requestu
status: To Do
assignee: []
created_date: '2026-11-18T12:43:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
priority: high
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Nepropásnout nový pull request k review a vidět na první pohled, co čeká na mě a co je moje.

### Rozsah

- Panel `src/renderer/src/components/right-sidebar/AzureDevOpsPullRequestsPanel.tsx` a filtry v `src/shared/azure-devops-review-filters.ts`.
- Kdo je autor a kdo reviewer už seznam nese (`createdByMe`, `reviewRequested`, `myVote`, `draftCounts` v `src/shared/azure-devops-review-types.ts`).
- Nové pull requesty dnes nabízí jen toast uvnitř aplikace (`src/renderer/src/lib/azure-devops-auto-review-check.ts`, výběr v `src/shared/azure-devops-auto-review.ts`). Doplň systémové oznámení přes stávající službu (`src/main/notifications`, `window.api.notifications`). Toast zůstává.

### Mimo rozsah

- Stav kontrol a počet nevyřešených vláken na řádku, pokud je seznam dnes nenese; akce Odpovědět na nálezy a Otevřít chybu přijdou v M2.
- Změny rozhraní mobilní aplikace.
- Přesun panelu do levého sidebaru (M7).

### Omezení

- Seznam čte i spárovaný telefon. Nová pole jen nepovinná; nic, co starší klient odmítne.
- Obecné pojmy review nepojmenovávej podle Azure DevOps ani GitHubu, pokud nejsou specifické pro poskytovatele.
- Šetři limity API: žádné nové dotazy v intervalu kontroly nových pull requestů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Panel Pull requests dělí seznam na Čeká na moje review, Moje pull requesty a Ostatní a u každé skupiny ukazuje počet
- [ ] #2 Rychlý filtr Vše, Čeká na mě a Moje jde kombinovat se stávajícími filtry projektu, repozitáře a stavu
- [ ] #3 Řádek nabízí hlavní akci podle situace: Provést review u nového pull requestu, Pokračovat v review, když k němu existují drafty
- [ ] #4 Nový pull request, kde je uživatel reviewerem, je v seznamu označený, dokud ho uživatel neotevře
- [ ] #5 Nový pull request vyvolá jedno systémové oznámení s akcí, která otevře review; po restartu aplikace se pro stejný pull request neopakuje
- [ ] #6 Oznámení respektuje nastavení oznámení a stav nepřítomnosti u počítače
- [ ] #7 Načtení seznamu nepřidává požadavek na každý pull request zvlášť
- [ ] #8 Spárovaný Android se starší verzí aplikace seznam dál zobrazí
<!-- AC:END -->
