---
id: TASK-116
title: >-
  Open in: předat kořen worktree z rozhraní, aby VS Code otevřel soubor v okně
  svého worktree
status: To Do
assignee: []
created_date: '2026-11-19T01:25:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
priority: medium
type: feature
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Open in na řádku dnes otevře soubor v naposledy aktivním okně IDE, tedy klidně v okně jiného projektu. TASK-80 ověřil na VS Code, že s kořenem worktree v příkazu skončí soubor v okně svého worktree, a připravil to v sestavení příkazu (volba `projectRoot`). Rozhraní ale kořen nepředává, takže uživatel změnu nevidí. Uživatel o tom rozhodl 2026-11-18 (decision-5): otevírat i worktree jako projekt, jakmile to ověření potvrdí.

### Rozsah

- Volitelné pole s kořenem v požadavku `ShellOpenExternalEditorRequest` a jeho ověření v `src/main/ipc/shell.ts`.
- Odeslání kořene z `external-editor-file-target.ts` a `open-file-in-external-editor.ts` v rendereru; hotová volba `projectRoot` v `src/main/external-editor-launch.ts`.
- Všechna místa, odkud Open in na řádku jde (editor, diff, kombinované diffy z TASK-79, stránka pull requestu).

### Mimo rozsah

- Složka worktree pro JetBrains a Xcode: čeká na ověření s uživatelem (TASK-80).
- Open in v režimu commitu a porovnání větví (posun řádků).

### Omezení

- Pole je nepovinné; starší volající bez něj musí fungovat jako dosud.
- Žádné skutečné IDE nespouštěj; ověřuj sestavené argumenty.
- SSH worktree a WSL: kořen se nepředává, chování se nemění.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Open in na řádku z rozhraní předá hlavnímu procesu kořen worktree nebo folder workspace, ve kterém soubor leží, a VS Code soubor otevře v okně té složky (code <kořen> --goto soubor:řádek:sloupec)
- [ ] #2 Hlavní proces kořen přijme jen když je absolutní, existuje a soubor v něm leží; jinak spustí dnešní příkaz bez složky
- [ ] #3 JetBrains, Xcode, složené příkazy, WSL a SSH se chovají jako dosud
- [ ] #4 Testy pokrývají předání kořene z rozhraní, odmítnutí kořene mimo soubor a folder workspace bez gitu; test ve skrytém okně ověří argumenty spuštění bez skutečného IDE
- [ ] #5 Dokumentace docs/review-ide/02-editor.md popisuje výsledné chování včetně nastavení VS Code, při kterém složka nahradí aktuální okno
<!-- AC:END -->
