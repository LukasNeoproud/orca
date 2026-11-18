---
id: TASK-94
title: 'Change review: strojově ověřené přesuny kódu a porovnání se zdrojem'
status: To Do
assignee: []
created_date: '2026-11-18T15:19:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-92
documentation:
  - docs/review-ide/05-funkce.md
priority: medium
type: feature
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Ve velkých diffech od AI tvoří přesunutý kód velkou část řádků a textový diff ho ukazuje jako smazání a nový kód. Orca ho má rozpoznat strojově, sbalit a nabídnout porovnání se zdrojem, aby recenzent četl jen to, co se při přesunu změnilo.

### Rozsah

- Detekce v `src/main/change-review/`, zapojená do sestavení manifestu z TASK-91; manifest dostane druhy `move` a `move-edit` a odkaz na zdroj (soubor, rozsah, podobnost, způsob spárování).
- Postup převzatý z TASK-52: index normalizovaných odebraných řádků (oříznuté, sloučené mezery, bez prázdných řádků a řádků importů) přes všechny odebrané bloky a smazané soubory; pro každý přidaný blok nejdelší běhy shodných řádků; podobnost přes `diffArrays` z balíčku `diff`, který už je v závislostech. Výchozí prahy: `move` od 0,98, `move-edit` 0,60 až 0,98.
- Párování podle jména pro smazaný a přidaný soubor ve stejném modulu: shodný kmen po odebrání posledního slova v CamelCase (převod jedné architektonické role na jinou).
- Rozhraní v `src/renderer/src/components/change-review/`: odznak, sbalení, Porovnat se zdrojem (zdroj z merge base stávajícím čtením obsahu na commitu, diff ve stávajícím `DiffViewer`).

### Mimo rozsah

- `git diff --color-moved`, `range-diff`, `--find-copies-harder` a externí nástroje: detekce je vlastní.
- Přejmenování symbolu napříč soubory a další mechanické vzory, které potřebují language server (M3).
- Ověření tvrzení AI, že celek je jen přesun: vlastní tiket.

### Omezení

- Párování omez na kandidáty s aspoň třemi shodnými řádky a ignoruj řádky s méně než dvěma alfanumerickými tokeny, jinak shodují závorky a prázdné konstrukce.
- Verze analyzátoru přesunů vstupuje do klíče keše manifestu.
- Kalibruj na smyšleném repozitáři; nic z firemních projektů do testů ani do tiketu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Blok přesunutý beze změny do jiného souboru nebo na jiné místo má druh move s odkazem na zdroj; přesunutý a upravený blok má druh move-edit s mírou podobnosti
- [ ] #2 Dvojice smazaný a přidaný soubor ve stejném modulu se shodným kmenem jména je spárovaná i při nízké textové podobnosti a nese, že ji spárovalo jméno
- [ ] #3 Soubor složený jen z přesunů je v pohledu sbalený s odznakem ověřeného přesunu; přesunutý blok uvnitř jinak změněného souboru má odznak a akci Porovnat se zdrojem, která otevře diff zdrojového bloku proti novému
- [ ] #4 Smazaný soubor nebo blok, který není zdrojem žádného přesunu, je označený jako smazáno bez náhrady
- [ ] #5 Výsledek je deterministický: dva běhy dají stejné páry; prahy podobnosti jsou konstanty s testy na hranicích
- [ ] #6 Detekce nad diffem s 50 000 změněnými řádky doběhne lokálně do 5 sekund; měření je v poznámkách tiketu
- [ ] #7 Jednotkové testy pokrývají čistý přesun, přesun s úpravou, párování podle jména a falešnou shodu krátkých řádků; pohled je ověřený ve skrytém okně na smyšleném repozitáři
<!-- AC:END -->
