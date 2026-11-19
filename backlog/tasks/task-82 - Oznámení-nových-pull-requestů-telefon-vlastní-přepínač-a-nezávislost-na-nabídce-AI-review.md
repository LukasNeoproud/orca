---
id: TASK-82
title: >-
  Oznámení nových pull requestů: telefon, vlastní přepínač a nezávislost na
  nabídce AI review
status: To Do
assignee: []
created_date: '2026-11-18T15:03:00Z'
updated_date: '2026-11-19T11:41:00Z'
labels:
  - review-ide
  - effort-high
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

### Rozhodnuto uživatelem (2026-11-18, decision-5)

1. Oznámení na telefon neodchází; zůstává jen na počítači. Mobilní aplikace se nemění a nový zdroj oznámení se pro telefon nevyjednává.
2. Oznámení a značka Nový jsou nezávislé na nabídce AI review: kontrola běží i při vypnuté nabídce.
3. Provést review na řádku dál otevírá stránku pull requestu.
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Odpověď uživatele 2026-11-19 (decision-12): přes push bránu upstreamu se nic neprověřuje ani neposílá. Uživatel chce návrh oznámení na telefon bez push serveru upstreamu: nový pokus.
<!-- SECTION:NOTES:END -->
