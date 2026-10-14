---
id: TASK-27
title: 'Android: Bohatší náhledy souborů v chatu'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 12:43'
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

- [x] #1 První mobilní karta umí bezpečně zobrazit podporovaný text, Markdown, HTML a rastrový obrázek bez nahrazení běžného otevření souboru.
- [x] #2 Uživatel pozná aktuální obsah od historického textu zprávy; soubor mimo workspace vyžaduje vědomé načtení a nedostupný host nevede k lokálnímu souboru.
- [x] #3 Velké, binární, chybějící a změněné soubory mají čitelné stavy a obnovení; další formáty se přidávají jen s ověřeným rendererem.
- [x] #4 Náhled nepřidává neomezené čtení, stahování nebo sledování souborů přes mobilní oprávnění.

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

Build on TASK-17 link actions: add bounded contextual preview card for safe text/Markdown/HTML/raster, execution-host RPC reads, explicit outside-workspace load, stale/missing/large/binary states, focused UI/transport tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Contextual chat-link card previews text, Markdown, sandboxed HTML and raster content via execution-host RPC. Outside-workspace reads require explicit Load Preview; reload is manual, current-vs-historical content is indicated, and unavailable/large/binary/decode states have Retry. Existing Open/Preview/Copy/Add actions remain. Focused suite 75 tests, typecheck, lint, format, diff and max-lines checks passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->

Added execution-host contextual previews for chat links with explicit outside-workspace consent.
<!-- SECTION:FINAL_SUMMARY:END -->
