---
id: TASK-69
title: Rozepsat tikety milníku M2 Review
status: Done
assignee: []
created_date: '2026-11-18T12:44:00Z'
updated_date: '2026-11-18T16:16:00Z'
labels:
  - review-ide
  - planovani
  - effort-xhigh
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: task
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Připravit tikety pro milník Review tak, aby na ně šlo navázat hned po M1.

### Podklady

- `docs/review-ide/05-funkce.md`, oddíly 5 až 7; `docs/review-ide/06-ai-a-review.md`, body 3, 7 a 8 jako první, pak 5 a 6.
- Stav TASK-51 a výsledek TASK-67.
- TASK-52 (revize změn s ověřenými tvrzeními) řeší stejný problém jako Diff po celcích a Nálezy s důkazem. Navrhni jedno řešení: co z TASK-52 se převezme (klíč hunku, manifest, úrovně důvěry) a zda TASK-52 zůstane, rozdělí se, nebo zanikne.
- Kód: `src/renderer/src/components/azure-devops-review`, `src/main/azure-devops/review`, `src/renderer/src/components/editor/combined-diff`, `src/shared/agent-hook-listener`.

### Poznámky k rozsahu

- Druhy důkazu a brány kvality, které potřebují language servery nebo analytické jádro, odlož do M3 a M4; v M2 jen to, co jde bez nich (lint, build, testy, výstup příkazu).
- Hlasování při publikaci: nejdřív ověř, co už stránka pull requestu umí.

Tikety piš podle pravidel ve skillu `review-ide` (soubor `tikety.md`). Výchozí body v kódu ověř v aktuálním stromu, dokumentace vznikla nad starším commitem.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Každá funkce milníku z dokumentace má tiket, nebo je výslovně odložená s důvodem v poznámkách tohoto tiketu
- [x] #2 Každý tiket má odkaz na oddíl dokumentace, cíl, rozsah, mimo rozsah, výchozí body v kódu ověřené v aktuálním stromu, omezení, pozorovatelná akceptační kritéria a štítek effort
- [x] #3 Každý tiket zvládne jeden worker v jednom běhu; větší celky jsou rozdělené na svislé řezy, které jdou samostatně ověřit
- [x] #4 Závislosti jsou jen tam, kde je skutečné pořadí, a netvoří cyklus
- [x] #5 Otázky pro uživatele k rozsahu, placeným službám a chování navenek jsou v poznámkách tiketu, každá s možnostmi a doporučením
- [x] #6 Popis milníku v backlog/milestones odpovídá naplánovanému rozsahu
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker, 2026-11-18): 1) přečíst docs 05 (odd. 4-7) a 06 (body 2-8), TASK-51/52/61/63/67 a tikety m-2 (76, 77, 78, 82); 2) projít kód azure-devops review (main, renderer, shared, CLI/MCP), combined-diff, agent hooky, AI vault a prompty pr-comments/pr-checks a zapsat, co už existuje; 3) vypsat funkce M2, rozdělit na tikety nebo odložit s důvodem, navrhnout sloučení s TASK-52; 4) založit tikety, přečíslovat ordinaly 76-78 a 82; 5) otázky pro uživatele do poznámek; 6) upravit popis milníku m-2; 7) stav.mjs.

Stav kódu ověřený 2026-11-18 (strom na 7d3798cc92):
- Stránka pull requestu (components/azure-devops-review): záložky Overview, Files, Threads, Drafts; drafty inline, souborové, obecné a odpovědi se stavem vlákna; publikace vybraných draftů; AI review a přepracování draftů přes agenta; na vlastním pull requestu agent řeší vlákna ve workspace větve (feedback worktree) a píše drafty odpovědí.
- Chybí: hlasování (myVote se jen čte, klient nemá zápis hlasu), revieweři, stav kontrol a rozsah v hlavičce, pracovní položky (žádné volání wit ani pullRequests/workitems), závažnost, jistota a důkaz u draftu, bod posledního review, souhrn AI.
- Review worktree je na pull request (ne na repozitář), odpojený HEAD, baseRef na cíl; registr v ~/.orca.
- Diff: combined-diff a DiffSectionItem sdílí stránka pull requestu i Source Control; TASK-52 (change-review) není implementovaný vůbec, jeho výchozí body v kódu existují.
- Hooky agentů jsou jednosměrné: skript odpoví agentovi dřív, než Orca událost uvidí, takže hook Stop nejde použít k zablokování. Smyčka bran musí poslat novou zprávu (sendAgentTurn). Z nástrojů se drží jen náhled vstupu do 160 znaků; plné úpravy jsou jen v přepisu agenta a v deníku strukturovaných sezení.
- Nastavení příkazů lint, build a test na repozitář neexistuje (orca.yaml má jen setup, archive a issueCommand). Spuštění příkazu ve worktree lokálně i přes SSH umí runAutomationPrecheck.
- Orca nemá běh agenta, který vrátí strukturovaný výstup kódu; AI píše výsledky přes nástroje (orca ado, MCP, Pi). Jednorázový text (commit message) jde přes CLI agenta v print režimu.

Rozpis M2 (2026-11-18): 26 nových tiketů TASK-83 až TASK-108, čtyři stávající přeřazené. Pořadí ve frontě podle ordinalu:

1. TASK-76 (201000, chyba, stávající) poloha inline komentářů po nové iteraci
2. TASK-83 hlas při publikaci
3. TASK-77 (203000, chyba, stávající) stránkování seznamu
4. TASK-84 nálezy s důkazem: model, závažnost, jistota, citace kódu
5. TASK-85 brány: definice a spuštění na pokyn
6. TASK-86 brány: stav u workspace a panel
7. TASK-87 brány: smyčka po kroku agenta
8. TASK-88 nálezy s důkazem: důkaz z běhu kontroly
9. TASK-89 re-review: bod posledního review a změny od něj
10. TASK-90 re-review: posouzení otevřených vláken
11. TASK-91 change review: identita hunku a manifest
12. TASK-92 change review: pohled
13. TASK-93 change review: stav revize po hunkách
14. TASK-100 nálezy na mých PR: čekající vlákna, Odpovědět a vyřešit
15. TASK-101 nálezy na mých PR: změna od agenta, Commitnout, odpovědět a vyřešit
16. TASK-94 change review: přesuny
17. TASK-95 change review: nástroje agenta a úložiště celků
18. TASK-96 change review: celky a souhrn AI v pohledu
19. TASK-97 change review: riziko a hromadné schválení
20. TASK-98 change review: ověření tvrzení AI
21. TASK-99 stránka PR: revieweři, kontroly, rozsah
22. TASK-102 seznam PR: kontroly, vlákna, akce
23. TASK-103 nálezy: priorita, seskupení, filtry
24. TASK-104 brány u pull requestu
25. TASK-105 zadání: pracovní položky
26. TASK-106 change review: pokrytí kritérií
27. TASK-107 souhrn AI review a otázky na AI
28. TASK-78 (228000, chyba, stávající, nízká priorita)
29. TASK-82 (229000, stávající, čeká na uživatele) oznámení
30. TASK-108 (čeká na uživatele) příprava celků na pozadí

První vlna končí TASK-101 (ordinal 215000): po ní funguje všech šest hlavních funkcí milníku aspoň v základu. Druhá vlna je prohlubuje. Stávající tikety 76, 77, 78 a 82 jsou jen přečíslované, žádný nový je nezdvojuje: TASK-90 na TASK-76 závisí, TASK-102 oznámení nechává TASK-82.

Kde je která funkce z dokumentace:
- 05 odd. 4 (zbytek po TASK-63): stav kontrol a počet vláken na řádku, Odpovědět na nálezy, Otevřít chybu: TASK-102. Oznámení: TASK-82.
- 05 odd. 5: hlavička a počty draftů u souborů TASK-99; odkaz na Diff po celcích TASK-92; pracovní položka a kontrola proti zadání TASK-105; závažnost a úryvek kódu u draftu TASK-84; Zeptat se AI u nálezu a na řádek, souhrn AI TASK-107; hlasování TASK-83. Spustit AI review znovu, Upravit ručně, Zahodit a výběr k publikaci už existují.
- 05 odd. 6: TASK-100 a TASK-101.
- 05 odd. 7: šum a jeho skrytí TASK-91 a TASK-92; celky, komentáře a souhrn TASK-95 a TASK-96; zkontrolováno a průběh TASK-93; panel zadání a změny mimo zadání TASK-106; výpočet na pozadí TASK-108; uložení podle commitu TASK-95.
- 06 bod 3: TASK-85, TASK-86, TASK-87, TASK-104.
- 06 bod 7: TASK-84, TASK-88.
- 06 bod 8: TASK-89, TASK-90; diff od posledního review po celcích řeší filtr Změněno od revize v TASK-93.
- 06 bod 6: riziko celků TASK-97 a TASK-98; atributy nálezů TASK-84 a TASK-103.

Návrh: jedno řešení pro TASK-52 a Diff po celcích.

Je to jedna funkce. Interně se jmenuje change-review (adresáře, RPC changeReview.*, CLI orca change-review), v rozhraní Change review, v dokumentaci Diff po celcích. Pracuje nad git worktree a bází, ne nad API Azure DevOps, takže funguje pro vlastní workspace, review worktree pull requestu i pro GitHub a GitLab.

Z TASK-52 se přebírá:
- identita hunku: klíč z cesty, otisku obsahu a pořadí; přežije posun řádků, push i rebase (TASK-91);
- deterministický manifest změny s keší podle commitu, druhy hunků (generovaný kód, přejmenování, bílé znaky, importy, přesun) a skupiny podle modulu (TASK-91, TASK-94);
- úrovně důvěry verified, claimed, contradicted. Stejný slovník používají nálezy s důkazem (ověřeno důkazem, pravděpodobné, nejisté, vyvráceno): ověřeno smí být jen to, co potvrdil stroj (TASK-84, TASK-98);
- stav revize po hunkách, který přežije push (TASK-93); tím je zároveň pokryté Zkontrolováno u celku a inkrementální re-review v tomto pohledu;
- AI jen přiřazuje existující hunky do celků přes nástroje, které odmítnou neznámý identifikátor; celek z dokumentace je intent z TASK-52 (TASK-95, TASK-96);
- strojové ověření tvrzení AI a rizikové příznaky včetně oslabeného testu (TASK-97, TASK-98);
- nic se nezapisuje do repozitáře ani do gitu; vstup je tlačítko v porovnání s bází (potvrzeno 2026-11-02).

Z dokumentace se přebírá: souhrn AI, tematické celky s komentářem, skrytý šum s počty, panel zadání s pokrytím kritérií, průběh revize, odkaz ze stránky pull requestu.

Nepřebírá se: Python prototyp; původ hunku z přepisů agentů a vysvětlení Why (patří do M7 k původu změn, TASK-74); projekce do grafických pohledů a pokrytí testy (M4, M5); druhý, oponentní běh AI; git diff --color-moved a range-diff.

Co s TASK-52: rozdělit. Jeho fáze 1 až 3 pokrývají TASK-91 až TASK-98. TASK-52 jsem neměnil; po potvrzení uživatelem ho doporučuji archivovat s odkazem na tyto tikety. Záznam rozhodnutí o schématu a o tom, co se z TASK-52 převzalo, píše worker TASK-91 (je to jeho akceptační kritérium). Popis TASK-52 obsahuje názvy z firemního projektu; do nových tiketů se nic z nich nepřeneslo.

Odloženo z M2 a proč:
- Původ řádků na okraji diffu, rozlišení AI a vývojáře u rozhodnutí mimo zadání, důvod u hunku (05 odd. 7, 06 bod 5): potřebují plné zápisy agenta. Hooky dnes drží jen náhled vstupu nástroje do 160 znaků; plné úpravy jsou jen v přepisech. Patří do M7 (TASK-74).
- Brány: diagnostika language serveru (M3), pravidla vrstev (M4), vlastní kontroly IDE a SARIF (M5), build a testy jen změněných modulů (potřebuje model, M4), rozbor výstupu na nálezy se souborem a řádkem (M3). V M2 je brána příkaz zadaný uživatelem.
- Brány po každém zápisu do souboru: build po každé úpravě je pomalý a zahlcuje agenta; vrátit se k tomu s diagnostikou language serveru v M3.
- Druhy důkazu: reference a typy z language serveru (M3), reprodukce v emulátoru (M8), kontrakt jiné platformy (M7). V M2 citace kódu a běh příkazu.
- Riziko celků: složitost (M4), pokrytí testy (Orca nemá zdroj pokrytí), podíl kódu od AI (M7). V M2 četnost změn, citlivé oblasti, oslabený test, smazáno bez náhrady.
- Nálezy: dopad na úrovni modulu a platformy (M4), četnost napříč projektem, nálezy z lintu a kontrol IDE ve stejném seznamu (M3, M5).
- Pravidla projektu pro AI review (05 odd. 5): pravidla vrstev a kontroly vzniknou v M4 a M5; agent dnes čte instrukce z repozitáře sám.
- Odkaz z vlákna do souvisejícího pohledu (05 odd. 6): lokalizace M6, graf M5; odkaz na celek je malý navazující krok po TASK-96.
- Review během práce agenta (06 bod 2): průběžné celky ze zápisů agenta potřebují totéž co původ změn (M7). Poznámky v diffu poslané agentovi už existují.
- 06 body 1 (M4, M5), 4 (nízká priorita), 9 (M8), 10 (později), 11 (M7).
- Hlasování, souhrny a nová pole draftů v mobilní aplikaci: tikety drží jen kompatibilitu protokolu.
- Zbytek po TASK-64 (rozdělení rozdílů snapshotů na očekávané a nečekané, vazba oblasti na celek): viz otázka 9.
- Tři záložky stránky pull requestu podle dokumentace místo dnešních čtyř: viz otázka 10.

Otázky pro uživatele. Jeden tiket odpovídá zhruba jednomu běhu workera a jeho ověření. Bez odpovědi nejde začít jen TASK-108; ostatní tikety jsou napsané s opatrnou výchozí volbou a odpověď je jen upraví.

1. Má Orca připravovat celky AI sama, když přijde pull request k review? (blokuje TASK-108)
   - a) Ne, jen tlačítkem v pohledu. Žádné náklady navíc; první otevření čeká minuty na běh agenta.
   - b) Nabídnout u nového pull requestu jedním kliknutím, jako dnes AI review. Tokeny jen za pull requesty, které vyberete.
   - c) Spouštět sama u pull requestů, kde jste reviewer, s denním stropem a stropem velikosti. Každý pull request a každý nový push stojí jeden běh agenta z vašeho předplatného nebo účtu a založí review worktree na disku.
   - Doporučení: b) jako výchozí a c) jako volitelné nastavení na repozitář. Práce je v obou případech jeden tiket.

2. Smyčka bran kvality (TASK-87): má být vypnutá, dokud ji nezapnete?
   - a) Vypnutá, zapíná se na repozitář, limit tři kola. Agent sám od sebe žádné zprávy navíc nedostane.
   - b) Zapnutá všude, kde jsou brány nastavené. Méně klikání, ale každé selhání znamená další kolo agenta a tokeny bez vašeho pokynu.
   - Doporučení: a). Tiket je tak napsaný.

3. Má Orca zapisovat stav bran do Azure DevOps jako stav pull requestu? (TASK-104)
   - a) Ne, stav je jen v Orce. Kolegové bez Orky ho nevidí.
   - b) Ano. Vidí ho celý tým, ale je to zápis navenek, výsledek pochází z vašeho počítače a token potřebuje další oprávnění. Jeden tiket navíc.
   - Doporučení: a). Vrátit se k tomu, až brány používá víc lidí.

4. Krok Commitnout, odpovědět a vyřešit (TASK-101): má rovnou odeslat větev?
   - a) Volba v potvrzení, výchozí nezaškrtnutá (tak je tiket napsaný). Bez odeslání se jen commitne a odpověď počká.
   - b) Volba v potvrzení, výchozí zaškrtnutá. Jedno potvrzení udělá všechno; odpověď, že je opraveno, odejde, až když je commit na serveru.
   - c) Z tohoto kroku nikdy neodesílat. Odpovídat pak musíte zvlášť po vlastním pushi.
   - Doporučení: b). Vždy potvrzujete dialog, který ukáže, co odejde.

5. Zadání pro AI (TASK-105, TASK-106): smí text pracovní položky odcházet agentovi?
   - a) Jen když volbu Kontrolovat proti zadání zapnete u daného review; výchozí vypnuto (tak je tiket napsaný).
   - b) Výchozí zapnuto. Zadání dostane stejný poskytovatel AI, který už dnes dostává kód a popis pull requestu.
   - c) Nikdy; zadání se jen zobrazí. TASK-106 pak odpadá.
   - Doporučení: b); dokumentace s kontrolou proti zadání počítá.
   - Ruční krok: token Azure DevOps musí mít oprávnění číst pracovní položky. Když ho nemá, je potřeba vytvořit nový token; stránka to ohlásí.

6. Má publikovaný komentář nést závažnost a důkaz? (TASK-84)
   - a) Ne, publikuje se jen text draftu (tak je tiket napsaný).
   - b) Přidat závažnost na začátek komentáře.
   - c) Přidat i důkaz (příkaz a úryvek výstupu). Autor vidí, proč nález platí, ale komentáře jsou dlouhé a výstup může obsahovat cesty z vašeho počítače.
   - Doporučení: a) teď, b) jako malý navazující tiket, když to bude chybět.

7. Co s TASK-52?
   - a) Archivovat, až TASK-91 zapíše záznam rozhodnutí; jeho obsah pokrývají TASK-91 až TASK-98.
   - b) Nechat otevřený jako zastřešující.
   - c) Udělat v M2 i původ změn z přepisů agentů podle TASK-52. Zhruba čtyři tikety navíc a zásah do hooků agentů.
   - Doporučení: a).

8. Milník má 26 nových tiketů. Jak ho přijímat?
   - a) Průběžná akceptace po první vlně (po TASK-101): můžete začít používat hlasování, brány, důkazy, re-review, základ Change review a nálezy na vlastních pull requestech; druhá vlna jde potom.
   - b) Jedna akceptace na konci. Méně přerušení, ale první použitelný výsledek je o zhruba patnáct tiketů později.
   - c) Zkrátit milník: TASK-98, TASK-103, TASK-106 a TASK-107 přesunout později. Ušetří čtyři tikety; chybí pak ověření tvrzení AI, řazení nálezů, pokrytí kritérií a otázky na AI.
   - Doporučení: a).

9. Rozdíl snapshotů (zbytek po TASK-64): dělit rozdíly na očekávané a nečekané a vázat oblast obrázku na celek?
   - a) Nechat na plánování M5; potřebuje celky i navigační graf.
   - b) Přidat do M2 po TASK-96. Dva tikety navíc.
   - Doporučení: a).

10. Záložky stránky pull requestu: dokumentace popisuje tři (Popis a komentáře, Změny, AI review), aplikace má čtyři (Overview, Files, Threads, Drafts).
   - a) Nechat čtyři a opravit dokumentaci; žádná práce.
   - b) Přestavět podle dokumentace. Jeden tiket a změna rozložení, na které jste zvyklý.
   - Doporučení: a).

Tři otázky k oznámením zůstávají v TASK-82.

Pro koordinátora:
- TASK-68 (m-1) v prvním kritériu čeká publikaci hlasu; tu dodá až TASK-83. Buď TASK-68 zařadit za TASK-83, nebo jeho kritérium upravit.
- TASK-105 nezávisí na pokusu TASK-59, ale využije jeho záznam, pokud bude hotový dřív.
- `src/main/automations/precheck-runner.ts` volá `spawn` z `node:child_process` se `shell: true`, což AGENTS.md pro Windows zakazuje. TASK-85 to má vyřešit při zobecnění runneru.
- TASK-85 je největší tiket milníku (typy, runner, úložiště, RPC, CLI, nastavení). Kdyby se nevešel do jednoho běhu, přirozený řez je CLI a RPC napřed, nastavení v rozhraní potom.

Stav (2026-11-18): hotovo. Založeno 26 tiketů, přečíslovány TASK-76, 77, 78 a 82, upraven popis milníku m-2. Cesty citované v tiketech ověřeny skriptem proti stromu (chybí jen záměrně nové adresáře quality-gates a change-review). stav.mjs: M2 0/31, nic nečeká na neexistující tiket, závislosti míří jen na nižší ordinaly. Nic se neimplementovalo ani necommitovalo.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Milník M2 Review je rozepsaný na 26 tiketů (TASK-83 až TASK-108) ve čtyřech liniích: publikace s hlasem a inkrementální re-review, nálezy AI s důkazem, brány kvality a Change review nad manifestem hunků; k tomu práce s nálezy na vlastních pull requestech a zadání z pracovních položek. Stávající TASK-76, 77, 78 a 82 jsou zařazené do pořadí. Návrh sloučení s TASK-52, odložené funkce s důvody a deset otázek pro uživatele jsou v poznámkách; bez odpovědi nejde začít jen TASK-108, ostatní tikety mají opatrnou výchozí volbu (nic se neodesílá ani nespouští bez pokynu).
<!-- SECTION:FINAL_SUMMARY:END -->
