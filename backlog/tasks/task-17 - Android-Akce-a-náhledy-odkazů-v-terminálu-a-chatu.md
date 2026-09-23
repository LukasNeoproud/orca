---
id: TASK-17
title: 'Android: Akce a náhledy odkazů v terminálu a chatu'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 11:49'
labels: []
dependencies: []
references:
  - mobile/src/session/mobile-file-tap-open.ts
  - mobile/src/components/MobileMarkdown.tsx
  - mobile/src/terminal/TerminalWebView.tsx
  - src/renderer/src/components/link-actions/LinkPreviewPopover.tsx
priority: high
type: feature
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Desktop sjednotil akce nad odkazy v chatu a terminálu. Mobil už umí rozpoznat cesty a otevřít soubor na execution hostu, ale uživatel nemůže pohodlně zkopírovat cestu, zobrazit náhled nebo vybrat cíl otevření. Dotykové ovládání musí zachovat funkční výběr textu v terminálu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Odkaz na soubor v terminálu i chatu nabízí otevření, dostupný náhled, kopírování cesty a přidání cesty do zprávy; prosté klepnutí nadále funguje.
- [ ] #2 Webové odkazy z chatu používají stejnou volbu mezi prohlížečem telefonu a prohlížečem Orcy jako odkazy z terminálu.
- [ ] #3 Cesta se ověřuje na execution hostu včetně SSH a folder workspace; neznámý nebo odpojený host se nepřekládá na podobnou lokální cestu.
- [ ] #4 Nabídka je použitelná dotykem i přístupností a dlouhé podržení nerozbije výběr textu ani vstup terminálu.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Znovu použít existující řešení cesty na execution hostu. 2. Doplnit mobilní nabídku náhledu, otevření, kopírování a vložení do zprávy a sjednotit směrování webových odkazů. 3. Ověřit dotykové gesto, přístupnost, výběr textu a SSH chybové stavy.
<!-- SECTION:PLAN:END -->
