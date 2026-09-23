---
id: TASK-30
title: 'Android: Soukromé vydávání vlastního APK přes Firebase App Distribution'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-23 10:50'
updated_date: '2026-09-23 12:14'
labels: []
dependencies: []
references:
  - mobile/app.json
  - .github/workflows/mobile-android-release.yml
  - mobile/README.md
priority: medium
type: chore
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Vlastní Android klient má být instalovatelný a aktualizovatelný pro osobní použití mimo veřejný release Orcy. Repozitář již sestavuje release APK v CI, ale nemá soukromou distribuční cestu pro tento fork.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Release APK je podepsané stabilním soukromým klíčem, používá vlastní identitu aplikace a lze je nainstalovat vedle oficiální Orca Mobile.
- [ ] #2 CI nebo opakovatelný lokální postup nahraje zvolený APK do vlastního Firebase projektu pouze určeným testerům a vrátí odkaz pro instalaci.
- [ ] #3 Tajné hodnoty nejsou v repozitáři ani logu, verze nového APK se aktualizuje před vydáním a starší instalace lze bezpečně upgradovat.
- [ ] #4 Postup ověří párování s Orca Dev a mobilní protokol, aniž by publikoval build do veřejného release projektu.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Prepare fork-specific Android identity/signing/versioning and a private Firebase App Distribution upload path; verify against current official Expo/Firebase documentation, CI syntax and local build constraints; leave secrets outside repository and report external project prerequisites.
<!-- SECTION:PLAN:END -->
