---
id: TASK-107
title: 'AI review: souhrn review a otázky na AI s odpovědí u nálezu a u řádku'
status: To Do
assignee: []
created_date: '2026-11-18T15:26:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/05-funkce.md
priority: medium
type: feature
ordinal: 227000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Recenzent se má AI umět zeptat na konkrétní nález nebo řádek a dostat odpověď tam, kde se ptal, a po AI review má vidět její souhrn celého pull requestu. Dnes jde drafty jen poslat AI k přepracování a odpověď je vidět jen v chatu.

### Rozsah

- Co už existuje: dialog Send drafts to AI (`src/renderer/src/components/azure-devops-review/AzureDevOpsDraftsAiDialog.tsx`, `AzureDevOpsDraftAiPrompt.tsx`) pošle pokyny k draftům do AI chatu pull requestu (`azure-devops-draft-rework-delivery.ts`, `src/renderer/src/lib/azure-devops-review-chat.ts`, prompt `src/shared/azure-devops-draft-rework-prompt.ts`); agent pak drafty upraví na místě.
- Souhrn review: záznam na pull request a iteraci, který agent zapíše nástrojem; úložiště vedle draftů (`src/main/azure-devops/review/azure-devops-review-draft-store.ts`), zobrazení v `AzureDevOpsReviewDrafts.tsx`. Prompt `src/shared/azure-devops-review-prompt.ts` o souhrn žádá na konci review.
- Otázky: záznam s cílem (draft, nebo soubor a rozsah řádků), otázkou a odpovědí. Odeslání stávající cestou do AI chatu; agent odpovídá nástrojem (`src/shared/azure-devops-review-tools.ts`, CLI `src/cli/specs/azure-devops.ts`, Pi rozšíření).
- Rozhraní: odpověď pod kartou draftu (`AzureDevOpsReviewDraftCard.tsx`); otázka a odpověď u řádku stejným mechanismem jako inline komentáře (`use-azure-devops-review-inline-comments.tsx`, `azure-devops-review-inline-comments.ts`).
- RPC `azureDevOpsReview.*` pro čtení a zápis souhrnu a otázek.
- Pořadí práce: nejdřív souhrn a otázky u draftu, potom otázka u řádku; kdyby se celek nevešel do jednoho běhu, vrať otázku u řádku jako navazující tiket.

### Mimo rozsah

- Souhrn celé změny a celky v Change review (vlastní tikety).
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
- [ ] #1 Po AI review ukazuje záložka draftů nahoře souhrn AI k pull requestu, označený jako výstup AI s iterací, pro kterou vznikl; po novém pushi je označený jako zastaralý
- [ ] #2 Zeptat se AI u draftu pošle otázku běžícímu AI chatu pull requestu; odpověď se zobrazí pod draftem a draft se bez pokynu nezmění
- [ ] #3 Zeptat se AI na řádek nebo výběr v diffu pull requestu pošle otázku s místem v kódu; odpověď se zobrazí u řádku a jde z ní jedním krokem udělat draft komentáře
- [ ] #4 Otázky a odpovědi vidí jen uživatel, nikdy se nepublikují a přežijí restart; otázku s odpovědí jde smazat
- [ ] #5 Bez běžícího AI chatu akce nabídne jeho spuštění; nedoručenou otázku rozhraní ohlásí a neztratí ji
- [ ] #6 Agent zapisuje souhrn a odpovědi jen přes nástroje Orky (MCP, CLI, Pi rozšíření); odpověď na neexistující otázku vrátí chybu, kterou může opravit
- [ ] #7 Stávající odeslání draftů AI k přepracování funguje jako dosud; starší hostitel a starší mobilní klient dál čtou a publikují drafty
- [ ] #8 Úložiště, nástroje a prompt mají testy, katalog parametrů RPC je přegenerovaný a průchod je ověřený ve skrytém okně se smyšleným agentem
<!-- AC:END -->
