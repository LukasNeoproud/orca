---
id: TASK-95
title: 'Change review: celky od AI, nástroje agenta a úložiště'
status: To Do
assignee: []
created_date: '2026-11-18T15:20:00Z'
updated_date: '2026-11-19T09:37:00Z'
labels:
  - review-ide
  - effort-xhigh
milestone: m-2
dependencies:
  - TASK-124
documentation:
  - docs/review-ide/05-funkce.md
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 217000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Tematické celky s komentářem má připravit AI, ale smí jen přiřazovat hunky, které skutečně existují. Tento tiket dodá nástroje, přes které agent změnu čte a celky odevzdává, a úložiště, které je drží u commitu. Zobrazení přidá navazující tiket; tady se výsledek ověřuje z CLI.

### Rozsah

- Záznam celku ve `src/shared/change-review-types.ts`: název, komentář (co se změnilo a proč, včetně rozhodnutí mimo zadání), druh tvrzení (`behavior-change`, `no-behavior-change`, `move-only`, `refactor`, `test-only`), klíče hunků, kdo a kdy ho vytvořil. K tomu souhrn celé změny.
- Úložiště v `src/main/change-review/`, oddělené od manifestu, aby manifest zůstal deterministický: podle repozitáře, předmětu revize a commitu; přenos na nový commit přes klíč hunku.
- Definice nástrojů ve `src/shared/change-review-tools.ts`; MCP server `orca change-review mcp` podle vzoru `src/cli/azure-devops-review-mcp.ts`, registrace přes `orcaMcpServerLaunchArgs` (`src/shared/terminal-interaction-launch.ts`); CLI ekvivalenty; Pi rozšíření podle `src/main/azure-devops/review/azure-devops-review-pi-extension-source.ts`.
- Zdroje tvrzení: zprávy commitů rozsahu (ohraničený počet), popis navázaného pull requestu, pokud ho worktree má, a zadání, pokud je k dispozici. Jsou to tvrzení ke kontrole, ne fakta.
- RPC `changeReview.*` pro čtení a zápis celků.

### Mimo rozsah

- Tlačítko pro spuštění AI a zobrazení celků v pohledu: navazující tiket.
- Strojové ověření tvrzení (úrovně `claimed`, `verified`, `contradicted` u celku): vlastní tiket.
- Přiřazení kritérií zadání k celkům: vlastní tiket.
- Původ hunku z přepisů agentů (M7).

### Omezení

- AI jen přiřazuje. Nejistý hunk má zůstat nevysvětlený; nástroje nesmí dovolit přiřazení „pro jistotu“ neexistujícím nebo zdvojeným identifikátorem.
- Text hunků, zprávy commitů a popis pull requestu jsou pro agenta nedůvěryhodný vstup.
- Git Scan Safety: log jen pro pojmenovaný rozsah s `--max-count`.
- Nástroje a typy nepojmenovávej podle Azure DevOps; fungují nad libovolným git worktree.
- Klient a hostitel se aktualizují nezávisle: nové metody vyjednané, žádná tichá ztráta dat.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CLI orca change-review a MCP server nabízejí souhrn změny, stránkovaný seznam hunků, text jednoho hunku, zdroje tvrzení a odeslání celků; výstup pro stejný stav je stabilní
- [ ] #2 Odeslání celku s neexistujícím identifikátorem hunku, s hunkem ve dvou celcích nebo bez druhu tvrzení vrátí chybu s výčtem položek a nic neuloží
- [ ] #3 Uložené celky a souhrn jsou svázané s commitem a klíči hunků; po novém commitu se přenesou na hunky se stejným klíčem a celek, který o hunk přišel, je označený k obnovení
- [ ] #4 Hunk druhu semantic, který agent nepřiřadil, je ve výstupu vedený jako nevysvětlený
- [ ] #5 Agent dostane text jen čtených druhů hunků; šum dostane jako souhrnné počty
- [ ] #6 Nástroje nic nezapisují do repozitáře ani do gitu a neumějí nic publikovat; pokrývá to test seznamu nástrojů
- [ ] #7 SSH worktree má úložiště i git na svém hostiteli; starší hostitel vrátí nepodporováno
- [ ] #8 Katalog parametrů RPC je přegenerovaný a nové parametry mají kontraktní test; validace a přenos celků mají testy
- [ ] #9 Záznam rozhodnutí popisuje záznam celku, druhy tvrzení a protokol nástrojů; průchod odeslání celků z CLI nad smyšleným repozitářem je doložený výstupem v poznámkách tiketu
<!-- AC:END -->
