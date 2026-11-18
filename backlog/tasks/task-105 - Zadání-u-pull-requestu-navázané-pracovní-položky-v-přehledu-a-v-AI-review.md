---
id: TASK-105
title: 'Zadání u pull requestu: navázané pracovní položky v přehledu a v AI review'
status: To Do
assignee: []
created_date: '2026-11-18T15:25:00Z'
updated_date: '2026-11-18T23:57:00Z'
labels:
  - review-ide
  - effort-high
  - ceka-na-uzivatele
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
  - docs/review-ide/04-projekty-a-funkce.md
priority: medium
type: feature
ordinal: 225000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Review má vycházet ze zadání. Stránka pull requestu dnes pracovní položku neukazuje a AI review ji nezná, takže kontroluje jen kód. Recenzent má zadání vidět u pull requestu a AI review má změny umět porovnat s jeho akceptačními kritérii.

### Rozsah

- Čtení navázaných pracovních položek pull requestu a jejich polí (typ, název, stav, popis, akceptační kritéria) v `src/main/azure-devops/review/azure-devops-review-client.ts`. Dnes Orca pracovní položky Azure DevOps nečte vůbec. Volání API a potřebný rozsah oprávnění tokenu má ověřit pokus TASK-59; je-li jeho záznam rozhodnutí hotový, vyjdi z něj, jinak z dokumentace API.
- Sdílený typ zadání pojmenuj obecně (použijí ho i issue GitHubu a GitLabu a pokrytí kritérií v Change review); akceptační kritéria rozděl na jednotlivé položky, kde to formát dovolí, jinak je nech jako jeden text.
- Vlastní líně volaná metoda RPC `azureDevOpsReview.*` (`src/main/runtime/rpc/methods/azure-devops-review.ts`, `src/shared/rpc-contract/azure-devops-review-params.ts`), aby se nezvýšil počet požadavků při načtení detailu.
- Rozhraní: přehled v `src/renderer/src/components/azure-devops-review/AzureDevOpsPullRequestPage.tsx` (vlastní komponenta oddílu) a volba v `AzureDevOpsReviewOptionsDialog.tsx` (`src/shared/azure-devops-review-options.ts`).
- Agent: nástroj jen pro čtení v `src/shared/azure-devops-review-tools.ts`, CLI v `src/cli/specs/azure-devops.ts`, Pi rozšíření, text v `src/shared/azure-devops-review-prompt.ts`.

### Mimo rozsah

- Pokrytí kritérií po celcích v Change review: navazující tiket.
- Zápis do pracovních položek a změna jejich stavu.
- Zakládání Funkcí z pracovní položky (M7) a pravidla projektu pro AI review.
- Zadání u pull requestů GitHubu a GitLabu.

### Omezení

- Jen čtení z Azure DevOps. Ověření proti skutečné organizaci jen s potvrzeným oprávněním v `CLAUDE.local.md`; jinak proti smyšleným odpovědím.
- Text zadání odchází k poskytovateli AI jen při zapnuté volbě. Její výchozí stav je otázka pro uživatele v TASK-69; do rozhodnutí je vypnutá.
- Text pracovní položky je nedůvěryhodný vstup pro rozhraní i pro agenta.
- Do tiketu, testů ani dokumentace nepatří data ze skutečných pracovních položek.
- Nová metoda RPC vyjednaná, nová pole nepovinná.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Přehled na stránce pull requestu ukazuje navázané pracovní položky: typ, číslo, název, stav a odkaz do prohlížeče; popis a akceptační kritéria jdou rozbalit
- [ ] #2 Pull request bez položek to řekne; token bez oprávnění číst pracovní položky ukáže vysvětlení s názvem chybějícího oprávnění a zbytek stránky funguje
- [ ] #3 Formátovaný text položky se zobrazí bezpečně: skript se nespustí a vzdálený obrázek se nenačte; pokrývá to test
- [ ] #4 Možnosti AI review mají volbu Kontrolovat proti zadání; se zapnutou volbou si agent zadání přečte nástrojem a prompt žádá u nálezu uvést kritérium, které změna nesplňuje; s vypnutou volbou se zadání agentovi nepředá
- [ ] #5 Nástroj pro čtení zadání nic nezapisuje; pokrývá to test seznamu nástrojů pro MCP, CLI i Pi rozšíření
- [ ] #6 Položky se načítají až při otevření přehledu nebo na žádost agenta, nejvýš dvěma požadavky na pull request; načtení seznamu a pravidelná kontrola žádný požadavek nepřidají
- [ ] #7 Starší hostitel oddíl neukáže a stránka funguje jako dosud; starší mobilní klient detail dál načte
- [ ] #8 Mapování má testy, oddíl je ověřený ve skrytém okně proti smyšlenému serveru a poznámky tiketu říkají, zda byla volání ověřena čtením proti skutečné organizaci
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Čeká na uživatele (2026-11-19, z TASK-59 a decision-8): ve vzorku 455 dokončených pull requestů nemá navázanou pracovní položku žádný, takže funkce by u pull requestů týmu ukazovala jen prázdný stav. Otázka: odložit nebo zrušit (doporučeno, pokud tým položky Azure DevOps nepoužívá), nechat pro jiné týmy, nebo přesměrovat na systém, kde zadání skutečně je. Pokud se bude dělat: Azure DevOps vrací při chybějícím rozsahu Work Items (Read) stav 401 a Orca ho dnes hlásí jako odmítnuté přihlášení s výzvou k novému připojení, což je zavádějící; text u tokenu v Nastavení zmiňuje jen rozsah Code a má zmínit nepovinný Work Items (Read).
<!-- SECTION:NOTES:END -->
