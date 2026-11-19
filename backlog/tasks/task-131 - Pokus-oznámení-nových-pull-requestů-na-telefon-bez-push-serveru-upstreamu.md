---
id: TASK-131
title: 'Pokus: oznámení nových pull requestů na telefon bez push serveru upstreamu'
status: To Do
assignee: []
created_date: '2026-11-19T11:46:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
type: spike
ordinal: 229700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Uživatel chce oznámení nového pull requestu i na telefonu, ale bez push brány provozované upstreamem (decision-12). Pokus má navrhnout cestu, která nic nepošle přes servery upstreamu, a doporučit jednu variantu.

### Rozsah

- Jak se dnes oznámení dostávají na telefon: `src/main/notifications/notification-delivery-service.ts`, push brána a mobilní aplikace v `mobile/`; co přesně by odcházelo a kudy.
- Varianty k posouzení, aspoň: (a) mobilní aplikace drží spárované spojení s Orkou a oznámení zobrazí sama jako místní oznámení (Android služba v popředí, chování iOS na pozadí); (b) vlastní projekt Firebase Cloud Messaging uživatele (data jdou přes Google, ne přes upstream); (c) samostatně hostovaná brána typu ntfy; (d) jen e-mail nebo jiný kanál, který uživatel už má.
- U každé varianty: co a kudy odchází, spotřeba baterie, spolehlivost doručení při zavřené aplikaci, náklady a provoz, práce na desktopu a v mobilní aplikaci, rozdíl Android a iOS.

### Mimo rozsah

- Implementace; jen záznam rozhodnutí a návrh tiketů.
- Jakékoli odeslání oznámení nebo dat mimo počítač během pokusu.

### Omezení

- Jen čtení kódu a veřejné dokumentace; nic se neodesílá a nic se neinstaluje na zařízení.
- Výsledek je otázka na uživatele: co smí odcházet a kudy rozhoduje on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Záznam rozhodnutí popisuje aspoň čtyři varianty s tím, co a kudy odchází, spolehlivostí doručení, baterií, náklady a prací na desktopu i v mobilní aplikaci
- [ ] #2 Záznam doporučí jednu variantu a navrhne tikety pro ni; otázky pro uživatele mají možnosti a doporučení
- [ ] #3 Během pokusu nic neodešlo mimo počítač; pokus vychází jen z kódu a veřejné dokumentace
<!-- AC:END -->
