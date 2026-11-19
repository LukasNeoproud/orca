---
id: TASK-101
title: >-
  Nálezy na mých PR: změna od agenta u vlákna a krok Commitnout, odpovědět a
  vyřešit
status: To Do
assignee: []
created_date: '2026-11-18T15:23:00Z'
updated_date: '2026-11-19T11:41:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-100
documentation:
  - docs/review-ide/05-funkce.md
priority: high
type: feature
ordinal: 215000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Když připomínka reviewera vyžaduje změnu kódu, má ji agent připravit ve workspace větve pull requestu, autor ji uvidí jako diff u vlákna, může ji zahodit a jedním krokem commitnout, odpovědět a vlákno vyřešit.

### Rozsah

- Spuštění agenta pro jedno vlákno stávající cestou z TASK-100 (`src/renderer/src/lib/azure-devops-feedback-agent.ts`, `src/shared/azure-devops-feedback-prompt.ts`); změna vzniká ve workspace větve autora (`src/main/azure-devops/review/azure-devops-feedback-worktree.ts`), nikdy v review worktree.
- Vazba změny na vlákno: agent u draftu odpovědi uvede soubory, které kvůli vláknu změnil (nepovinné pole draftu v `src/shared/azure-devops-review-types.ts`, nástroje v `src/shared/azure-devops-review-tools.ts`, CLI `orca ado draft`). Orca si před během zapamatuje stav workspace, aby poznala, co bylo rozpracované už předtím.
- Diff pod vláknem: necommitnuté změny uvedených souborů stávajícím diffem pracovního stromu.
- Kroky nad gitem stávajícími metodami `git.stage`, `git.commit`, `git.push` a `git.discard` (`src/main/runtime/rpc/methods/git.ts`, `src/main/runtime/runtime-git-sync-commands.ts`, `src/main/runtime/runtime-git-staging-commands.ts`); odpověď a stav vlákna stávající publikací draftu.
- Potvrzovací dialog a řízení pořadí kroků v `src/renderer/src/components/azure-devops-review/`.

### Mimo rozsah

- Změna pro více vláken jedním commitem s rozdělením po vláknech; hromadný tok přes dialog zůstává jako dosud.
- Návrh zprávy commitu od AI nad rámec toho, co navrhne agent v draftu.
- Vynucené přepsání historie a řešení konfliktů při odeslání; selhání se jen ohlásí.

### Omezení

- Změna od agenta je jen ve worktree, dokud ji uživatel nepotvrdí; nic se neodešle bez potvrzení.
- Výchozí stav volby odeslat větev je otázka pro uživatele v TASK-69; do rozhodnutí je volba nezaškrtnutá.
- Při vývoji nic neodesílej do skutečného vzdáleného repozitáře ani do Azure DevOps: test používá místní holý repozitář a smyšlené odpovědi serveru.
- Zahození nesmí smazat práci uživatele: týká se jen souborů, které byly před během čisté.
- Git běží na hostiteli, který workspace vlastní.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Akce Nechat agenta připravit změnu u vlákna spustí agenta ve workspace větve pull requestu jen pro toto vlákno; agent změnu necommituje a nic neodesílá
- [ ] #2 Po běhu je pod vláknem diff souborů, které agent kvůli vláknu změnil, a návrh odpovědi; Zahodit změnu po potvrzení vrátí tyto soubory do stavu před během a nedotkne se jiných rozpracovaných změn
- [ ] #3 Commitnout, odpovědět a vyřešit ukáže v jednom potvrzení soubory, zprávu commitu, text odpovědi a volbu odeslat větev; po potvrzení proběhne commit, odeslání větve, odpověď a uzavření vlákna v tomto pořadí
- [ ] #4 Když některý krok selže, další se neprovedou a uživatel vidí, co proběhlo; odpověď se nikdy neodešle, dokud commit není na vzdáleném repozitáři
- [ ] #5 Bez volby odeslat větev krok jen commitne a draft odpovědi zůstane připravený
- [ ] #6 Když měl workspace před během agenta rozpracované změny ve stejných souborech, krok jedním commitem se nenabídne a rozhraní řekne proč
- [ ] #7 Workspace na SSH hostiteli commituje a odesílá na svém hostiteli; pull request z forku krok nenabízí
- [ ] #8 Testy pokrývají pořadí kroků, selhání každého z nich a zahození změny; průchod je ověřený ve skrytém okně na smyšleném repozitáři s místním vzdáleným repozitářem a smyšleným serverem
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Otázka D4 (odeslání větve z kroku Commitnout, odpovědět a vyřešit) zůstává otevřená: uživatel 2026-11-19 chtěl víc kontextu.
<!-- SECTION:NOTES:END -->
