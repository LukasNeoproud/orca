---
id: TASK-14
title: >-
  Umožnit agentovi řídit compaction a přechod do nového kontextu přes nástroje
  Orcy
status: To Do
assignee: []
created_date: '2026-09-22 12:49'
labels: []
dependencies: []
references:
  - 'https://learn.chatgpt.com/docs/app-server'
documentation:
  - docs/reference/conversation-branching.md
  - docs/reference/ssh-execution-boundary.md
  - docs/reference/remote-wire-compatibility.md
type: feature
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Umožnit modelu rozhodnout, kdy po dokončení uceleného tématu zmenší kontext nebo začne novou etapu s čistým kontextem. Agent má používat běžný nástroj Orcy a stručné instrukce (skill nebo instrukce dodávané runtime), nikoli čekat pouze na pevný tokenový limit či ruční /compact. Tento task je zadání pro pozdější implementaci; nyní žádnou funkci nezapínat ani nedistribuovat instrukce do spotřebitelských projektů.

## Navržený kontrakt

Pracovní názvy: request_compaction(reason, checkpoint_ref) a request_fresh_context(reason, checkpoint_ref, next_step). Finální názvy přizpůsobit existujícímu nástrojovému rozhraní Orcy. Host určí aktuální session, workspace a execution host; agent nesmí libovolným thread ID ovládat cizí relaci. Nástroj vrací request ID a stav queued/unsupported/rejected, nikoli nepravdivé completed. Přidat možnost zjistit výsledek požadavku.

Compaction zachová konverzaci se shrnutou historií. Fresh context vytvoří nové navázané vlákno a předá pouze trvalé instrukce, ověřený checkpoint a konkrétní další zadání; původní historii nemaže. Neprezentovat fork kopírující celou historii jako čistý kontext. Zachovat model, reasoning, workspace, oprávnění a platný rozsah autorizace, explicitní omezení a uživatelská rozhodnutí. Nová relace nezískává širší oprávnění.

## Životní cyklus

1. Model uloží checkpoint: cíl, dokončené téma, rozhodnutí a omezení, soubory/změny, testy a výsledky, otevřené otázky a další konkrétní krok. Podporovat existující projektovou dokumentaci i runtime checkpoint; nevyžadovat v každém projektu backlog.md ani automaticky přepisovat AGENTS.md.
2. Zavolá nástroj, dostane potvrzení zařazení a ukončí aktuální tah. Host nečeká uvnitř tool call na dokončení téhož tahu (prevence deadlocku).
3. Orca provede požadavek až na ověřené bezpečné hranici. Ošetřit pending tool calls, běžící subagenty/procesy, nové uživatelské zprávy a změnu zdrojové revize. Samotné turn/completed nemusí znamenat, že veškerá práce skončila. Nový vstup nesmí zmizet ani být přepsán starým checkpointem.
4. Po potvrzeném dokončení compaction nebo založení nového vlákna automaticky pokračuje autorizovaným dalším krokem; při pauze/stop nebo chybě nepokračuje. Rozlišit přijetí RPC od skutečně dokončené compaction. Zachovat navigaci k původnímu vláknu.

## Instrukce pro model

Compaction volit po uzavření většího tématu, pokud podstatná část kontextu už není potřebná. Fresh context jen při přechodu k samostatné etapě s dostatečným checkpointem. Zachovat kontext během rozpracované analýzy, diagnostiky či provázané změny. Neprovádět po každém drobném kroku, nezavádět smyčky opakovaných resetů; minimální užitečný odstup a omezení opakování. Pevný auto-compaction limit zůstává záložním mechanismem, jeho hodnotu ani model_context_window tato funkce sama nemění. Měřit tokeny, četnost a opakovanou práci, negarantovat úsporu.

## Implementační vodítka a znovupoužití

Při průzkumu 2026-09-22 existují src/main/native-chat/agent-session-wire/structured-session-compaction, src/main/codex/codex-context-usage.ts a compaction journal testy. Pracovní strom navíc obsahuje rozpracované, dosud netrackované src/main/codex/codex-continuation-*, src/main/runtime/conversation-continuation-{runtime,scheduler} a src/shared/conversation-continuation.ts. Znovu ověřit jejich finální stav a rozšířit existující služby namísto paralelního scheduleru/store/transportu; nyní do této cizí práce nezasahovat. Příprava kompaktovaného kandidáta na forku není automaticky totéž jako compaction aktuálního vlákna či fresh context.

Oficiální Codex App Server dokumentuje thread/compact/start, thread/start a experimentální dynamicTools/item/tool/call. Při implementaci ověřit kontrakt instalovaných verzí, capability negotiation a skutečné napojení nástroje na vlastnící runtime. Samostatný MCP server automaticky nezíská kontrolu nad aktivním vláknem. Preferovat existující Orca agentní nástroje; MCP/plugin může být tenká distribuce nástroje a instrukcí, ne druhý orchestrátor. Nepoužívat simulované psaní /compact do terminálu ani ruční editaci interních rolloutů.

Zohlednit macOS/Linux/Windows, folder workspace bez Gitu, SSH/paired execution host a nezávislé verze klienta/hosta. Odpojený host znamená unverifiable, ne exited, a nesmí vyvolat lokální náhradní provedení. První podporovaný provider může být Codex; ostatní explicitně unsupported, bez předstírání stejného API. Uživateli stačí srozumitelný stav a možnost zrušení; respektovat docs/STYLEGUIDE.md.

Související TASK-4/5/6/7 řeší větvení, předání kontextu a vazby vláken; TASK-11 automatické návrhy rozdělení. Tento task navíc řeší agentem iniciovanou správu kontextu a automatické pokračování. Nejde o spuštění implementace těchto úkolů.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Agent má skutečně dostupné nástroje compaction a fresh context i stručné instrukce kdy je použít; ověřeno v nové i obnovené podporované relaci. Nepodporované runtime/provider verze vracejí explicitní stav.
- [ ] #2 Checkpoint obsahuje cíl, autorizovaný rozsah, rozhodnutí/omezení, ověření a další krok; reference je svázaná s vlastnícím workspace/hostem a konkrétní revizí, bez úniku do cizí relace nebo automatických změn projektových AGENTS.md.
- [ ] #3 Tool call pouze zařadí požadavek a vrátí ID; provedení čeká na bezpečnou hranici bez deadlocku. Souběžné zprávy, změna checkpointu a probíhající nástroje/subagenti nezpůsobí ztrátu práce ani zastaralé předání.
- [ ] #4 Compaction čeká na skutečné dokončení provider operace; fresh context má nové vlákno bez kopie plné historie, zachovaný zdrojový transcript a dohledatelný přesný předaný obsah. Oba režimy jsou v UI a datech rozlišitelné.
- [ ] #5 Po úspěchu Orca pokračuje dalším autorizovaným krokem právě jednou, zachová model/reasoning/workspace/oprávnění a obnoví potřebné nástroje; stop/pause/zrušení zabrání automatickému pokračování.
- [ ] #6 Požadavky mají trvalý stav a idempotentní obnovu po pádu/timeoutu; nejednoznačný výsledek se ověří před retry, nevytváří duplicitní vlákna a při chybě zůstává zdrojová konverzace použitelná.
- [ ] #7 Předem zapnutá autonomie dovoluje agentovi rozhodovat bez potvrzení každého požadavku; uživatel vidí důvod, režim a výsledek a může čekající požadavek zrušit. Jsou omezeny opakované resety a měřeny compaction/usage metriky bez slibu úspory.
- [ ] #8 Podporovány folder workspaces a správné vlastnictví SSH/paired hostů, negotiated capabilities a mixed versions; odpojení je unverifiable bez fallbacku na jiný host.
- [ ] #9 Cílené testy pokrývají oba režimy, deadlock/race s novým vstupem, stale checkpoint, duplicity, restart, cancellation, chybu provideru, izolaci hostů a automatické pokračování; real-binary integrace ověří podporovaný Codex kontrakt. UI testy respektují background launch politiku Orcy.
- [ ] #10 Implementace znovupoužívá existující continuation/compaction infrastrukturu po ověření jejího aktuálního stavu; dokumentace uvádí podporované providery/verze a že funkce je dostupná až po dodání runtime integrace.

<!-- AC:END -->
