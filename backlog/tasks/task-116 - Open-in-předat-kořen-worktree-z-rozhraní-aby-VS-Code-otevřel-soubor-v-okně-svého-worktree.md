---
id: TASK-116
title: >-
  Open in: předat kořen worktree z rozhraní, aby VS Code otevřel soubor v okně
  svého worktree
status: Done
assignee: []
created_date: '2026-11-19T01:25:00Z'
updated_date: '2026-11-19T01:36:00Z'
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
- [x] #1 Open in na řádku z rozhraní předá hlavnímu procesu kořen worktree nebo folder workspace, ve kterém soubor leží, a VS Code soubor otevře v okně té složky (code <kořen> --goto soubor:řádek:sloupec)
- [x] #2 Hlavní proces kořen přijme jen když je absolutní, existuje a soubor v něm leží; jinak spustí dnešní příkaz bez složky
- [x] #3 JetBrains, Xcode, složené příkazy, WSL a SSH se chovají jako dosud
- [x] #4 Testy pokrývají předání kořene z rozhraní, odmítnutí kořene mimo soubor a folder workspace bez gitu; test ve skrytém okně ověří argumenty spuštění bez skutečného IDE
- [x] #5 Dokumentace docs/review-ide/02-editor.md popisuje výsledné chování včetně nastavení VS Code, při kterém složka nahradí aktuální okno
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker 2026-11-19): 1) shell:openInExternalEditor jde jen IPC renderer->main téže aplikace (webový klient ho nahrazuje stubem, runtime RPC ani CLI ho nevolají), takže katalog RPC se nemění. 2) nepovinné projectRoot v ShellOpenExternalEditorRequest; ověření v novém src/main/ipc/external-editor-project-root.ts (absolutní, existuje jako složka, soubor uvnitř přes path.relative), při pochybnosti bez složky; SSH větev kořen ignoruje. 3) renderer: ExternalEditorFileTarget.projectRoot z katalogu worktree / folder workspace, posílá se jen pro lokálního vlastníka. 4) testy main + renderer, e2e s nahrávacím code, 02-editor.md.

Hotovo (worker 2026-11-19): pole projectRoot v ShellOpenExternalEditorRequest; ověření v src/main/ipc/external-editor-project-root.ts (absolutní, ne kořen disku, existující složka, soubor uvnitř přes path.relative), jinak a bez řádku příkaz bez složky; SSH větev ho ignoruje, WSL ho zahodí sestavení příkazu. Renderer: ExternalEditorFileTarget.projectRoot z katalogu (worktree nebo folder workspace), jen pro lokálního vlastníka; pokrývá editor, hlavičku, diff, souhrnný diff i diff a All changes pull requestu Azure DevOps. Kanál jde jen IPC v rámci aplikace (webový klient má stub), katalog RPC beze změny. Testy main, renderer a e2e 6/6 ve skrytém okně (snímky ~/.cache/orca-review-ide/task-116/e2e-output). Dokumentace 02-editor.md doplněna. Nezbývá nic; čeká na koordinátora.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Open in na řádku teď z rozhraní předává kořen worktree nebo folder workspace, ve kterém soubor leží, a VS Code soubor otevře v okně té složky místo v naposledy aktivním okně (často jiného projektu). Platí ze všech míst, odkud Open in na řádku jde: editor, hlavička cesty, diff, souhrnný diff a diff pull requestu. Hlavní proces kořen z rozhraní ověřuje sám (absolutní, existující složka, soubor uvnitř, ne kořen disku) a při pochybnosti spustí dosavadní příkaz bez složky. JetBrains, Xcode, složené příkazy, WSL a SSH se chovají jako dosud. Požadavek jde jen mezi rozhraním a hlavním procesem téže aplikace, vzdálené klienty se změna netýká. Ověřeno testy hlavního procesu (i cesty Windows) a šesti testy ve skrytém okně s náhradním skriptem místo editoru; skutečné IDE se nespouštělo, živé chování VS Code doložil TASK-80. Chování při nastavení VS Code, kdy složka nahradí aktuální okno, je popsané podle dokumentace VS Code, neověřené. Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
