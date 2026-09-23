---
id: TASK-27
title: 'Android: Bohatší náhledy souborů v chatu'
status: To Do
assignee: []
created_date: '2026-09-23 10:50'
labels: []
dependencies:
  - TASK-17
references:
  - mobile/src/files/MobileFilePreviewBody.tsx
  - mobile/src/components/MobileMarkdown.tsx
  - src/renderer/src/components/native-chat/NativeChatFilePreviewContent.tsx
priority: low
type: feature
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Desktop zobrazuje u odkazů inline náhled kódu, dokumentů, obrázků a dalších formátů. Mobil dnes otevírá samostatný náhled souboru, ale nemá kontextovou kartu u zprávy. Náhledy musí zůstat omezené velikostí a číst soubor na správném hostu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 První mobilní karta umí bezpečně zobrazit podporovaný text, Markdown, HTML a rastrový obrázek bez nahrazení běžného otevření souboru.
- [ ] #2 Uživatel pozná aktuální obsah od historického textu zprávy; soubor mimo workspace vyžaduje vědomé načtení a nedostupný host nevede k lokálnímu souboru.
- [ ] #3 Velké, binární, chybějící a změněné soubory mají čitelné stavy a obnovení; další formáty se přidávají jen s ověřeným rendererem.
- [ ] #4 Náhled nepřidává neomezené čtení, stahování nebo sledování souborů přes mobilní oprávnění.
<!-- AC:END -->
