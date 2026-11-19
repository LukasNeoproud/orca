---
id: TASK-127
title: 'AI review: otázka na AI s odpovědí u řádku diffu'
status: To Do
assignee: []
created_date: '2026-11-19T09:38:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-107
documentation:
  - docs/review-ide/05-funkce.md
priority: medium
type: feature
ordinal: 227100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Recenzent se má AI umět zeptat na konkrétní řádek nebo výběr v diffu pull requestu a odpověď vidět u řádku, odkud se ptal. Navazuje na otázky u draftu z TASK-107 a používá jejich záznam, doručení i nástroje agenta.

### Rozsah

- Cíl otázky soubor a rozsah řádků v záznamu otázek z TASK-107 (úložiště vedle draftů, `src/main/azure-devops/review/azure-devops-review-draft-store.ts`); odeslání stávající cestou do AI chatu pull requestu (`src/renderer/src/components/azure-devops-review/azure-devops-draft-rework-delivery.ts`, `src/renderer/src/lib/azure-devops-review-chat.ts`); odpověď agenta nástrojem z TASK-107 (`src/shared/azure-devops-review-tools.ts`, CLI `src/cli/specs/azure-devops.ts`, Pi rozšíření).
- Rozhraní: otázka a odpověď u řádku stejným mechanismem jako inline komentáře (`use-azure-devops-review-inline-comments.tsx`, `azure-devops-review-inline-comments.ts`); z odpovědi jedním krokem draft komentáře.
- RPC `azureDevOpsReview.*` z TASK-107 pro čtení a zápis otázek s cílem v řádcích.

### Mimo rozsah

- Souhrn review a otázky u draftu: TASK-107.
- Otázky a odpovědi v mobilní aplikaci.
- Otázky na AI mimo pull request (v běžném diffu workspace existují poznámky pro agenta).

### Omezení

- Otázka i kód odcházejí k poskytovateli AI jen akcí uživatele, stejnou cestou jako dnešní AI review.
- Odpověď agenta je nedůvěryhodný text: zobrazuj ji jako markdown bez spouštění čehokoli.
- Agent nepublikuje a odpovědí nesmí měnit drafty, pokud o to otázka nežádá.
- Nové metody RPC vyjednané, nová pole nepovinná.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Zeptat se AI na řádek nebo výběr v diffu pull requestu pošle otázku s místem v kódu; odpověď se zobrazí u řádku a jde z ní jedním krokem udělat draft komentáře
- [ ] #2 Otázky a odpovědi u řádku vidí jen uživatel, nikdy se nepublikují a přežijí restart; otázku s odpovědí jde smazat
- [ ] #3 Bez běžícího AI chatu akce nabídne jeho spuštění; nedoručenou otázku rozhraní ohlásí a neztratí ji
- [ ] #4 Agent odpovídá jen přes nástroje Orky (MCP, CLI, Pi rozšíření); odpověď na neexistující otázku vrátí chybu, kterou může opravit
- [ ] #5 Starší hostitel bez podpory otázek u řádku akci nenabídne; otázky u draftu, odeslání draftů AI k přepracování a čtení draftů starším mobilním klientem fungují jako dosud
- [ ] #6 Cíl otázky v souboru a rozsahu řádků má testy, katalog parametrů RPC je přegenerovaný, pokud se parametry změnily, a průchod je ověřený ve skrytém okně se smyšleným agentem
<!-- AC:END -->
