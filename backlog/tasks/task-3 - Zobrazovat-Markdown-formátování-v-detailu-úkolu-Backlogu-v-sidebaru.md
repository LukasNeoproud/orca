---
id: TASK-3
title: Zobrazovat Markdown formátování v detailu úkolu Backlogu v sidebaru
status: To Do
assignee: []
created_date: '2026-09-16 13:49'
labels: []
dependencies: []
references:
  - src/renderer/src/components/right-sidebar/BacklogPanel.tsx
  - src/renderer/src/components/sidebar/CommentMarkdown.tsx
  - src/renderer/src/components/right-sidebar/BacklogPanel.test.tsx
type: bug
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ověřeno statickou kontrolou: BacklogPanel.tsx vykresluje detail.description v odstavci a criterion.text ve span s whitespace-pre-wrap. Markdown značky se tedy zobrazují jako prostý text místo formátovaného obsahu. Doplnit čitelné Markdown zobrazení popisu a textu akceptačních kritérií. Prověřit opětovné použití existujícího CommentMarkdown, který se již používá v sidebaru. Zachovat detail pouze pro čtení, stav splnění kritérií, existující obsluhu odkazů a pravidla design systému.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Popis úkolu vykresluje nadpisy, odstavce, tučné a kurzivní písmo, seznamy, odkazy, inline kód a bloky kódu jako Markdown.
- [ ] #2 Text akceptačních kritérií podporuje Markdown a zároveň zachovává viditelný stav splnění každého kritéria.
- [ ] #3 Dlouhé odkazy a bloky kódu neroztahují šířku sidebaru; obsah zůstává čitelný při úzkém panelu.
- [ ] #4 Použije se vhodný existující Markdown renderer a obsluha odkazů; surové HTML ani nebezpečná URL nespouštějí skripty.
- [ ] #5 Testy pokrývají formátovaný popis, formátované kritérium, obyčejný text a prázdný popis.
<!-- AC:END -->
