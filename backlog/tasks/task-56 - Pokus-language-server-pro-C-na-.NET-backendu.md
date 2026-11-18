---
id: TASK-56
title: 'Pokus: language server pro C# na .NET backendu'
status: Done
assignee: []
created_date: '2026-11-18T12:41:00Z'
updated_date: '2026-11-18T21:22:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-0
dependencies: []
documentation:
  - docs/review-ide/02-editor.md
priority: medium
type: spike
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Vybrat language server pro C# a ověřit ho na skutečném backendu. Dokumentace uvádí Roslyn language server, případně csharp-ls, a upozorňuje na licenční omezení některých součástí od Microsoftu.

### Postup

- Pracuj nad kopií backendu uvedeného v `CLAUDE.local.md` (sekce Review IDE), vytvořenou mimo jeho checkout.
- Servery instaluj do `~/.cache/orca-review-ide/tools`, ne globálně.
- Server ovládej skriptem přes stdio, stejně jako v ostatních pokusech.

### Mimo rozsah

- Integrace do Orky, ladění, C# Dev Kit.

### Omezení

- Z firemních projektů nesmí nic odejít ven a do záznamu rozhodnutí nepatří názvy modulů, tříd, adresy ani úryvky kódu. Uváděj jen míry a obecné závěry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Záznam rozhodnutí porovnává Roslyn language server a csharp-ls: stav definice, referencí, hoveru, doplňování, diagnostiky, přejmenování a hledání symbolů na řešení s více projekty
- [x] #2 Záznam uvádí u obou serverů licenci a způsob získání a výslovně říká, zda je smí používat aplikace mimo produkty Microsoftu
- [x] #3 Záznam uvádí čas načtení řešení, paměť procesu a dobu odezvy na opakované dotazy
- [x] #4 Záznam končí volbou serveru pro M3 a požadavkem na verzi .NET SDK u uživatele
- [x] #5 Checkout uživatelova projektu zůstal beze změny, včetně nesledovaných souborů
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker, 2026-11-18): 1) otisk checkoutu backendu před pokusem; 2) kopie commitnutého stromu přes git archive do ~/.cache/orca-review-ide/task-56, přepis tajemství zástupnými hodnotami, vlastní NuGet.Config jen s místní mezipamětí; 3) stažení Roslyn language serveru a csharp-ls do ~/.cache/orca-review-ide/tools (jediný krok se sítí); 4) restore, servery a měření jen v sandboxu bez sítě, telemetrie vypnutá; 5) baterie dotazů přes stdio (skripty z TASK-53/55), pětkrát každý dotaz, paměť, čas načtení; 6) licence a získání z dokumentace; 7) záznam rozhodnutí, README, 02-editor.md; 8) otisk po pokusu, úklid procesů.

Průběh 1 (worker): hotovo: otisky obou checkoutů před pokusem, kopie v ~/.cache/orca-review-ide/task-56 (project = primární backend, project2 = náhradní backend HEAD, project3 = náhradní backend na starším commitu, který jde obnovit offline), přepis tajemství, sandbox bez sítě (scripts/sandbox.sb, sb.sh), oba servery stažené z nuget.org do tools/ s ověřeným otiskem, baterie dotazů nad project3 pro Roslyn LS i csharp-ls (runs/r5, r7, c1, c2), restart, úpravy, 60 souborů, změny mimo soubor. Zbývá: kontrolní build project3, nepřipravený worktree (project2) a legacy řešení (project), licence z webu, záznam rozhodnutí, README a 02-editor.md, otisky po pokusu, úklid procesů.

Průběh 2 (worker): hotovo: kontrolní build project3 v sandboxu (0 chyb), nepřipravený worktree (project2: runs/r8 Roslyn s automatickým restore, r9 s vypnutým, c3 csharp-ls), neúplné starší řešení (project: runs/r10, r11, c4, c5), připnutá starší nainstalovaná SDK (runs/r12, c6), licence a získání z nuget.org a z licenčních textů. Zbývá: scripts/REPRODUCE.txt, záznam rozhodnutí, README a 02-editor.md, otisky po pokusu, kontrola procesů, odškrtnutí kritérií.

Průběh 3 (worker): hotovo: záznam decision-4 (proposed), otevřená otázka v docs/review-ide/README.md, řádek .NET / C# a bod Připravenost v 02-editor.md, scripts/REPRODUCE.txt, otisky po pokusu (první repozitář shodný ve všem; druhý shodný v HEAD, indexu, stavu a obsahu, liší se ignorovaná výstupní složka a časy v .git z cizího fetch), kontrola procesů (žádný proces pokusu neběží). Důkazy ke kritériím: #1 až #4 oddíly Findings a Decision záznamu, #5 fingerprint/before|after a fallback-before|fallback-after v ~/.cache/orca-review-ide/task-56. Mimo ~/.cache/orca-review-ide zůstalo: /tmp/task56-dir (prázdná složka) a 60 socketů s názvem GUID v /tmp. Necommitováno.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pokus se dvěma language servery pro C# nad kopií .NET backendu (řešení se 76 projekty, vše v sandboxu bez sítě, restore jen z místní mezipaměti): Roslyn language server umí ve výchozím stavu všechny zkoušené funkce včetně navigace do balíčků a analyzátorů, řešení načte za 7 až 11 s a ve špičce bere 1,5 až 2,6 GB; csharp-ls načítá 17 až 19 s, bere zhruba 1,1 GB, navigaci do balíčků má za přepínačem a vlastní metodou a analyzátory vypnuté. Oba jsou pod MIT; balíček Roslyn language serveru obsahuje telemetrické knihovny Microsoftu s vlastními podmínkami, proto ho návrh nepřibaluje a stahuje z nuget.org na počítači uživatele. Návrh v decision-4 (proposed): Roslyn language server jen nad worktree s obnovenými balíčky, vždy s vypnutou telemetrií a vypnutým automatickým restore, csharp-ls jako záloha; požadavek .NET SDK 10 a řada SDK z global.json. Omezení měření: primární backend na tomto stroji načíst nejde (chybí SDK 6, projekty pro .NET Framework), měřeno na náhradním backendu na rok starém commitu, jehož balíčky jsou v mezipaměti. Checkouty jsou podle otisku beze změny; rozdíly v ignorované výstupní složce a časech v .git náhradního backendu worker přičítá uživatelovu vlastnímu běžícímu restore a fetch.
<!-- SECTION:FINAL_SUMMARY:END -->
