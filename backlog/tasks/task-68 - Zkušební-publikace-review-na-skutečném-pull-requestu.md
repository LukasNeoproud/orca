---
id: TASK-68
title: Zkušební publikace review na skutečném pull requestu
status: To Do
assignee: []
created_date: '2026-11-18T12:44:00Z'
updated_date: '2026-11-19T03:08:00Z'
labels:
  - review-ide
  - ceka-na-uzivatele
  - effort-high
milestone: m-2
dependencies:
  - TASK-83
documentation:
  - docs/review-ide/01-integrace.md
priority: medium
type: task
ordinal: 202500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Doložit, že publikace z Orky do Azure DevOps funguje proti skutečné organizaci. Publikuje vždy uživatel.

### Postup

- Agent připraví v Orca Dev drafty a napíše uživateli přesný postup po krocích.
- Uživatel publikuje a potvrdí výsledek; agent ho ověří čtením.

### Čeká na uživatele

Určit pull request, na kterém smí proběhnout zkušební publikace, a provést ji.

### Omezení

- Do tiketu, kódu ani dokumentace nepiš názvy organizací, repozitářů, čísla ani texty pull requestů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Uživatel publikoval z Orca Dev draft komentáře, odpověď ve vlákně a hlas na pull requestu, který sám určil
- [ ] #2 Publikované položky v Azure DevOps odpovídají draftům: text, soubor, řádek a vlákno
- [ ] #3 Zbylá akceptační kritéria TASK-51 mají stav ověřeno, selhalo nebo neověřeno s důvodem
- [ ] #4 Každá nalezená chyba má vlastní tiket
- [ ] #5 Agent do Azure DevOps nic nezapsal
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Otevřené otázky pro uživatele z TASK-67 (2026-11-18): 1) Smí agent spouštět druhou skrytou instanci nainstalované Orca Dev nad sdíleným ~/.orca? Worker TASK-67 to udělal bez schválení, instance vyřadila tři záznamy z registru review worktrees (obnoveno ze zálohy) a worker v ní dešifroval uložený token pro přímé dotazy GET. Doporučení: ano jen se zálohou sdílených souborů jako pevným krokem; do rozhodnutí je to workerům zakázané. 2) Doověřit zápisové části TASK-51 (drafty přes rozhraní a CLI, zahození změn v review worktree)? Zapisují do úložiště draftů uživatele. Doporučení: ano, spolu s tímto tiketem, se zálohou. 3) Smazat pracovní data ~/.cache/orca-review-ide/task-67 (asi 150 MB, skutečné názvy a jména)? Doporučení: smazat.

Přesunuto do M2 za TASK-83 (2026-11-18): zkušební publikace má obsahovat hlas a ten aplikace před TASK-83 odeslat neumí.

Odpovědi uživatele (2026-11-18, decision-5): 1) druhá skrytá instance Orca Dev smí, jen se zálohou sdílených souborů jako pevným krokem; 2) zápisové části TASK-51 doověřit spolu s tímto tiketem, se zálohou; 3) pracovní data TASK-67 smazána. Pull request pro zkušební publikaci je určený; adresa je jen v CLAUDE.local.md. Tiket dál čeká na uživatele: publikaci provádí on a hlasování dodá až TASK-83.

Z TASK-114 (2026-11-19): při ověřování proti skutečné organizaci zkontrolovat, jestli items API může u neprázdného souboru vrátit HTTP 200 bez pole content. Dnes se taková odpověď bere jako prázdný text a od opravdu prázdného souboru ji nejde rozlišit.

Z TASK-76 (2026-11-19): při zkušební publikaci zkontrolovat ve webu Azure DevOps, jak se chová vlákno založené Orkou po dalším pushi. Orca zakládá vlákna s kontextem iterací 1-N, webové rozhraní N-N, a server vlákna 1-N při čtení nesleduje vůbec. Když se ve webu taková vlákna po pushi drží špatného řádku, založit tiket na úpravu payloadu publikace (firstComparingIteration).

K ověření z TASK-83 (hlas při publikaci), co z dokumentace Microsoftu neplyne jednoznačně. Volání: PUT {organizace}/{projekt}/_apis/git/repositories/{repositoryId}/pullRequests/{id}/reviewers/{reviewerId}?api-version=7.1, tělo {"vote": 10|5|-5|-10, "id": reviewerId}; dokumentace: https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-reviewers/create-pull-request-reviewer?view=azure-devops-rest-7.1 (popis operace: Add a reviewer to a pull request or cast a vote; PATCH téhož zdroje podle dokumentace mění jen isFlagged a hasDeclined).
1. Identifikátor reviewera: Orca posílá authenticatedUser.id z _apis/connectionData. Dokumentace říká jen ID of the reviewer; ověřit, že se shoduje s id uživatele v poli reviewers a hlas se připíše jemu.
2. Uživatel mezi reviewery není: z popisu plyne, že PUT ho přidá i s hlasem; ověřit na PR, kde uživatel reviewerem není (a že se nepřidá jako povinný).
3. Povinný reviewer: tělo nese jen vote a id. Ověřit, že PUT nezmění isRequired ani isFlagged a nesmaže hasDeclined jinak, než dělá web.
4. Čtení po zápisu: Orca po hlasu znovu čte PR a seznam; ověřit, že GET hned vrací nový hlas (řádek opustí skupinu Čeká na moje review bez ruční obnovy).
5. Oprávnění tokenu: dokumentace žádá rozsah vso.code_write. Ověřit hlášku v dialogu, když uložený token smí jen číst (očekává se HTTP 401/403 a hlas neodeslán, komentáře také ne nebo podle toho, co token dovolí).
6. Hlas na dokončeném nebo opuštěném PR a na vlastním PR Orca nenabízí a hostitel ho odmítne dřív, než cokoli odejde; chování serveru v těchto případech dokumentace neuvádí, neověřovat zápisem.
7. Azure DevOps Server (on-prem): cesta přes kolekci a případná přípona -preview u api-version jde stejnou cestou jako ostatní volání; ověřit jen, pokud se testuje on-prem.
8. Oznámení: text dialogu říká, že reviewers get notified (převzato z dosavadního potvrzení publikace); ověřit, že to pro hlas platí, jinak text upravit.
Postup zkoušky v Orca Dev: Drafts > Publish selected nebo Vote, v dialogu zvolit hlas, Publish; pořadí je komentáře a pak hlas.

Z TASK-77 (2026-11-19): při ověřování proti skutečné organizaci zkontrolovat, že seznam pull requestů se stavem all a parametrem skip vrací položky od nejnovějších a že skip u stránky po 100 funguje stejně jako u ověřených 500.
<!-- SECTION:NOTES:END -->
