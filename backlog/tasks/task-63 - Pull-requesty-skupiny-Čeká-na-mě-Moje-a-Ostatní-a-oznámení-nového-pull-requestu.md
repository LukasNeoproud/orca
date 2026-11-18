---
id: TASK-63
title: >-
  Pull requesty: skupiny Čeká na mě, Moje a Ostatní a oznámení nového pull
  requestu
status: Done
assignee: []
created_date: '2026-11-18T12:43:00Z'
updated_date: '2026-11-18T15:03:00Z'
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
- [x] #1 Panel Pull requests dělí seznam na Čeká na moje review, Moje pull requesty a Ostatní a u každé skupiny ukazuje počet
- [x] #2 Rychlý filtr Vše, Čeká na mě a Moje jde kombinovat se stávajícími filtry projektu, repozitáře a stavu
- [x] #3 Řádek nabízí hlavní akci podle situace: Provést review u nového pull requestu, Pokračovat v review, když k němu existují drafty
- [x] #4 Nový pull request, kde je uživatel reviewerem, je v seznamu označený, dokud ho uživatel neotevře
- [x] #5 Nový pull request vyvolá jedno systémové oznámení s akcí, která otevře review; po restartu aplikace se pro stejný pull request neopakuje
- [x] #6 Oznámení respektuje nastavení oznámení a stav nepřítomnosti u počítače
- [x] #7 Načtení seznamu nepřidává požadavek na každý pull request zvlášť
- [x] #8 Spárovaný Android se starší verzí aplikace seznam dál zobrazí
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker 2026-11-18):
1. shared: skupiny (awaiting-my-review / mine / other), rychlý filtr involvement a hlavní akce řádku jako čisté funkce v src/shared/azure-devops-review-filters.ts + testy.
2. renderer: panel se skupinami a počty, přepínač Vše / Čeká na mě / Moje, řádek s hlavní akcí a značkou Nový; stav 'nový a neotevřený' a 'už oznámeno' perzistentně ve store azure-devops-auto-review.
3. oznámení: nový zdroj 'review-request' ve stávající doručovací službě (jen desktop, bez mobilního fan-outu), klik otevře stránku pull requestu; odesílá ho stávající kontrola nových PR, žádný nový dotaz. Při nepřítomnosti u počítače se odloží do návratu.
4. lokalizace (6 jazyků), testy, tc, kontrola kvality, ověření ve skrytém okně (electron-headless).

Hotovo (nepřeloženo do UI): sdílená logika skupin (src/shared/azure-devops-review-groups.ts), pole involvement ve filtrech, zdroj oznámení 'review-request' v doručovací službě + klik (main/notifications/review-request-notification.ts, native-notification-delivery), preload most reviewRequests, renderer: store unopened/announced, odeslání oznámení s odkladem při nepřítomnosti (lib/azure-devops-review-request-notification.ts), napojení v kontrole. pnpm tc prochází. Zbývá: panel (skupiny, přepínač, řádek s akcí a značkou), lokalizace, testy, kontrola kvality, e2e ve skrytém okně.

Hotovo: panel se skupinami, přepínač, řádek s akcí a značkou Nový, lokalizace v 6 jazycích, jednotkové a komponentové testy (shared, main IPC, renderer). Zbývá: tc, kontrola kvality, e2e ve skrytém okně se snímkem, odškrtnutí AC, doplnění docs.

Dokončeno workerem 2026-11-18, čeká na ověření koordinátorem. tc, kontrola kvality, 139 souvisejících testů a e2e tests/e2e/pull-request-review-groups.spec.ts (electron-headless) prochází; snímky v ~/.cache/orca-review-ide/task-63/. Vědomá rozhodnutí: oznámení jde jen na desktop (ne na telefon), při nepřítomnosti čeká na návrat; obě akce řádku otevírají stránku PR. Skutečný systémový banner nebyl zobrazen (e2e nahrazuje IPC handler, aby nic nevyskakovalo na ploše).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Panel Pull requests dělí seznam na Čeká na moje review, Moje a Ostatní s počty a má rychlý filtr Vše / Čeká na mě / Moje, který se kombinuje s projektem, repozitářem, stavem a hledáním. Řádek nabízí Provést review (bez draftů) nebo Pokračovat v review (s nepublikovanými drafty); obě otevřou stránku pull requestu. Nový pull request čekající na review má značku Nový, dokud ho uživatel neotevře, a přijde k němu jedno systémové oznámení (klik nebo tlačítko pull request otevře), které se po restartu neopakuje, řídí se nastavením oznámení a při nepřítomnosti počká na návrat. Na telefon se neposílá a nevznikají žádné nové dotazy na Azure DevOps. Ověřeno testy a e2e ve skrytém okně proti smyšlenému serveru; skutečný systémový banner, Windows, Linux a skutečné Azure DevOps ověřeny nebyly. Otevřené otázky pro uživatele jsou v TASK-82.
<!-- SECTION:FINAL_SUMMARY:END -->
