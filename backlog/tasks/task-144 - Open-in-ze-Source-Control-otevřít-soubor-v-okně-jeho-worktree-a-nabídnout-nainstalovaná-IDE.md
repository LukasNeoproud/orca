---
id: TASK-144
title: >-
  Open in ze Source Control: otevřít soubor v okně jeho worktree a nabídnout
  nainstalovaná IDE
status: Done
assignee: []
created_date: '2026-11-20T09:14:00Z'
updated_date: '2026-11-20T09:40:00Z'
labels:
  - review-ide
  - effort-high
  - model-opus
milestone: m-1
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
priority: high
type: bug
ordinal: 10
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připomínka uživatele z akceptace M1 (2026-11-20): Open in na souboru v panelu Source Control nabídl jen VS Code, Android Studio chybělo a v nastavení nešlo jednoduše přidat. Open in v editoru otevře VS Code s projektem a souborem, ale ze Source Control otevře jen soubor bez projektu.

### Rozsah

- Najdi všechna místa, kde se Open in volá bez kořene worktree (TASK-116 ho předává jen s řádkem; src/main/external-editor-file-location.ts vrací složku jen když je location), a sjednoť je: soubor otevřený z workspace patří do okna svého worktree i bez řádku.
- Seznam aplikací Open in: zjisti, odkud se bere a proč Android Studio chybí, a doplň zjištění nainstalovaných IDE nebo jednoduché přidání v nastavení. Znovu použij stávající registr aplikací, nestav druhý.

### Omezení

- Složený příkaz (například code --reuse-window) a WSL soubory složku nedostávají, jak je zapsáno v 02-editor.md.
- IDE při ověřování spouštěj jen nad smyšleným projektem v ~/.cache/orca-review-ide; okna, která měl uživatel otevřená, nezavírej a nenech po sobě viset žádný proces spouštěče (při TASK-80 zůstalo chybové okno Android Studia). Android Studio s otevřeným modálním dotazem na další příkaz neodpoví.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Open in na souboru v panelu Source Control otevře soubor v okně jeho worktree nebo folder workspace stejně jako Open in v editoru (VS Code i JetBrains), ne samotný soubor
- [x] #2 Totéž platí pro ostatní místa, odkud jde Open in na souboru bez řádku; seznam míst a jejich chování je zapsaný v dokumentaci
- [x] #3 Nabídka Open in ukazuje nainstalované Android Studio (i ze spouštěče JetBrains Toolbox) bez ruční úpravy nastavení, nebo ho jde v nastavení přidat výběrem ze seznamu nalezených aplikací; totéž pro ostatní podporovaná IDE
- [x] #4 Na Windows a Linuxu se seznam staví bez pádu; co nejde zjistit, se nenabízí. SSH soubory se chovají jako dosud
- [x] #5 Testy sestavení příkazu a seznamu aplikací; průchod ze Source Control ověřený ve skrytém okně
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker 2026-11-20): 1) Příčina: Source Control volá openWorktreePath jen se souborem (bez kořene) a hlavní proces složku přidá jen s řádkem; hlavička editoru bez kurzoru taky. Oprava: buildExternalEditorProjectRootArgs bez podmínky na řádek (jen pro soubor, ne složku), shell.ts ověří kořen i bez řádku, Source Control pošle kořen worktree/folder workspace pro lokálního vlastníka. 2) Seznam aplikací: Open in ukazuje jen settings.openInApplications (výchozí VS Code), Přidat aplikaci nabízí jen VS Code, Cursor, Zed. Doplním katalog známých IDE do sdíleného registru (src/shared), detekci nainstalovaných v hlavním procesu (PATH, skripty JetBrains Toolbox, balíčky .app na macOS, výchozí cesty Windows/Linux) přes IPC shell:detectOpenInApplications a v nastavení oddíl nalezených aplikací v menu Přidat aplikaci. 3) Testy main (sestavení příkazu, detekce pro 3 platformy), renderer (menu, katalog), e2e Source Control ve skrytém okně; živé ověření VS Code a Android Studia nad smyšleným projektem; 02-editor.md.

Stav (worker 2026-11-20): hotovo v kódu: kořen i bez řádku (main + Source Control), katalog známých IDE src/shared/open-in-known-applications.ts, detekce src/main/open-in-installed-apps, IPC shell:detectOpenInApplications, menu Přidat aplikaci s oddílem Installed (src/renderer/src/components/open-in-installed-apps), překlady, unit testy. Zbývá: brány (format, oxlint, code-quality, anti-slop, ratchety), e2e Source Control ve skrytém okně, živé ověření VS Code a Android Studia, 02-editor.md.

Hotovo (worker 2026-11-20): vše v kódu, testy a brány prošly (tc, unit 394+67 souborů, e2e 8/8 ve skrytém okně, code-quality, anti-slop, ratchety, oxlint). Živě: VS Code bez řádku otevřel okno 'Ukazka.kt — okno' a další soubor stejné okno znovu (projekt ~/.cache/orca-review-ide/task-144/projekt/okno, okno zavřeno). Android Studio živě neověřeno: v IDE uživatele bylo otevřené okno vyhledávání, které by nové okno projektu zavřelo; chování bez --line doložené z bytecode CommandLineProcessor (~/.cache/orca-review-ide/task-144/bytecode/cmdline.txt). Snímky ~/.cache/orca-review-ide/task-144/e2e-output. Čeká na koordinátora.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Open in ze Source Control a z hlavičky editoru bez řádku teď posílá i kořen worktree nebo folder workspace, takže VS Code i JetBrains otevřou soubor v okně jeho projektu (složka jako cíl a SSH soubory zůstávají beze změny). Nastavení Open In Apps má v nabídce Add app oddíl Installed s editory nalezenými na počítači (PATH, skripty JetBrains Toolbox, .app na macOS, výchozí instalace na Windows, tarball na Linuxu); Android Studio a Xcode jdou přidat jedním klikem. Nalezená IDE se do nabídky nepřidávají sama. Neověřeno: Android Studio živě bez řádku (jen bytecode a testy sestavení příkazu), skutečné Windows a Linux. Ověřeno: tc, 350 testů, brána změněných řádků, anti-slop, lokalizace, e2e ve skrytém okně se snímky, VS Code živě.
<!-- SECTION:FINAL_SUMMARY:END -->
