---
id: TASK-82
title: >-
  Oznámení nových pull requestů: telefon, vlastní přepínač a nezávislost na
  nabídce AI review
status: To Do
assignee: []
created_date: '2026-11-18T15:03:00Z'
labels:
  - review-ide
  - effort-high
  - ceka-na-uzivatele
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
priority: low
type: feature
ordinal: 229000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-63 dodal oznámení nového pull requestu jen na desktopu a navázal ho na stávající kontrolu, která nabízí AI review. Tři věci zůstaly na rozhodnutí uživatele a jedna drobnost na dodělání.

### Rozsah

- `src/main/notifications/notification-delivery-service.ts`: zdroj `review-request` se dnes na telefony neposílá; push brána přijímá jen pevnou sadu zdrojů.
- `src/renderer/src/lib/azure-devops-review-request-notification.ts` a `azure-devops-auto-review-check.ts`: oznámení i značka Nový závisí na volbě „nabízet AI review nových pull requestů“.
- Nastavení oznámení: samostatný přepínač pro pull requesty.
- Označení nového pull requestu i při obnově panelu (`src/renderer/src/store/azure-devops-auto-review.ts`).

### Čeká na uživatele

1. Má oznámení při nepřítomnosti jít na telefon? Ne (dnes): nic neopouští počítač, o pull requestu se dozvíte až u počítače. Ano: název pull requestu, repozitář a autor půjdou přes push bránu provozovanou upstreamem a je potřeba upravit i mobilní aplikaci. Doporučení: ne, dokud nerozhodnete, že tato data smějí ven.
2. Má být oznámení nezávislé na nabídce AI review? Ne (dnes): vypnutím nabídky přijdete i o oznámení a značku Nový. Ano: kontrola poběží vždy, tedy pravidelné dotazy na Azure DevOps i při vypnuté nabídce. Doporučení: ano.
3. Co má dělat Provést review na řádku? Otevřít stránku pull requestu (dnes), nebo rovnou dialog AI review. Doporučení: nechat stránku.

### Omezení

- Bez rozhodnutí v bodě 1 nic neposílat mimo počítač.
- Klient a hostitel se aktualizují nezávisle: nový zdroj oznámení musí být vyjednaný.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Podle rozhodnutí uživatele oznámení nového pull requestu buď dál zůstává jen na počítači, nebo při nepřítomnosti odejde na spárovaný telefon; dokumentace odpovídá
- [ ] #2 Nastavení má samostatný přepínač oznámení o pull requestech, nezávislý na hlavním vypínači ostatních zdrojů
- [ ] #3 Značka Nový a oznámení fungují i s vypnutou nabídkou AI review, pokud to uživatel potvrdí; počet dotazů na Azure DevOps je doložený
- [ ] #4 Nový pull request se označí už při ruční obnově panelu, ne až při pravidelné kontrole
- [ ] #5 Starší mobilní klient a starší hostitel dostanou platné zprávy; nový zdroj oznámení je vyjednaný, ne tiše zahozený
<!-- AC:END -->
