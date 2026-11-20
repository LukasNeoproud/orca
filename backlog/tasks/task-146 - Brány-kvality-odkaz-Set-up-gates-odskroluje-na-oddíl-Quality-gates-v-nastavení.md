---
id: TASK-146
title: >-
  Brány kvality: odkaz Set up gates odskroluje na oddíl Quality gates v
  nastavení
status: Done
assignee: []
created_date: '2026-11-20T09:14:00Z'
updated_date: '2026-11-20T10:07:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: bug
ordinal: 30
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připomínka uživatele z akceptace M1 (2026-11-20): Set up gates otevře nastavení ve správné sekci, ale neodskroluje na část s Quality gates.

### Rozsah

- Odkaz z oddílu Local gates (src/renderer/src/components/quality-gates/) a cílový oddíl v nastavení repozitáře.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Klik na Set up gates v oddílu Local gates otevře nastavení repozitáře odskrolované na oddíl Quality gates, i když je nastavení už otevřené na jiném místě
- [x] #2 Znovu použit stávající mechanismus odkazu na oddíl nastavení, pokud existuje; test a ověření ve skrytém okně
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: přidat getRepositoryQualityGatesSectionId do settings/repository-settings-targets.ts, dát ho jako id sekci RepositoryQualityGatesSection a předat sectionId z odkazu Set up gates (stávající mechanismus settingsNavigationTarget.sectionId, jako openSetupScriptSettings). Test v WorkspaceQualityGatesSection.test.tsx, ověření ve skrytém okně.

Hotovo: odkaz Set up gates posílá sectionId repo-<id>-quality-gates (quality-gates/quality-gate-settings-target.ts), oddíl v nastavení nese stejné id; scroll obstará stávající settingsNavigationTarget.sectionId. Unit test WorkspaceQualityGatesSection.test.tsx, e2e tests/e2e/quality-gates-settings-link.spec.ts (nastavení otevřené na Appearance i nahoře v repo panelu), bez opravy e2e selže. Snímky /tmp/orca-review-ide/task-146/.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Odkaz Set up gates v oddílu Local gates otevře nastavení repozitáře odskrolované na oddíl Quality Gates, i když je nastavení už otevřené jinde nebo nahoře v témže panelu. Použit stávající mechanismus sectionId. Ověřeno: tc, test komponenty, brána změněných řádků, anti-slop, e2e ve skrytém okně se snímky.
<!-- SECTION:FINAL_SUMMARY:END -->
