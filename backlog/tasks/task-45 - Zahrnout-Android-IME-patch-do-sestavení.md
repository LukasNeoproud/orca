---
id: TASK-45
title: 'Zahrnout Android IME patch do sestavení'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/app.json
priority: medium
type: bug
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Android používá předkompilovaný React Native AAR. Kotlin změny v patchi node_modules se proto nedostávají do APK a události neobsahují isComposing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Opravit potvrzený scénář a ověřit cílenou regresní kontrolou.

<!-- AC:END -->

## Implementation Notes

Expo build-properties nyní generuje dependency substitution na ReactAndroid ze zdrojů. Regresní test používá skutečný generátor Gradle konfigurace. Ověření celého nativního buildu a klávesnice je sledováno v TASK-40.
