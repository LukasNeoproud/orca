---
id: TASK-31
title: 'Android: Obnovit publikaci existujícího APK po úspěšném uploadu'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/scripts/publish-private-android-local.mjs
  - mobile/scripts/private-android-local-publish-build.mjs
priority: medium
type: bug
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Pokud Firebase přijme APK, ale dohledání testing URI selže, lokální stav verze se neuloží. Opakování s `--existing-apk` pak vypočítá další versionCode a odmítne již vytvořené APK. Obnova musí ověřit verzi a podpis existujícího APK a vrátit URI již publikovaného vydání bez dalšího uploadu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Opakování s `--existing-apk` najde potvrzené vydání stejného versionCode a vrátí jeho testing URI bez dalšího uploadu.
- [x] #2 Dosud nepublikované existující APK lze po ověření podpisu nahrát; starší nebo nesprávně podepsané APK se odmítne.
- [x] #3 Regresní testy pokryjí obě větve obnovy.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Opraveno v pracovním stromu po review změn za posledních 48 hodin; cílené regresní testy a typové kontroly prošly.
<!-- SECTION:NOTES:END -->
