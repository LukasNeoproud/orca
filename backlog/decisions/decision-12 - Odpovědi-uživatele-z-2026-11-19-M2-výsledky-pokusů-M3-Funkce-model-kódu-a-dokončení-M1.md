---
id: decision-12
title: >-
  Odpovědi uživatele z 2026-11-19: M2, výsledky pokusů M3, Funkce, model kódu a
  dokončení M1
date: '2026-11-19T11:41:00Z'
status: accepted
---
## Context

Po decision-5 zůstaly otevřené otázky k rozpisu M2 (poznámky TASK-69), k výsledkům pokusů pro M3 (poznámky TASK-70) a otázky z pokusů a tiketů z 2026-11-19. Uživatel na ně odpověděl 2026-11-19. Otevřené zůstávají: krok Commitnout, odpovědět a vyřešit (TASK-101, uživatel chce víc kontextu), odkud smí odejít hlas (TASK-83, totéž), druhý build server pro Swift (TASK-55), zrušení hlasu (TASK-83) a pořadí milníků po M2.

## Decision

Dokončení M1:

- Git 2.25 pro TASK-109 se sestaví ze zdrojového archivu do `~/.cache/orca-review-ide`.
- Open in v Android Studiu a Xcode (TASK-80) ověří agent; uživatel mu udělí oprávnění Automatizace a Zpřístupnění. Rider a Zed zůstávají neověřené.
- Starší nálezy `pnpm lint` ve forku (TASK-112) se opraví, ale až po akceptaci M1.
- Akceptace M1 počká, až budou hotové TASK-80, TASK-109 a TASK-112. Rozpor s předchozím bodem je otázka na uživatele.
- Strojové překlady textů forku z TASK-81 se do forku nevkládají.
- Prázdný odebraný řádek u přidaného souboru se skrývá jen v diffu Azure DevOps (TASK-78).
- Popisky `stdout` a `stderr` zůstávají ve všech jazycích doslovně (TASK-128).

Milník M2:

- Příprava celků AI se u nového pull requestu jen nabídne jedním kliknutím; automatika se nestaví (TASK-108).
- Smyčka bran po kroku agenta je vypnutá, zapíná se na repozitář, nejvýš tři kola (TASK-87).
- Stav bran se do Azure DevOps nezapisuje (TASK-104).
- Zadání se bere z Jiry: klíč tiketu se odvodí ze jména větve pull requestu. Pracovní položky Azure DevOps tým nepoužívá (TASK-59, TASK-105).
- Text zadání odchází agentovi při AI review ve výchozím stavu (TASK-105).
- Publikovaný komentář nese na začátku závažnost nálezu; důkaz zůstává jen v Orce (TASK-84, nový tiket).
- TASK-52 se archivuje, až TASK-91 zapíše záznam rozhodnutí.
- M2 se akceptuje jednou na konci.
- Rozdíl snapshotů po celcích zůstává na plánování M5 (TASK-64).
- Stránka pull requestu má dál čtyři záložky; dokumentace se opraví (nový tiket).
- Brány kvality vzdáleného repozitáře se nastavují jen v Orce na tom stroji (TASK-85).
- Komentář u přepsaného řádku zůstává u nového znění se štítkem Outdated (TASK-76).
- Oznámení na telefon přes push bránu upstreamu se neprověřuje. Koordinátor navrhne cestu bez push serveru upstreamu (nový pokus).

Editor M3:

- Kotlin: experimentální režim language serveru za přepínačem (decision-1, varianta B). Chyby language serveru JetBrains se nehlásí.
- Vlastní tenký most mezi editorem a language servery (decision-2) je přijatý.
- Swift: build pro language server spouští jen uživatel nebo agent na pokyn; Orca stahuje připnutou verzi xcode-build-server s kontrolním součtem (decision-3).
- C#: Roslyn language server stažený z nuget.org na počítači uživatele; předběžné verze a identifikátor zařízení nevadí; měření nad aktuálním backendem až při ověřování M3 (decision-4).
- C#: M3 má umět i projekty pro .NET Framework jako volbu uživatele. Kdo chce jen zvýraznění syntaxe, nic neinstaluje; kdo chce hlubší integraci, doinstaluje SDK a Mono. Orca je zatím hlavně pro jednoho uživatele, ne pro tým.

Funkce a model kódu (M4, M7):

- Agenti ve Funkci dostávají seznam cest, přepnutí reference se neblokuje a agent dostane oznámení, CLAUDE.md jiných platforem se nenačítá (decision-7).
- Funkce se zakládají jen ručně (decision-8).
- Extraktory modelu kódu: vlastní kód přibalit, knihovny stáhnout při prvním použití; struktura projektu se čte ze souborů sestavení. Gradle a MSBuild mají jít volitelně spustit pro okrajové případy a hlubší integraci (decision-9).
- Před rozepsáním M4 proběhne krátký pokus s tree-sitter místo tří extraktorů (nový pokus).

Lokalizace M6:

- Token k testovacímu projektu POEditoru nebude; M6 se plánuje podle dokumentace (TASK-113 odpadá).
- Tým má placený tarif POEditoru Plus (decision-6).

## Consequences

- TASK-109 přestává čekat na uživatele. TASK-80 čeká, než uživatel udělí oprávnění. TASK-112 a akceptace M1 čekají na vyjasnění pořadí.
- TASK-59 se uzavře s kritériem 2 jako neměřitelným. TASK-113 se ruší.
- TASK-105 se přepíše na Jiru a přestává čekat na uživatele; Orca už má integraci s Jirou (`src/preload/api/jira-api.ts`). Kritéria TASK-106 platí nad zadáním z Jiry.
- TASK-108 přestává čekat na uživatele; kritéria se zúží na nabídku jedním kliknutím.
- decision-1 se mění na variantu B; decision-2, 3, 4, 7, 8 jsou přijaté a decision-9 je přijatý s doplňkem o volitelném Gradlu a MSBuildu. decision-6 platí pro tarif Plus a jeho limity podle dokumentace.
- Nové tikety: závažnost na začátku publikovaného komentáře, oprava dokumentace záložek stránky pull requestu, pokus s oznámením na telefon bez push serveru upstreamu, pokus s tree-sitter před M4.
- Rozpis M3 a M4 a plánování ostatních milníků dál čeká na pořadí milníků po M2.

## Doplnění 2026-11-19 odpoledne

- Krok u vlákna na vlastním pull requestu (TASK-101): opravu kódu smí agent připravit, commitnout a odeslat automaticky. Odpověď revieweru je vždy draft, který uživatel upraví a schválí ručně; bez jeho potvrzení neodejde a vlákno se nevyřeší.
- Hlas u pull requestu (TASK-83) smí odejít z okna Orky i ze spárovaného zařízení, vždy jen po ručním potvrzení uživatelem; agent hlasovat nesmí. To odpovídá současnému stavu.
- Oprava starších nálezů lintu forku (TASK-112) proběhne před akceptací M1; akceptace M1 čeká na TASK-80, TASK-112 a TASK-133.
