---
id: TASK-26
title: 'Android: Obrazové diff review s poznámkami k oblastem'
status: To Do
assignee: []
created_date: '2026-09-23 10:50'
labels: []
dependencies:
  - TASK-15
references:
  - mobile/src/session/mobile-diff-review-rpc.ts
  - mobile/src/components/MobileDiffReviewBody.tsx
  - src/shared/diff-comment-types.ts
priority: medium
type: feature
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Desktop dovoluje komentovat oblast změněného obrázku. Android v souborové záložce ukazuje jen výsledný obrázek a samostatná review obrazovka zahazuje binární diff payload. Po ochraně datového kontraktu je potřeba přidat srozumitelné dotykové review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Review zobrazuje původní a změněný obrázek včetně nového či smazaného souboru, zoomu a čitelného stavu při nedostupném obsahu.
- [ ] #2 Uživatel může vybrat oblast, zpřesnit souřadnice přístupným ovládáním a poznámku vytvořit, upravit a odstranit.
- [ ] #3 Poznámka uchovává procentní oblast nezávisle na zoomu a po obnovení je viditelná na správném obrázku; odeslání agentovi uvádí přesnou oblast.
- [ ] #4 Binární payload je omezen a testy zahrnou SSH, reconnect a kompatibilitu s poznámkami z desktopu.
<!-- AC:END -->
