---
id: TASK-97
title: >-
  Change review: riziko celků, řazení podle rizika a hromadné schválení
  bezpečných
status: To Do
assignee: []
created_date: '2026-11-18T15:20:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-93
  - TASK-94
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: feature
ordinal: 219000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Review má začínat tam, kde je největší riziko, a bezpečné části má jít schválit najednou. Hodnocení celků z bodu 6 dokumentu AI a review se tu staví z faktorů, které jdou spočítat bez analytického jádra.

### Rozsah

- Riziková pravidla v `src/main/change-review/` jako součást sestavení manifestu z TASK-91: příznaky s vahami, skóre jako omezený součet vah.
  - Oslabený test: v testovém souboru (`src/shared/test-code-path.ts`) ubyly aserce, přibylo přeskočení testu, nebo se aserce liší jen literálem. Posuzuje se celý rozsah, ne jednotlivé commity.
  - Smazáno bez náhrady: příznak z detekce přesunů (TASK-94).
  - Citlivá oblast: vzory cest z nastavení repozitáře v Orce; výchozí sada podle běžných názvů.
  - Četnost změn: počet commitů souboru za poslední období, omezený dotaz na pojmenovaný ref.
- Nastavení citlivých oblastí: sekce v `src/renderer/src/components/settings/RepositoryPane.tsx`, uložení v `Repo` (`src/shared/repo-types.ts`). Otisk nastavení vstupuje do klíče keše manifestu.
- Rozhraní v `src/renderer/src/components/change-review/`: riziko u celku, řazení, akce Schválit bezpečné (zapíše stav přes TASK-93).

### Mimo rozsah

- Složitost kódu (M4), pokrytí testy (až bude zdroj pokrytí) a podíl kódu od AI (M7): faktory z dokumentace, které tento tiket nedodá.
- Hodnocení nálezů AI: vlastní tiket.
- Pravidla vrstev a kontroly IDE (M4, M5).

### Omezení

- Příznaky jen řadí a nic neblokují; vzory podle regulárních výrazů dávají falešné poplachy.
- Git Scan Safety: historie jen pro soubory změny, s `--max-count` a pojmenovaným refem; žádné `--all`.
- Nastavení citlivých oblastí žije v Orce, ne v repozitáři.
- Pravidla podle jazyka jen podle přípony souboru; žádný parser.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Každý hunk nese rizikové příznaky a skóre; celek i skupina ukazují své riziko a příznaky, ze kterých vzniklo
- [ ] #2 Uměle oslabený test (odebraná aserce, přidané přeskočení testu, aserce změněná jen v literálu) dostane příznak oslabeného testu
- [ ] #3 Citlivé oblasti (platby, migrace, oprávnění, bezpečnost) jdou nastavit vzory cest v nastavení repozitáře v Orce; změna v nich zvyšuje riziko
- [ ] #4 Četnost změn souboru se počítá z historie omezeným dotazem na git a vstupuje do skóre
- [ ] #5 Pohled řadí celky od nejrizikovějšího a řazení jde přepnout zpět na pořadí podle cesty
- [ ] #6 Celky složené jen z generovaného kódu, čistých přejmenování, bílých znaků, importů a ověřených přesunů jdou schválit jednou akcí; akce nikdy nezahrne hunk druhu semantic
- [ ] #7 Stejný vstup dá stejné skóre; pravidla mají jednotkové testy a pohled je ověřený ve skrytém okně na smyšleném repozitáři
- [ ] #8 docs/review-ide/06-ai-a-review.md bod 6 uvádí, které faktory rizika jsou hotové a které čekají na analytické jádro a původ změn
<!-- AC:END -->
