---
id: TASK-52
title: "Revize změn generovaných AI s ověřenými tvrzeními"
status: To Do
assignee: []
created_date: "2026-11-02"
labels:
  - desktop
  - source-control
  - agents
dependencies: []
type: feature
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Nástroj pro revizi velkých diffů `base..head`, které vytvořil AI agent. Orca rozdělí diff na hunky, strojově ověří mechanické změny (přejmenování, přesuny, generované soubory) a sbalí je. Pozornost soustředí na sémantické a rizikové hunky a hunky bez vysvětlení. Tvrzení AI (popis PR, commity, shrnutí agenta) zobrazuje jako tvrzení a křížově je kontroluje proti deterministickým analyzátorům. Stav revize je po hunkách a přežije další push, pokud se hunk nezměnil.

Vychází z handoffu „Revize kódu generovaného AI v Orca ADE“ (2026-11-02, pilot myCANADIAN `feature/932-navigation` proti `feature/redesign`, 720 souborů, +29 301 / −21 164, 178 commitů). Tento úkol je varianta C: funkce přímo v Orca, v TypeScriptu, nad stávajícím compare-to-base a combined diff viewerem. Python prototyp (`build_diff.py`, `diff_template.html`) se nepřebírá. Slouží jen jako reference parseru a příklad pravidel témat.

### Principy

1. **Tvrzení ≠ důkaz.** Každá anotace má důvěru `verified` (potvrdil analyzátor), `claimed` (tvrdí jen AI) nebo `contradicted` (analyzátor tvrzení vyvrátil).
2. **Bez integrace do revidovaného repa.**
   - Funguje bez konfigurace, hooků, buildu a coverage v projektu.
   - Volitelné rozšíření (vlastní témata, doménová rizika, příkazy projekcí) je v nastavení repa v Orca, ne v repu.
   - Číst se smí jen to, co repo už má, např. `.gitattributes` (`linguist-generated`).
3. **Deterministické jádro.** Stejný vstup a stejná verze analyzátorů dají bajtově stejný manifest.
4. **AI jen přiřazuje.** Intent agent pracuje přes nástroje, které odmítnou neexistující `hunkId`. Nejistý hunk zůstane nevysvětlený.
5. **Bez AI atribuce v gitu.** Nic se nezapisuje do commitů, trailerů ani `git notes`.
6. **SSH a vzdálené runtime.** Git běží na execution hostu přes `RuntimeGitTarget` a `GitProvider.exec`, nikdy lokálně za vzdálený worktree.
7. **Folder workspaces.** Bez gitu se funkce nenabízí.

### Doplněná rozhodnutí k nejasným bodům handoffu

| Bod                                       | Rozhodnutí                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Báze diffu                                | `merge-base(baseRef, HEAD)..HEAD` jako stávající compare-to-base. `baseRef` = báze worktree (`WorktreeMeta`), uživatel ji může změnit.                                                                                                                                                                                  |
| Hunk                                      | Blok z `git diff -U0`. Kontext nevstupuje do hashe, takže změna sousedního řádku hunk nezneplatní. Sousední bloky se seskupí jen vizuálně v UI.                                                                                                                                                                         |
| Hash                                      | `contentHash = sha256(removed + "\0" + added)`, řádky po normalizaci: CRLF→LF, oříznuté koncové mezery. Čísla řádků nevstupují.                                                                                                                                                                                         |
| `hunkKey` / `hunkId`                      | `hunkKey = newPath + "\0" + contentHash + "\0" + occurrence`, kde `occurrence` je pořadí stejného hashe v souboru. `hunkId = "h_" + sha256(hunkKey)[0..12]`. Odpovídá „file + hash“ z handoffu a řeší kolize stejných změn v jednom souboru.                                                                            |
| `--find-copies-harder`                    | Nepoužívat (drahé na velkém repu). Stačí `-M -C` jako `gitChangeListArgs`. Přesuny řeší vlastní detekce.                                                                                                                                                                                                                |
| `--color-moved`, `range-diff`, difftastic | Nepoužívat. Detekce přesunů je vlastní a deterministická. Přenos stavu revize řeší `hunkKey`, ne `range-diff`. Bez externích nástrojů.                                                                                                                                                                                  |
| Fragment → Destination                    | Kromě podobnosti obsahu ještě párování podle jména (viz Fáze 1). Spárovaný hunk má `moveSource` i při nízké podobnosti, `kind` se řídí podobností.                                                                                                                                                                      |
| `mechanical`                              | Ve fázi 1 není. Ve fázi 3 jen pro vzory ověřitelné strojově (jen importy, přejmenování jednoho symbolu v celém souboru, jen whitespace). Agent může vzor navrhnout, ale `verified` je až po kontrole.                                                                                                                   |
| `riskScore`                               | Součet vah unikátních flagů hunku, strop 10. Priorita fronty: `contradicted` → `unexplained` → `riskScore` sestupně → cesta.                                                                                                                                                                                            |
| `test-weakened`                           | V rámci celého rozsahu, ne commitu (squash a rozdělené commity by pravidlo obešly).                                                                                                                                                                                                                                     |
| Témata (`groups`)                         | Automaticky podle kořene modulu: nejbližší předek se souborem `build.gradle(.kts)`, `package.json`, `Cargo.toml`, `go.mod`, `pom.xml` nebo `pyproject.toml`, pak podle source setu `main`/`test`. Ruční regex pravidla jsou volitelná v nastavení repa v Orca. Lidské názvy témat může navrhnout intent agent (fáze 3). |
| Konfigurace                               | Ne v `orca.yaml` (pevná sada klíčů, neznámý klíč se hlásí jako chyba). Ne v `.orca/review.yml`. Uložená v nastavení repa v Orca. Import/export YAML až když bude potřeba.                                                                                                                                               |
| Úložiště manifestu                        | Keš v `userData/change-review/manifests/` podle `repo + mergeBase + head + schemaVersion + hash nastavení`, LRU strop. Manifest jde kdykoli přepočítat. Text hunků se do manifestu neukládá, renderer ho čte stávajícím `git:branchDiff`.                                                                               |
| Úložiště stavu revize                     | Samostatný store v main procesu runtime, který vlastní worktree (lokálně a SSH lokální main, u vzdáleného runtime jeho server), klíčovaný `repoId + headRef`. Stav tak přežije smazání a znovuvytvoření worktree. Nepatří do `WorktreeMeta`: tisíce položek by ji zbytečně zvětšily.                                    |
| Komentáře                                 | Stávající `DiffComment` doplnit o volitelné `hunkKey`, aby kotva přežila push. Odeslání agentovi přes stávající `NotesSendMenu` a `sendMessageToAgent`.                                                                                                                                                                 |
| „Poslat agentovi“ – komu                  | Výchozí cíl je sezení, které hunk vytvořilo (podle původu), pokud běží. Jinak nový agent ve stejném worktree. Uživatel volí ve stávajícím menu.                                                                                                                                                                         |
| Intent agent – model a rozpočet           | Výchozí agent uživatele (`resolveDefaultAgentForNewTab`), žádný nový poskytovatel. Agent si text hunků stahuje nástrojem po stránkách. Dostává jen `semantic` a `move-edit`, ostatní jako souhrnná čísla.                                                                                                               |
| Původ                                     | Zpětné párování z dat, která Orca už má (ai-vault, deník strukturovaných sezení). Žádné hooky při commitu. Výsledek je vždy jen odhad, s vyznačenou spolehlivostí.                                                                                                                                                      |
| Coverage                                  | Jen pokud repo už generuje report (lcov, JaCoCo XML, Kover XML) a uživatel v nastavení zadá cestu. Jinak `unknown`.                                                                                                                                                                                                     |
| Projekce s buildem                        | Jen jako uživatelské příkazy v nastavení repa v Orca. Spouští se na vyžádání v odděleném detached worktree pro bázi, výsledky se kešují podle commitu.                                                                                                                                                                  |
| Názvy                                     | Interně `change-review` (neplete se s hostovaným review GitHub/ADO), v UI „Change review“. UI texty anglicky s překlady do všech locale (`en`, `es`, `fr`, `ja`, `ko`, `zh`).                                                                                                                                           |

### Datový model (`src/shared/change-review-types.ts`)

```ts
type ChangeReviewManifest = {
  schemaVersion: 1;
  range: {
    baseRef: string;
    mergeBase: string;
    head: string;
    headRef: string | null;
    commits: number;
  };
  analyzers: string[]; // ['hunks@1', 'moves@1', 'generated@1', 'risk@1', …]
  settingsHash: string;
  groups: { id: string; title: string; root: string }[];
  files: {
    path: string;
    oldPath: string | null;
    status: "A" | "M" | "D" | "R" | "C";
    similarity: number | null;
    groupId: string;
    generated: boolean;
    adds: number;
    dels: number;
    binary: boolean;
    hunkIds: string[];
  }[];
  hunks: {
    id: string;
    key: string;
    file: string;
    oldRange: [number, number];
    newRange: [number, number];
    kind:
      | "rename-only"
      | "move"
      | "move-edit"
      | "mechanical"
      | "semantic"
      | "generated";
    kindTrust: "verified" | "claimed";
    moveSource: {
      file: string;
      range: [number, number];
      similarity: number;
      pairedBy: "content" | "name";
    } | null;
    riskFlags: string[];
    riskScore: number;
    commits: string[]; // filled in phase 3 (provenance)
  }[];
  stats: { linesByKind: Record<string, number>; truncated: boolean };
};
```

Záměry, verifier, původ a projekce jsou samostatné záznamy navázané na `hunkKey`, ne součást jádra manifestu. Jádro tak zůstane deterministické a nezávislé na AI.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Fáze 1: Manifest pilotu se vygeneruje bez chyby a opakovaný běh dá bajtově stejný výstup (stejná `hunkId`).
- [ ] #2 Fáze 1: Přehled ukazuje řádky podle `kind`; ruční vzorek 20 hunků `move` jsou skutečné přesuny.
- [ ] #3 Fáze 1: Aspoň 5 známých převodů Fragment → Destination má `moveSource` ve smazaném Fragmentu a jde otevřít diff proti zdroji.
- [ ] #4 Fáze 1: Funguje pro lokální, WSL i SSH worktree; folder workspace funkci nenabízí; starší vzdálený runtime bez metody ukáže „nepodporováno“, ne chybu.
- [ ] #5 Fáze 2: Po commitu, který mění 1 soubor, zůstanou ostatní hunky zrevidované; změněné hunky jsou `todo` se značkou „změněno od revize“.
- [ ] #6 Fáze 2: Po rebase na novou bázi se stav přenese u hunků se stejným `hunkKey`.
- [ ] #7 Fáze 3: Nástroj agenta odmítne neexistující `hunkId`; nepřiřazený `semantic`/`move-edit` hunk je v `unexplained`.
- [ ] #8 Fáze 3: Uměle vložený nesouvisející hunk skončí v `unexplained`; uměle oslabený test skončí jako `test-weakened` a záměr „beze změny chování“ jako `contradicted`.
- [ ] #9 Fáze 3: U hunku s nalezeným původem „Why?“ otevře sezení (strukturované na konkrétní položce, terminálové jako výřez přepisu) se spolehlivostí párování.
- [ ] #10 Fáze 4: Projekce a coverage běží asynchronně, kešují se podle commitu a bez nástroje ukážou `unknown`.

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

### Potvrzená rozhodnutí (2026-11-02)

- Vstup do funkce: tlačítko „Change review“ v toolbaru compare-to-base v Source Control.
- Mobil: mimo rozsah tohoto úkolu, RPC se jen navrhne tak, aby šlo mobil později připojit.
- Interní název `change-review` (moduly, RPC `changeReview.*`, CLI `orca change-review`).

### Fáze 1: deterministické jádro a zobrazení

**Main (`src/main/change-review/`)**

- `change-review-hunk-collector.ts`
  - `git diff -U0 --no-color --no-ext-diff -M -C <mergeBase> <head> --` přes `GitProvider.exec` cíle z `RuntimeGitTarget`.
  - Parser souborů a hunků, včetně binárních, přejmenování, kopií a cest s `core.quotepath=false`.
  - Spouštět s background `admissionTier` a `AbortSignal`.
  - Reuse: `resolveMergeBase` / `resolveCompareRef` z `src/main/git/source-control/compare-ref-oids.ts`.
- `change-review-hunk-identity.ts`: normalizace, `contentHash`, `hunkKey`, `hunkId`.
- `change-review-generated-paths.ts`
  - Výchozí globy: lockfiles, `**/build/**`, `**/dist/**`, `*.min.*`, `*.generated.*`, `**/__snapshots__/**`.
  - Navíc `git check-attr -z --stdin linguist-generated` na head.
  - Uživatelské globy z nastavení repa.
  - Heuristiku `isGeneratedOrLockFile` z mobilu přesunout do `src/shared` a sdílet.
- `change-review-move-detection.ts`
  - Index normalizovaných odebraných řádků (trim, sloučené mezery, bez prázdných řádků a řádků `import`/`package`/`using`) přes všechny `-` hunky a smazané soubory.
  - Pro každý přidaný blok najít nejdelší běhy po sobě jdoucích shodných řádků. Ignorovat řádky s méně než 2 alfanumerickými tokeny.
  - Podobnost spočítat přes `diffArrays` z balíčku `diff` (už v závislostech).
  - `move` ≥ 0,98, `move-edit` 0,60–0,98. Prahy jsou konstanty, kalibrované na pilotu.
  - Párování podle jména pro dvojice smazaný a přidaný soubor ve stejném modulu: shodný kmen jména po odebrání posledního CamelCase slova (`Foo` + `Fragment` → `Foo` + `Destination`).
  - Spárovaný soubor dostane `moveSource` s `pairedBy: 'name'` vždy. `kind` určuje podobnost.
  - `rename-only`: status R se 100% podobností a bez hunků.
- `change-review-risk-rules.ts`
  - Výchozí pravidla podle jazyka podle přípony souboru (Kotlin/Java, TS/JS, Swift, Python, Go). Flagy a váhy podle handoffu.
  - `deleted-without-replacement` = smazaný soubor nebo blok, který není zdrojem žádného `move`/`move-edit`.
  - `test-weakened` v testovém souboru (`/test/`, `/androidTest/`, `*.test.*`, `*_test.*`, `*Test.kt`), když nastane cokoli z:
    - ubyly řádky s asercemi (`assert*`, `expect(`, `verify(`, `XCTAssert`, `should`),
    - přibylo `@Ignore`/`@Disabled`/`.skip(`/`xit(`,
    - odebraný a přidaný řádek aserce se liší jen literálem.
  - Doménová pravidla (cesta + regex + váha) z nastavení repa.
- `change-review-groups.ts`: kořeny modulů jedním `git ls-tree -r --name-only <head>` filtrovaným na manifest soubory (ohraničený výstup), volitelná pravidla z nastavení.
- `change-review-manifest-builder.ts`
  - Stabilní řazení podle cesty a `newRange`.
  - Keš (`change-review-manifest-cache.ts`).
  - Limit velikosti: nad strop se hunky dál neklasifikují a `stats.truncated = true`.
- RPC `changeReview.getManifest({ worktree, baseRef })` v `src/main/runtime/rpc/methods/change-review.ts`. IPC most v preload stejně jako git diff. Volitelné pole: starší vzdálený server metodu nezná, renderer to zobrazí jako nepodporované.
- CLI `orca change-review manifest --worktree <sel> [--base <ref>] --json` pro pilot, testy determinismu a agenty.

**Renderer**

- Vstup: tlačítko „Change review“ v toolbaru compare-to-base (`source-control/panel/header-toolbar.tsx`), otevře combined diff v režimu revize. Bez git repa skryté.
- `CombinedDiffViewer` v režimu revize:
  - Přehled nad diffem:
    - soubory, ±řádky, commity,
    - pruh řádků podle `kind` („kolik musím číst“ = `semantic` + `move-edit`),
    - počty flagů.
  - Seznam souborů s řazením „Priority“ a filtry skupina, kind, flag, stav. Využít stávající file tree filtr.
  - U hunku (dekorace a view zone v `DiffSectionBody`, stejný mechanismus jako inline komentáře ADO): `kind` s odznakem důvěry, flagy, odkaz na zdroj přesunu.
  - Soubory celé `rename-only`/`move`/`generated` sbalené s odznakem „Verified move“ / „Generated“.
  - Přesunuté bloky uvnitř jinak sémantického souboru Monaco sbalit neumí. Dostanou odznak a akci „Compare with source“.
  - „Compare with source“ otevře `DiffViewer` s original = zdrojový blok (z `git show <mergeBase>:<path>`).
- Tokeny a primitiva podle `docs/STYLEGUIDE.md`, texty do všech locale.

**Testy**

- Unit testy parseru (A/M/D/R/C, binární soubory, cesty s mezerami a Unicode).
- Unit testy identity: posun v souboru nemění hash, dva stejné hunky mají různé `occurrence`.
- Unit testy detekce přesunů a rizikových pravidel.
- Real-git test na fixture repu.
- Test determinismu (dva běhy, porovnání JSON).
- Ruční ověření na pilotu: AC #1–#3.

### Fáze 2: stav revize a „změněno od revize“

- `change-review-state-store.ts`:
  - `repoId + headRef → { hunks: Map<hunkKey, { status: 'reviewed' | 'flagged' | 'todo', at, comment? }>, lastReviewedHead }`
  - Zápis s debounce, atomický zápis souboru (`durable-file-write.ts`).
- RPC `changeReview.getState` / `changeReview.setHunkState` (dávkově). Stav souboru se dopočítá z hunků.
- Nový manifest:
  - hunk se známým `hunkKey` převezme stav,
  - ostatní hunky jsou `todo` s `changedSinceReview`, pokud stav existoval pro stejný soubor.
- Přejmenování souboru mezi dvěma heady: přemapovat `hunkKey` přes `git diff -M --name-status oldHead newHead` (jen přejmenování).
- UI: checkbox „Reviewed“ u hunku i souboru, „Next unreviewed“ s klávesovou zkratkou (⌘ na Macu, Ctrl jinde), filtr „Changed since review“, průběh vážený `riskScore` (hunk bez flagů má váhu 1).
- `DiffComment.hunkKey` (volitelné): komentář se při změně hunku označí jako zastaralý, stejně jako `diffIdentity` na mobilu.
- Mobil: zatím mimo rozsah. RPC je ale navržené tak, aby ho mobil mohl použít za capability flagem.

### Fáze 3: záměry, verifier, původ

- **Zdroje tvrzení** (`change-review-claim-sources.ts`):
  - commit messages `git log --format=%H%x00%s%x00%b <mergeBase>..<head>` (ohraničeno počtem),
  - popis navázaného PR/MR, pokud worktree nějaký má (GitHub, GitLab, ADO, přes stávající vazby worktree),
  - shrnutí sezení agentů: poslední odpověď asistenta a prompty uživatele ze sezení s `cwd` ve worktree a v časovém okně rozsahu.
- **Nástroje agenta:**
  - Definice v `src/shared/change-review-tools.ts`, MCP server `orca change-review mcp` (vzor `src/cli/azure-devops-review-mcp.ts`), registrace přes `orcaMcpServerLaunchArgs`.
  - Pi extension a CLI ekvivalenty pro ostatní agenty, stejně jako ADO review.
  - Nástroje:
    - `change_review_get_summary`
    - `change_review_list_hunks(filter, cursor)`
    - `change_review_get_hunk(id)` (text hunku a případně zdroje přesunu)
    - `change_review_get_claim_sources`
    - `change_review_submit_intents`: validace neexistujících id, chybějícího `source` a prázdného `claimKind`. Chyby vrací agentovi k opravě.
- **Záměr:**
  - `{ id, title, claim, claimKind: 'behavior-change' | 'no-behavior-change' | 'move-only' | 'refactor' | 'test-only', source, hunkKeys, testRefs }`.
  - `claimKind` je strukturované pole, aby verifier nemusel parsovat text.
  - Na nový head se záměry přenesou přes `hunkKey`. Chybějící odkazy se zahodí a záměr dostane `needsRefresh`.
- **Spuštění:**
  - Tlačítko „Explain changes with AI“ v přehledu. `launchAgentInNewTab` ve stejném worktree s promptem podle vzoru `buildAzureDevOpsReviewAgentPrompt`.
  - Agent jen čte a needituje. Prompt zakazuje přiřazovat hunky „pro jistotu“.
  - Velké diffy po skupinách: agent dostane seznam skupin a prochází je postupně.
- **Verifier** (`change-review-intent-verifier.ts`, bez AI):
  - `move-only`: všechny hunky `move`/`rename-only`/`generated`, jinak `contradicted`.
  - `no-behavior-change`: `contradicted`, pokud některý hunk má `test-weakened` nebo je `semantic` mimo testy a komentáře.
  - `has-tests`: `verified` jen s coverage, bez ní kontrola `unknown` a záměr zůstává `claimed`.
  - `unexplained` = `semantic`/`move-edit` hunky bez záměru.
  - `unbacked` = záměr bez hunků, nebo `behavior-change` bez testového hunku či `testRefs`.
- **Původ** (`change-review-provenance-matcher.ts`):
  - Commit → sezení podle času commitu a `cwd` sezení ve worktree téhož repa (ai-vault, `AiVaultSession.createdAt`/`updatedAt` s tolerancí).
  - Hunk → položka:
    - strukturovaná sezení: shoda přidaných řádků s položkami `diff` v deníku (`agent-session-journal`) → `matched-by-patch`,
    - terminálová sezení: nejbližší `Edit`/`Write` na stejnou cestu před commitem → `matched-by-time`.
  - Kde ai-vault sezení nezná (např. nepokrytý vzdálený host), původ je `unknown`.
- **„Why?“:**
  - nové RPC `agentSession.revealItem({ sessionId, itemId })` napojené na `use-native-chat-rail-history-jump.ts`,
  - pro terminálová sezení dialog s výřezem přepisu (`session-transcript-reader.ts`).
- **UI:**
  - Tab „Intents“ se seznamem tvrzení a odznaky důvěry. Kliknutí filtruje diff na hunky záměru.
  - Fronta řazená `contradicted` → `unexplained` → riziko.

### Fáze 4: projekce a coverage (volitelné adaptéry)

- Rozhraní `ChangeReviewProjection { id; collect(target, commit) → data; diff(before, after) → changes }`, výsledky kešované podle commitu.
- Bez buildu, bez integrace:
  - diff závislostí z manifestů (`package.json`, `gradle/libs.versions.toml`, `build.gradle(.kts)`, `Cargo.toml`),
  - nové a odebrané veřejné symboly textovou heuristikou.
- S buildem: uživatelské příkazy v nastavení repa (např. `./gradlew :app:dependencies`, výpis tříd z release dexu, Paparazzi).
  - Spouští se na vyžádání v detached worktree pro bázi. Zobecnit `azure-devops-review-worktree.ts` na obecný review worktree.
  - Orca diffuje textový nebo JSON výstup.
  - Spouštění procesů přes `@orca/process-host`.
- Coverage: parser lcov / JaCoCo XML / Kover XML z cesty v nastavení, diff coverage po hunkách, gutter v diffu.

### Fáze 5 (volitelně)

- Protistranný agent se stejnými nástroji, bez zdrojů tvrzení autora. Zjištění bez `hunkId` a řádku se zahodí. Výstup jako `DiffComment` s autorem agent, k ručnímu potvrzení.
- Mutační testy mimo rozsah, dokud nebude coverage adaptér.

### Rizika

- **Výkon detekce přesunů na ~50k řádcích:** index řádků je lineární, párování omezit na kandidáty s ≥ 3 shodnými řádky. Měřit na pilotu, cíl < 5 s lokálně.
- **Fragment → Composable má nízkou textovou podobnost.** Párování podle jména to řeší jen pro konvenční názvy. Jiné páry zůstanou `semantic` bez zdroje, a to je přijatelné.
- **Heuristiky rizik podle regexu dávají falešné poplachy.** Flagy jsou jen řazení a nic neblokují.
- **Párování původu podle času je nepřesné**, když v jednom worktree běží víc agentů. UI to musí ukázat jako „likely“.

<!-- SECTION:NOTES:END -->
