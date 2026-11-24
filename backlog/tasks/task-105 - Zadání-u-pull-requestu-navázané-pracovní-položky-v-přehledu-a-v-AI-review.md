---
id: TASK-105
title: >-
  Zadání u pull requestu: tiket z Jiry podle jména větve v přehledu a v AI
  review
status: To Do
assignee: []
created_date: '2026-11-18T15:25:00Z'
updated_date: '2026-11-24T09:05:00Z'
labels:
  - review-ide
  - effort-high
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

Review má vycházet ze zadání. Tým eviduje zadání v Jiře a klíč tiketu je ve jméně větve pull requestu (decision-12). Recenzent má tiket vidět u pull requestu a AI review má změny umět porovnat s jeho akceptačními kritérii.

### Rozsah

- Odvození klíče tiketu ze zdrojové větve pull requestu (například `feature/ABC-123-popis` → `ABC-123`): čistá sdílená funkce s testy; víc kandidátů nebo žádný řekne rozhraní.
- Čtení tiketu stávající integrací s Jirou: `src/main/runtime/rpc/methods/jira.ts`, `src/main/runtime/runtime-jira-commands.ts`, `src/preload/api/jira-api.ts` (`getIssue`). Novou integraci ani nové úložiště přihlašovacích údajů nestav.
- Sdílený typ zadání pojmenuj obecně (použije ho pokrytí kritérií v Change review, TASK-106); akceptační kritéria rozděl na položky, kde to formát popisu dovolí, jinak je nech jako jeden text.
- Rozhraní: oddíl v přehledu `src/renderer/src/components/azure-devops-review/AzureDevOpsPullRequestPage.tsx` (vlastní komponenta) a volba v `AzureDevOpsReviewOptionsDialog.tsx` (`src/shared/azure-devops-review-options.ts`).
- Agent: nástroj jen pro čtení v `src/shared/azure-devops-review-tools.ts`, CLI v `src/cli/specs/azure-devops.ts`, Pi rozšíření, text v `src/shared/azure-devops-review-prompt.ts`.

### Mimo rozsah

- Pracovní položky Azure DevOps (tým je nepoužívá, TASK-59).
- Pokrytí kritérií po celcích v Change review: TASK-106.
- Zápis do Jiry a změna stavu tiketu.
- Zakládání Funkcí z tiketu (M7).
- Pull requesty GitHubu a GitLabu; funkce odvození klíče ale nesmí být vázaná na Azure DevOps.

### Omezení

- Jen čtení z Jiry. Ověření proti skutečné Jiře jen s potvrzeným oprávněním v `CLAUDE.local.md`; jinak proti smyšleným odpovědím.
- Text zadání odchází agentovi při AI review ve výchozím stavu (decision-12); volbou jde vypnout.
- Text tiketu je nedůvěryhodný vstup pro rozhraní i pro agenta.
- Do tiketu, testů ani dokumentace nepatří data ze skutečných tiketů ani klíče projektů týmu.
- Když Jira není připojená, oddíl to řekne a nabídne připojení v Nastavení; zbytek stránky funguje.
- Čtení probíhá tam, kde je uložené připojení k Jiře; u SSH workspace se nic nového na hostitel neposílá.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Přehled na stránce pull requestu ukazuje tiket z Jiry odvozený ze jména zdrojové větve: klíč, typ, název, stav a odkaz do prohlížeče; popis a akceptační kritéria jdou rozbalit
- [ ] #2 Větev bez klíče, tiket, který neexistuje, a nepřipojená Jira mají každý vlastní srozumitelný stav a zbytek stránky funguje
- [ ] #3 Formátovaný text tiketu se zobrazí bezpečně: skript se nespustí a vzdálený obrázek se nenačte; pokrývá to test
- [ ] #4 Možnosti AI review mají volbu Kontrolovat proti zadání, ve výchozím stavu zapnutou; se zapnutou volbou si agent zadání přečte nástrojem a prompt žádá u nálezu uvést kritérium, které změna nesplňuje; s vypnutou volbou se zadání agentovi nepředá
- [ ] #5 Nástroj pro čtení zadání nic nezapisuje; pokrývá to test seznamu nástrojů pro MCP, CLI i Pi rozšíření
- [ ] #6 Tiket se načítá až při otevření přehledu nebo na žádost agenta; načtení seznamu pull requestů a pravidelná kontrola žádný požadavek na Jiru nepřidají
- [ ] #7 Odvození klíče a mapování tiketu mají testy, oddíl je ověřený ve skrytém okně proti smyšlené Jiře a smyšlenému Azure DevOps
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Čeká na uživatele (2026-11-19, z TASK-59 a decision-8): ve vzorku 455 dokončených pull requestů nemá navázanou pracovní položku žádný, takže funkce by u pull requestů týmu ukazovala jen prázdný stav. Otázka: odložit nebo zrušit (doporučeno, pokud tým položky Azure DevOps nepoužívá), nechat pro jiné týmy, nebo přesměrovat na systém, kde zadání skutečně je. Pokud se bude dělat: Azure DevOps vrací při chybějícím rozsahu Work Items (Read) stav 401 a Orca ho dnes hlásí jako odmítnuté přihlášení s výzvou k novému připojení, což je zavádějící; text u tokenu v Nastavení zmiňuje jen rozsah Code a má zmínit nepovinný Work Items (Read).

Přepsáno 2026-11-19 podle decision-12: zadání z Jiry podle jména větve místo pracovních položek Azure DevOps; text zadání agentovi ve výchozím stavu.

2026-11-24: čtení klíče tiketu ze jména větve a z názvu pull requestu dodá TASK-166 a stav tiketu z Jiry TASK-170 (milník M9, jde dřív). Tento tiket je použije.
<!-- SECTION:NOTES:END -->
