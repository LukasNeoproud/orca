---
id: TASK-13
title: Sjednotit náhledy odkazů a akce otevření v chatu a terminálu
status: Done
assignee: []
created_date: '2026-09-21 11:09'
updated_date: '2026-09-21 11:09'
labels: []
dependencies: []
references:
  - src/renderer/src/components/link-actions/LinkPreviewPopover.tsx
  - src/renderer/src/components/native-chat/use-native-chat-link-actions.ts
type: feature
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Dokončená implementace schváleného prototypu: spojit náhled odkazu s akcemi otevření a zpřístupnit náhledy také v terminálu. Zahrnout následné opravy scrollování kódu a zachování otevřeného náhledu při aktualizaci konverzace.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Náhled obsahuje akce otevření, kopírování a rozbalení; společné zobrazení je zapojené do chatu i terminálu.
- [x] #2 Náhled kódu používá jedinou scrollovací plochu bez dvojitého vertikálního scrollbaru.
- [x] #3 Náhled v konverzaci přežije novou zprávu, automatický scroll a odpojení zdrojového odkazu; lze jej zavřít kliknutím mimo, křížkem nebo Escape.

<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Implementace: 393ade9f6. Oprava dvojitého scrollbaru: 1893537f9 (uživatelem potvrzena). Zachování náhledu při aktualizaci konverzace: 73feabab6. Poslední oprava ověřena 86 souvisejícími testy, tc:web a lintem. Měření tok/s není součástí tohoto úkolu; sleduje jej TASK-12.
<!-- SECTION:FINAL_SUMMARY:END -->
