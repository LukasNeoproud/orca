---
id: TASK-136
title: >-
  Testy terminal-link: chybějící revealInExplorer v mocku shazuje běh
  terminal-pane
status: Done
assignee: []
created_date: '2026-11-19T16:51:00Z'
updated_date: '2026-11-19T16:58:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
type: bug
ordinal: 16030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Vitest nad `src/renderer/src/components/terminal-pane` projde všech 5146 testů, ale končí kódem 1 kvůli třem unhandled rejection `store.revealInExplorer is not a function` v testech `terminal-link-*`. Padají i samostatně a pochází z commitu c5f3897e4c (zjištěno v TASK-135). Akceptace M1 pouští celé `pnpm test`.

### Rozsah

- Mocky store v testech `terminal-link-*`; když chyba ukazuje na skutečnou chybu v kódu, oprav kód a doplň test.

### Omezení

- Žádné potlačení unhandled rejection v konfiguraci vitestu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Vitest nad src/renderer/src/components/terminal-pane končí kódem 0 bez unhandled rejection
- [x] #2 Poznámky říkají, zda šlo jen o mock, nebo o chybu v kódu
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: příčina reprodukována (3 unhandled rejection v terminal-link-host-workspace-file, -same-id-ssh-file-host, -remote-runtime-ssh-open). Od c5f3897e4c jde adresář přes openTerminalDirectoryLink, který volá store.revealInExplorer a useAppStore.setState; mocky store v těchto testech mají jen getState bez revealInExplorer. Produkční store akci má (explorer-dir-state.ts), jde jen o mock. Oprava: v těch třech souborech namockovat ./terminal-directory-link-open a ověřit, že vzdálený adresář jde do průzkumníku Orky s canOpenWithSystemDefault false (samotné odhalení pokrývá terminal-directory-link-open.test.ts).

Hotovo. Šlo jen o mock, ne o chybu v kódu: produkční store má revealInExplorer (store/slices/editor/actions/explorer-dir-state.ts) a vzdálený adresář má podle c5f3897e4c jít do průzkumníku Orky. Tři testy (host-workspace-file, same-id-ssh-file-host, remote-runtime-ssh-open) teď mockují ./terminal-directory-link-open a ověřují, že adresář dostane s canOpenWithSystemDefault false a správným workspacem; samotné odhalení a rozbalení pokrývá terminal-directory-link-open.test.ts. Vitest nad terminal-pane: 548 souborů, 5146 testů, kód 0, bez unhandled rejection.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Šlo jen o mocky: od c5f3897e4c posílá openDetectedFilePath vzdálený adresář do openTerminalDirectoryLink, který volá store.revealInExplorer, a mocky store ve třech testech terminal-link ji neměly. Testy teď mockují terminal-directory-link-open a ověřují, že adresář dostane se správným workspace a hostitelem. Vitest nad terminal-pane končí kódem 0 (548 souborů, 5146 testů).
<!-- SECTION:FINAL_SUMMARY:END -->
