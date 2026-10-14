---
id: TASK-40
title: 'Dokončit událost konce kompozice Android IME'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/patches/react-native@0.83.10.patch
  - mobile/src/terminal/use-terminal-live-pending-input-flush.ts
priority: high
type: bug
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Android IME může dokončit kompozici odstraněním composing span bez změny viditelného textu. React Native watcher pak neodešle `onChange` s `isComposing: false`; terminál drží hotový znak jako preedit neomezeně dlouho. Patch musí oznámit dokončení i v tomto případě a nesmí dokončit stále aktivní kompozici.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Native wrapper oznámí přechod composing span na dokončený stav i bez změny textu, včetně batch edit a změn přes `commitText`.
- [ ] #2 React Native stav a event counter zůstanou synchronní a nevzniknou duplicitní závěrečné události.
- [ ] #3 Integrační test na skutečné Android softwarové klávesnici ověří dokončení japonštiny nebo korejštiny bez dalšího stisku.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Druhý review doplnil native signál po finishComposingText, commitText, setComposingText a ukončení vnějšího batch edit. Událost používá stejnou aktualizaci Fabric state a event counter jako textový watcher. Patch prošel kontrolou aplikovatelnosti na RN 0.83.10 a lockfile obsahuje jeho nový hash. TASK-45 zapíná Android source build, bez kterého se patch do APK nedostal. TASK-47 opravuje JS zpracování dokončeného jednoznakového preedit.

Kompilace zdrojového ReactAndroid přes `:react-native:packages:react-native:ReactAndroid:compileDebugKotlin --offline` skončila při konfiguraci: v lokální cache chybí Gradle plugin `com.android.library:8.12.0`. Kotlin kompilátor se nespustil.

Integrační ověření na skutečné softwarové klávesnici dosud neproběhlo, proto task zůstává otevřený a native acceptance criteria nejsou označena jako dokončená.
<!-- SECTION:NOTES:END -->
