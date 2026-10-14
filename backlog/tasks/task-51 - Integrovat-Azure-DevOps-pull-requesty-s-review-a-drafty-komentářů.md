---
id: TASK-51
title: 'Integrovat Azure DevOps pull requesty s review a drafty komentářů'
status: In Progress
assignee: []
created_date: '2026-10-07'
labels:
  - desktop
  - mobile
  - azure-devops
  - agents
dependencies: []
type: feature
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Zobrazit Azure DevOps pull requesty, kde je uživatel přímo reviewerem, v novém globálním tabu pravého sidebaru. Umožnit review PR v Orca (lokálně i agentem přes CLI/MCP tooly), psaní draftů komentářů a odpovědí v Orca a jejich selektivní publikaci uživatelem. Stejné funkce zpřístupnit na Androidu spárovaném s desktopem.

### Zdroj PR a připojení

- Sledují se jen Azure DevOps repa přidaná v Orca (odvozená z git remotů lokálních repozitářů); žádné procházení organizace ani výběr projektů v nastavení. Víc klonů stejného repa se deduplikuje podle repo ID.
- SSH repa nejsou podporovaná. PR z forků se zobrazí, ale review není podporované.
- Nastavení obsahuje připojení per organizace (URL + PAT s omezeným scopem a platností), tokeny šifrované přes safeStorage, metadata čitelná. Nastavení nabízí organizace detekované z repozitářů bez tokenu. Env proměnné `ORCA_AZURE_DEVOPS_*` zůstávají jako fallback.
- Dotaz per repo: `git/repositories/{repoId}/pullrequests?searchCriteria.reviewerId={me}&searchCriteria.status=…`, `me` per organizace z `_apis/connectionData`. „Assigned to me“ = přímý reviewer.

### Sidebar

- Tab „Pull requests“ v pravém sidebaru, nezávislý na aktivním workspace.
- Filtry Projekt, Repo, Stav; výchozí: všechny projekty, všechna repa, Active. Filtry se pamatují.
- Řádek: název, `repo · !id`, autor, můj hlas, Draft badge, stáří, indikace rozpracovaných draftů; badge organizace jen při více organizacích.

### Detail PR

- Stránka ve workbenchi: Overview, Threads, Drafts; akce Open in browser, Open in workspace, Review with AI.

### Review worktree

- Jeden sdílený review worktree per repo, při review jiného PR se přepne. Vždy detached HEAD na commitu z PR (`lastMergeSourceCommit`), `baseRef = origin/<target>`, `linkedAzureDevOpsPR = id`.
- Diff `target...HEAD` nad commitnutým HEAD.
- Rozpracované změny před přepnutím: zahodit / zrušit. Pokud je worktree obsazený běžícím agentem, přepnutí se zablokuje.

### Drafty

- Ukládají se v Orca per PR (`connection/project/repo/pr`), ne per worktree.
- Typy: inline (soubor + rozsah řádků + strana), souborový, obecný, odpověď do vlákna (`threadId`, volitelně nový stav vlákna).
- Draft nese SHA commitu a iteraci; starší iterace = outdated, nelze publikovat dokud se neupraví.
- Publikace jen uživatelem (výběr + Publish selected), idempotentně per draft.

### Agent tooly (CLI `orca ado …` + MCP)

- Čtení: list PR, detail PR, změny, vlákna, drafty.
- Zápis jen do Orca: vytvořit, upravit, smazat draft. Žádná publikace, hlasování ani dokončení PR (ochrana proti prompt injection).

### Android

- Přes RPC desktopu za capability flagem; stejný seznam, filtry, detail, drafty, úprava a publikace.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Nastavení umožní spravovat připojení Azure DevOps pro více organizací se šifrovanými tokeny a ukáže detekované organizace bez tokenu.
- [ ] #2 Pravý sidebar má globální tab Pull requests se sloučeným seznamem PR z Azure DevOps rep přidaných v Orca a filtry projekt/repo/stav s výchozím stavem Active.
- [ ] #3 Detail PR ukáže přehled, vlákna a drafty a nabídne otevření v prohlížeči a review ve sdíleném review worktree.
- [ ] #4 Review worktree je per repo, přepíná se na detached commit PR a diff je vůči cílové větvi PR.
- [ ] #5 Drafty (inline, obecné, odpovědi) lze vytvářet, upravovat, mazat, označují se outdated a uživatel publikuje jen vybrané.
- [ ] #6 Agent přes `orca ado` CLI a MCP tooly čte PR, vlákna a drafty a spravuje drafty, ale nemůže publikovat.
- [ ] #7 Android spárovaný s desktopem zobrazí stejný seznam, detail a drafty a umožní publikaci.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Implementováno naslepo, bez ověření proti skutečnému Azure DevOps.

- Hlavní proces: `src/main/azure-devops/` (připojení, credentials, organizace) a `src/main/azure-devops/review/` (klient, mapování, drafty, publikace, review worktree). RPC `azureDevOpsReview.*` za capability `azure-devops-review.v1`.
- Desktop: tab `pull-requests` v pravém sidebaru, stránka detailu přes workbench (`components/azure-devops-review/`), správa organizací v kartě Azure DevOps v Nastavení.
- CLI: `orca ado prs|pr|drafts|draft create|draft update|draft rm`, MCP server `orca ado mcp` (bez publikace).
- Android: `/h/{host}/pull-requests` a `/h/{host}/pull-request`.
- Zbývá: ověřit proti skutečné organizaci, vizuálně zkontrolovat Android, rozhodnout o automatické registraci `orca ado mcp` do agentů a o bundlovaném skillu.

<!-- SECTION:NOTES:END -->
