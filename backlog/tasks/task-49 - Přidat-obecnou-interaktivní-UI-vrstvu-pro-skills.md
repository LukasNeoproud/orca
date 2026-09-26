---
id: TASK-49
title: 'Přidat obecnou interaktivní UI vrstvu pro skills'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-26'
updated_date: '2026-09-26'
labels:
  - codex
  - interactive-ui
  - skills
dependencies: []
references:
  - src/shared/orca-interaction.ts
  - src/main/codex/codex-orca-interaction.ts
  - src/main/codex/codex-structured-thread-open.ts
  - src/main/codex/codex-server-request-disposition.ts
  - src/main/codex/codex-structured-prompt-replies.ts
  - src/main/codex/codex-interaction-question-fallback.ts
  - src/renderer/src/components/native-chat/NativeChatInteractionCard.tsx
  - src/renderer/src/components/native-chat/NativeChatInteractionBooleanControl.tsx
  - src/renderer/src/components/native-chat/NativeChatStructuredPromptCard.tsx
  - src/shared/agent-session-journal-types.ts
priority: high
type: feature
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Rozšířit Orcu o obecnou hostitelskou capability `orca.interact`, přes kterou může libovolný existující nebo budoucí AI skill získat od uživatele strukturovaný vstup v nativním UI. Capability nesmí být součástí konkrétního skillu ani vést k forkům typu `grill-me-interactive`: původní skills zůstávají přenositelné a bez Orcy pokračují běžnou textovou konverzací.

Orca při založení Codex app-server session:

1. zpřístupní jediný schema-driven dynamic tool `orca.interact`,
2. přidá krátkou obecnou developer instrukci, aby model tool preferoval pro strukturované volby a formuláře,
3. přeloží tool call na durable prompt oddělený od rendereru,
4. pozastaví odpověď toolu do Submit nebo Cancel,
5. lokálně validuje vstup a vrátí modelu pouze jednoduchý JSON výsledek.

Přímý Codex CLI tool ani Orca instrukci nedostane. Resumované Orca vlákno obnovuje dynamic tools z perzistovaného stavu Codexu; starší vlákno založené bez capability se kvůli experimentálnímu API dodatečně nemění.

### MVP protokol

Request obsahuje volitelné `title`, `description`, `submitLabel` a neprázdné `fields`. Každé pole má stabilní `id`, `type`, `label`, volitelný popis, `required` a typově specifická pravidla. Podporované typy:

- `single_choice`: `options`, `default`, `allowCustom`; právě jedna volba,
- `multi_choice`: `options`, `default`, `allowCustom`; více voleb,
- `boolean`: volitelný boolean `default`,
- `text`: jednořádkový text, `minLength`, `maxLength`,
- `textarea`: víceřádkový text, `minLength`, `maxLength`,
- `number`: `min`, `max`, `step`, `unit` a číselný `default`.

Option obsahuje `id`, `label`, volitelný `description` a `recommended`. `recommended` je pouze vizuální doporučení; nikdy automaticky nevybírá hodnotu. Předvýběr řídí výhradně `default`. `allowCustom` vrací explicitní custom hodnotu, ne neoznačený text.

Submitted response:

```json
{
  "status": "submitted",
  "values": {
    "storage": "sqlite",
    "offline": true,
    "minSdk": 26
  }
}
```

Custom hodnota:

```json
{
  "storage": {
    "type": "custom",
    "value": "PostgreSQL running locally"
  }
}
```

Cancel vždy vrací `{ "status": "cancelled" }`; nesmí použít default ani automaticky zrušit celý agent turn. Tool pouze získává vstup a nesmí sám provádět žádnou externí nebo destruktivní akci.

### Lifecycle a vrstvy

`Existing skill → LLM decision → orca.interact → Codex server request → Interaction controller/durable prompt → native renderer → local validation → structured tool response → LLM continues`.

Tool/MCP transport nesmí přímo manipulovat React komponentami. Sdílený request/result model, Codex transport/controller a renderer zůstávají oddělené, aby bylo možné později doplnit jiný frontend. Dynamické otázky zůstávají agent-driven: závislé otázky jsou samostatná tool volání, zatímco nezávislá pole lze spojit do jednoho multi-field formuláře.

### UI a validace

Renderer používá design system Orcy, existující tokeny a shadcn primitives. Musí podporovat klávesnici, myš, focus management, Escape/Cancel, smysluplný Enter, přístupné popisky, popisy bez závislosti na hoveru, disabled Submit při neplatném formuláři a lokální validaci required/min/max/step/minLength/maxLength. Nevalidní hodnotu nesmí odeslat jako úspěšný výsledek.

### Referenční scénáře

- `grill-me`: jedna `single_choice` otázka s doporučením a custom variantou, odpověď modelu a následná navazující otázka; původní skill se nemění.
- Fallback: stejný skill v přímém Codex CLI položí otázku textově bez chyby a bez hledání `orca.interact`.
- Multi-field: platforma, offline boolean, minimum SDK a poznámka se odešlou jedním strukturovaným formulářem.
- Třetí-party skill s obecným pokynem „ask the user to choose“ může capability využít jen díky hostitelskému overlayi.

### Mimo MVP

Neimplementovat workflow language, decision-tree engine, model-generated HTML/JavaScript, drag & drop, file browser, diff editor, persistentní stav rozpracovaných formulářů ani automatické úpravy původních skills. `checklist` a `approval` jsou možné pouze pokud nevytvářejí další protokolovou složitost.

Následné fáze mohou přidat review finding UI, diff/file/tree selection, ranking, reorder, editable table a agent retrospective. Field protokol proto musí být rozšiřitelný bez nových tool names a bez změn existujících skills.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Původní `grill-me` i jiné skills fungují bez Orcy stejně jako před změnou a nejsou kvůli interaktivnímu režimu forknuté ani kopírované.
- [x] #2 Nová strukturovaná Codex session založená Orkou dostane dynamic tool `orca.interact` a krátkou obecnou interaction instrukci; přímý Codex CLI je nedostane.
- [x] #3 Tool přijímá multi-field request s typy `single_choice`, `multi_choice`, `boolean`, `text`, `textarea` a `number` a architektura dovoluje přidat další field types bez nového toolu.
- [x] #4 Nativní Orca renderer používá existující design tokeny a komponenty a podporuje klávesnici, myš, fokus, smysluplný Enter a Escape/Cancel.
- [x] #5 `recommended` je vizuálně odlišitelné, ale nevybírá hodnotu; `default` ji může předvybrat a popisy variant jsou dostupné bez hoveru.
- [x] #6 `allowCustom` funguje a vrací explicitní custom hodnotu; single i multi choice používají stabilní option IDs.
- [x] #7 Required a typově specifická validace probíhá lokálně, nevalidní formulář nelze odeslat a agent dostane pouze validní structured JSON response.
- [x] #8 Submit vrátí `{status:"submitted",values:{...}}`; Cancel vrátí přesně `{status:"cancelled"}` bez výběru defaultu a bez automatického zrušení turnu.
- [x] #9 Tool call čeká v durable prompt lifecycle, po odpovědi se vyřeší právě jednou a neznámé nebo nevalidní dynamic tool requesty zůstanou bezpečně odmítnuté.
- [x] #10 Tool nikdy sám neprovádí externí akce; pouze vrací uživatelský vstup agentovi.
- [x] #11 Referenční `grill-me` flow zvládne v Orce několik navazujících rozhodnutí a model nemusí parsovat odpovědi z přirozeného textu.
- [x] #12 Cílené unit/component testy pokrývají schema, validaci, thread injection, dynamic tool dispatch, Submit, Cancel, custom answer, recommended/default a multi-field formulář; projdou relevantní typecheck a changed-file quality checks.

<!-- AC:END -->

## Implementation Notes

Implementace cílí na nativní strukturovaný Codex app-server runtime. Použije experimentální `ThreadStartParams.dynamicTools` a existující `item/tool/call` server request; `experimentalApi` už Orca při handshake vyjednává. Wire změna má být aditivní a zachovat fallback reprezentaci existujícího question promptu pro smíšené verze klienta a hostu.

Implementováno jako sdílený Zod model, Codex dynamic-tool adapter, durable journal prompt a nativní React formulář. Starší klienti dál uvidí aditivní `question` prompt; neznámý dynamic tool je odmítnut bez spuštění akce. `checklist` a `approval` zůstaly podle scope mimo MVP, protože všech šest povinných typů sdílí jeden rozšiřitelný discriminated-union protokol.

Po nezávislém review byla kompatibilita dotažena tak, že nepodporovaný budoucí field type nezneplatní celý journal row a starší klient použije běžný grouped-question formulář. Jeho odpověď host převede a znovu ověří proti stejnému interaction schématu. Orca overlay se připojuje k efektivním `developer_instructions` načteným přes `config/read`; pokud je nelze bezpečně načíst, Orca je nepřepíše a krátká preference zůstává v popisu dynamic toolu.

Druhé nezávislé review doplnilo explicitní Yes/No pro povinný boolean bez defaultu, strukturovaný Cancel i u fallback rendereru, bezpečné Skip chování volitelných grouped polí, zachování whitespace textových hodnot a bounded RPC limit dostatečný pro validní interaction response. Neznámý budoucí field type tak degraduje na běžné otázky bez ztráty lifecycle semantiky.

Původní skills ani pluginy nebyly změněny a v `agent-marketplace` nevznikl fork. Graceful fallback je dán hostitelskou dostupností: `orca.interact` a overlay se přidávají pouze při založení vlákna přes Orcu.

Ověření 2026-09-26:

- `pnpm tc`, `pnpm tc:node`, `pnpm tc:web` prošly,
- 12 cílených test souborů / 189 testů a samostatný RPC boundary test prošly,
- přímý `oxlint` všech dotčených souborů a max-lines ratchet prošly,
- globální changed-code quality gate a plný test suite jsou blokované existujícími nesouvisejícími změnami/failures v extension, mobile, daemon a runtime částech worktree; žádný hlášený finding necílí na tuto implementaci.
