---
id: TASK-86
title: 'Brány kvality: oddíl místních bran v panelu Checks'
status: Done
assignee: []
created_date: '2026-11-18T15:17:00Z'
updated_date: '2026-11-19T21:12:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-85
documentation:
  - docs/review-ide/06-ai-a-review.md
  - docs/review-ide/03-rozlozeni.md
priority: high
type: feature
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Výsledek bran kvality má být vidět v panelu kontrol aktivního workspace a odtud má jít brány spustit a zrušit. Bez toho o bránách ví jen ten, kdo je spustil z nastavení nebo z CLI.

### Rozsah

- Panel: nový oddíl v panelu Checks (`src/renderer/src/components/right-sidebar/ChecksPanel.tsx`, adresář `checks-panel/`). Komponenty oddílu patří do `src/renderer/src/components/quality-gates/`; do panelu jen registrace.
- Data a akce z RPC `qualityGates.*` z TASK-85 (`src/renderer/src/lib/quality-gate-client.ts`); odběr změn stavu místo dotazování v intervalu, pokud to hostitel umí.
- Položka v hlavním menu, pokud už existuje registr z TASK-62.

### Mimo rozsah

- Stav bran na kartě workspace v sidebaru: TASK-121.
- Smyčka zpětné vazby agentovi a její stav: TASK-87.
- Stav bran na stránce pull requestu a před založením pull requestu: TASK-104.
- Odkazy z výstupu na soubor a řádek (M3).

### Omezení

- Nový tab pravého sidebaru nepřidávej: `STATIC_RIGHT_SIDEBAR_TABS` v `src/shared/rpc-contract/client-ui-params.ts` je součást kontraktu se spárovanými klienty a starší klient by rozložení odmítl.
- Panel Checks dnes pro workspace s pull requestem Azure DevOps vrací prázdný výběr (`checks-panel-review.ts`); oddíl místních bran na tom nesmí záviset.
- Vzhled podle `docs/STYLEGUIDE.md`, stavové barvy jen ze stávajících tokenů, texty v šesti jazycích.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Panel Checks pro aktivní workspace má oddíl místních bran: u každé výsledek, čas, commit a rozbalitelný konec výstupu, tlačítka Spustit vše, Spustit jednu a Zrušit
- [x] #2 Stav v oddílu se po doběhnutí brány, po commitu a po úpravě souboru obnoví sám, bez ruční obnovy
- [x] #3 Oddíl místních bran je vidět i u workspace s pull requestem Azure DevOps, GitHubu a GitLabu a u workspace bez pull requestu; folder workspace ho má také
- [x] #4 SSH workspace ukazuje v oddílu stav ze vzdáleného hostitele; při ztrátě spojení je stav unverifiable, ne selhání
- [x] #5 Starší spárovaný klient dál načte rozložení pravého sidebaru
- [x] #6 Komponenty oddílu mají testy a panel je ověřený ve skrytém okně se snímkem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Z TASK-119 (2026-11-19), vyřeš v tomto tiketu: (1) zrušený nebo ukončením aplikace zastavený běh ukazuje čerstvost Up to date, jako by byl výsledkem; u běhu bez výsledku čerstvost neukazuj. (2) Důvod zastavení ukončením aplikace je dnes jen text v poli error (QUALITY_GATE_STOPPED_BY_QUIT); když ho stav u workspace nebo agent potřebuje rozlišit, přidej nepovinné pole stopReason, ne novou hodnotu stavu.

Rozděleno 2026-11-19 podle pravidla velikosti: TASK-121 převzal stav bran na kartě workspace v sidebaru.

Plán workera (2026-11-19): (1) hostitel: proud qualityGates.subscribe (signál 'changed' po změně běhu a po změně commitu/stromu, hlídá hostitel jen po dobu odběru), schopnost quality-gates.subscribe.v1; starší hostitel => klient se dotazuje jako dřív. (2) sdílené: nepovinné stopReason u běhu, čerstvost jen u běhu s výsledkem (ne cancelled). (3) renderer: oddíl místních bran v components/quality-gates, registrace v ChecksPanel; záložka Checks i pro složku s nastavenými branami. (4) položka v menu Review přes registr z TASK-62. (5) texty v 6 jazycích, testy, test kompatibility rozložení sidebaru, snímek ze skrytého okna, dokumentace.

Stav (worker): hotovo a otestováno jednotkově: proud qualityGates.subscribe/unsubscribe + schopnost, stopReason, čerstvost jen u běhu s výsledkem, hook s odběrem a záložním intervalem, oddíl WorkspaceQualityGatesSection registrovaný v ChecksPanel, záložka Checks pro složku s branami, položka Review > Quality Gates, texty v 6 jazycích. Zbývá: e2e ve skrytém okně se snímkem, brány kvality kódu (tc, code-quality, anti-slop, oxlint, ratchety), dokumentace.

Dokončeno workerem 2026-11-19, čeká na ověření koordinátorem. Hotovo vše z plánu včetně e2e ve skrytém okně (tests/e2e/quality-gates-checks-panel.spec.ts, snímky ~/.cache/orca-review-ide/task-86/01..06-*.png) a dokumentace (06-ai-a-review bod 3, 03-rozlozeni, doplnění decision-11). Brány: pnpm tc 0, oxlint 0, check:code-quality:changed 0 nálezů, audit:anti-slop 0, max-lines ratchet OK, focus-read a layout-writer ratchety 0, katalog RPC přegenerovaný. Výhrady: SSH jen testy nad náhradou (vzdálený hostitel přes runtime prostředí; přímé ssh: hostitel neobsluhuje a oddíl ukáže jeho odmítnutí); folder workspace skupiny projektů brány nemá (žádné nastavení repozitáře), oddíl má složka bez gitu s nastavenými branami. Známé pády mimo tiket při širším běhu vitestu: agent-launch-*replay/instant-tab a host-operation-ownership (androidAppRun.*), viz TASK-112.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Panel Checks má oddíl Local gates: u každé brány výsledek, čas, commit, čerstvost a rozbalitelný konec výstupu, tlačítka Run all, spuštění jedné a Stop. Stav se obnovuje sám přes nový proud qualityGates.subscribe (schopnost quality-gates.subscribe.v1; starší hostitel se dotazuje po 5 s, starší klient nic neodebírá); commit a úpravu souboru hostitel hlídá čtením stavu stromu po 3 s jen po dobu odběru. Oddíl je vidět u workspace s PR GitHubu, GitLabu a Azure DevOps, bez PR i u složky bez gitu; záložka Checks se složce zobrazí, když má repozitář bránu. Nepovinné pole stopReason, zastavený běh neukazuje čerstvost. Položka Review → Quality Gates v menu. Neověřeno: skutečný vzdálený hostitel, Windows/WSL, mobilní klient; folder workspace skupiny projektů oddíl nemá. Ověřeno: tc, 182 testů, brána změněných řádků, anti-slop, lokalizace, e2e ve skrytém okně se snímky.
<!-- SECTION:FINAL_SUMMARY:END -->
