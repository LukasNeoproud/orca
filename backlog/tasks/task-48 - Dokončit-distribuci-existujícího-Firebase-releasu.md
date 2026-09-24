---
id: TASK-48
title: 'Dokončit distribuci existujícího Firebase releasu'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-24'
updated_date: '2026-09-24'
labels: []
dependencies: []
references:
  - mobile/scripts/publish-private-android-local.mjs
priority: medium
type: bug
ordinal: 48000
---

## Description

Firebase CLI nejprve nahraje APK, potom aktualizuje poznámky a distribuuje testerům. Pokud druhá část selže, opakování s existujícím APK našlo stejnou verzi a pouze vrátilo URI. Požadované skupiny tak nemusely získat přístup.

## Acceptance Criteria

- [x] Opakování dokončí distribuci skupin a poznámky i po úspěšném uploadu.
- [x] Zachovat kontrolu podpisu, balíčku a verze; nepřepisovat existující APK.
- [x] Regresní test pokryje úspěšné dokončení i chybu distribučního API.

## Implementation Notes

Po ověření APK a opětovném načtení vzdálené verze se obnoví release notes a distribuce existujícího releasu přes stejné API jako firebase-tools 15.30.2. Lokální stav se zapíše až po úspěchu. Bez nového uploadu. Cílené testy, mobilní typecheck a lint prošly; skutečný upload nebyl spuštěn.
