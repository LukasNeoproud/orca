---
id: decision-6
title: >-
  POEditor v M6: synchronizace přes JSON metody API, jeden požadavek za druhým
  pod limity tarifu Free
date: '2026-11-18T22:47:00Z'
status: accepted
---
## Context

Milník M6 má tabulku lokalizace a synchronizaci s POEditorem ([05-funkce.md](../../docs/review-ide/05-funkce.md), oddíly 13 a 14): čekající změny se odesílají a stav serveru se stahuje jen na pokyn uživatele, Orca ukazuje, že je lokální kopie starší než server, a odeslání mění jen server. TASK-58 měl zjistit, jak rychle a v jakých dávkách to API POEditoru dovolí.

- **Rozsah:** proběhla jen část A, čtení veřejné dokumentace. Token testovacího projektu k dispozici nebyl, takže část B (měření proti živému API) neproběhla a na API POEditoru neodešel žádný požadavek. Všechno níže je **neověřené proti živému API**, pokud není řečeno jinak.
- **Datum čtení:** všechny stránky přečtené 2026-11-18. Žádná z nich neuvádí datum vydání ani poslední změny; patička má jen „©2012-2026“.
- **Formulace „nezjištěno“** znamená, že to dokumentace neříká nebo si odporuje. Nic z toho není odhad.

Zdroje (všechny čtené 2026-11-18):

- [api]: <https://poeditor.com/docs/api>, reference API v2
- [rates]: <https://poeditor.com/docs/api_rates>, Throttling, Queuing and Rate Limiting
- [codes]: <https://poeditor.com/docs/error_codes>, API Response Codes
- [pricing]: <https://poeditor.com/pricing/>
- [faq]: <https://poeditor.com/help/faq>
- [android]: <https://poeditor.com/localization/files/android>
- [xcstrings]: <https://poeditor.com/localization/files/xcstrings>
- [xcstrings-kb]: <https://poeditor.com/kb/xcstrings-file-translation>
- [resx]: <https://poeditor.com/localization/files/resx>
- [poll-kb]: <https://poeditor.com/kb/how-to-export-new-translations-automatically>
- [callbacks]: <https://poeditor.com/kb/how-to-use-poeditor-callbacks>
- [v2-blog]: <https://poeditor.com/blog/poeditor-localization-api-improvements/>, jediný nalezený popis změn API v2

Datovaný changelog API POEditor nezveřejňuje; nalezli jsme jen článek ke spuštění v2 ([v2-blog]), který popisuje nové metody, ne pozdější změny.

## Findings

### Jak API funguje

- **Požadavek:** vždy `POST` na `https://api.poeditor.com/v2/<metoda>`, tělo `application/x-www-form-urlencoded`, u `projects/upload` povinně `multipart/form-data`. Pole `api_token` je v každém požadavku. Dávková data jdou jako řetězec JSON v jednom poli formuláře `data`. ([api])
- **Token:** jeden na účet nebo organizaci (Account / Organization Settings > API Access) ([api]). Token tedy otevírá všechny projekty účtu, ne jen jeden. Některé metody uvádějí „readonly accepted“, takže existuje i token jen pro čtení; dokumentace ho jinde nepopisuje (nezjištěno, jak se vytváří a co přesně smí). ([api])
- **Odpověď:** JSON s blokem `response` (`status`, `code`, `message`) a blokem `result` ([api]). Jestli chyby přicházejí s HTTP stavem 200 a kódem jen v těle, nebo se skutečným HTTP stavem, dokumentace neříká (nezjištěno).
- **Identita klíče:** položky dávek se adresují dvojicí `term` + `context`; přejmenování dělá `terms/update` s `new_term` a `new_context` ([api]). Pravidlo jednoznačnosti dvojice dokumentace výslovně neuvádí (nezjištěno).
- **Čas:** časové údaje mají tvar `2013-06-10T11:08:54+0000` (posun bez dvojtečky), nevyplněné jsou prázdný řetězec ([api]). `languages/list` je popisuje jako „UTC - ISO 8601“ ([api]).
- **Co API nemá:** stránkování u `terms/list`, filtr „změněno od“, číslo revize ani ETag ([api]). Optimistické zamykání při zápisu tedy neexistuje.

### Limity požadavků

| Limit | Free | Paid | Enterprise | Zdroj |
| --- | --- | --- | --- | --- |
| Požadavky za minutu | 100 | 200 | 300 | [rates] |
| Požadavky za hodinu | 2 000 | 6 000 | 10 000 | [rates] |
| Souběžné požadavky (fronta na uživatele) | 60 | 200 | 300 | [rates] |
| `projects/upload` | 1 za 20 s | 1 za 10 s | 1 za 10 s | [rates] |
| Webhooky | 50 za minutu | 50 za minutu | 50 za minutu | [rates] |

- **Počítají se přijaté požadavky, ne vyřízené.** Kdo po dosažení limitu posílá dál, prodlužuje si blokaci, dokud počet za poslední minutu nebo hodinu neklesne pod limit. ([rates])
- **Překročení:** chyba 429 „Too many requests“; nad limit fronty server požadavky zahazuje ([rates]). U uploadu chyba 4048 „Too many upload requests in a short period of time“ ([codes]).
- **Hlavička `Retry-After`** ani jiné hlavičky se stavem limitu dokumentace nezmiňuje (nezjištěno).
- **Rozpory v dokumentaci:**
  - Reference u `projects/upload` píše „No more than one request every 20 seconds“ bez rozlišení tarifu ([api]), stránka limitů dává placeným tarifům 1 za 10 s ([rates]).
  - Kód 429 popisuje [codes] jako „více než 200 požadavků čeká ve frontě“, [rates] uvádí frontu 60, 200 nebo 300 podle tarifu.
- **Kterých tarifů se týká „Paid“ a „Enterprise“** stránka limitů neříká; ceník má tarify Free, Start, Plus, Premium a Enterprise ([pricing]). Přiřazení je nezjištěné.
- **Rozsah limitu uploadu** (účet, projekt, nebo token) dokumentace neuvádí (nezjištěno). Ostatní limity popisuje jako limity na uživatele ([rates]).

### Limity velikostí a obsahu

| Limit | Hodnota | Zdroj |
| --- | --- | --- |
| Položek v jedné dávce JSON | neuvedeno (nezjištěno) | [api] |
| Velikost požadavku nebo nahraného souboru | neuvedeno (nezjištěno) | [api], [faq] |
| Platnost odkazu na export | 10 minut, pak chyba 4052 | [api], [codes] |
| Souběžné nahrávání | během zpracování souboru chyba 4033 „Currently processing an uploaded file“ | [codes] |
| Počet stringů na účet | Free 1 000, Start 3 000, Plus 10 000, Premium 30 000, Enterprise 100 000; po dosažení chyba 4032 | [pricing], [codes] |

- **Co je string:** součet klíčů a překladů ve všech projektech účtu; 100 klíčů plně přeložených do jednoho jazyka a z poloviny do druhého je 250 stringů ([faq]). Přidání klíče přes API tedy může skončit chybou 4032 podle stavu celého účtu, ne jen projektu.
- **API podle tarifu:** ceník označuje API hvězdičkou u všech tarifů a hvězdičku nevysvětluje ([pricing]). Existuje chyba 4031 „No API access for the current plan“ ([codes]), stránka limitů uvádí čísla i pro Free ([rates]). Který tarif API nemá, je nezjištěné.
- **Archivace:** projekty na účtu Free neaktivní zhruba 6 měsíců se archivují ([faq]); API pak vrací 4034 „Project is archived“ ([codes]).

### Dávkové operace

Všechny metody níže berou v poli `data` pole položek, takže jeden požadavek nese libovolný počet klíčů nebo překladů jednoho jazyka ([api]). Odpověď vrací jen počty, ne výsledek po položkách.

| Úkon | Metoda | Rozsah požadavku | Odpověď | Zdroj |
| --- | --- | --- | --- | --- |
| Přidat klíče | `terms/add` (`term`, `context`, `reference`, `plural`, `comment`, `tags`) | projekt | `parsed`, `added` | [api] |
| Upravit nebo přejmenovat klíče | `terms/update` (`new_term`, `new_context`, …; volitelně `fuzzy_trigger`) | projekt | `parsed`, `updated` | [api] |
| Smazat klíče | `terms/delete` (`term`, `context`) | projekt | `parsed`, `deleted` | [api] |
| Přidat překlady, existující nepřepsat | `translations/add` | jeden jazyk | `parsed`, `added` | [api] |
| Upravit existující překlady | `translations/update` | jeden jazyk | `parsed`, `updated` | [api] |
| Vložit nebo přepsat překlady | `languages/update` (volitelně `fuzzy_trigger`, překlad s příznakem `fuzzy`) | jeden jazyk | `parsed`, `added`, `updated` | [api] |
| Smazat překlady | `translations/delete` | jeden jazyk | `parsed`, `deleted` | [api] |
| Nahrát soubor | `projects/upload` (`updating` = `terms`, `terms_translations` nebo `translations`; `overwrite`, `sync_terms`, `type`, `tags`, `fuzzy_trigger`) | jeden jazyk, u xcstrings všechny | `terms.parsed/added/deleted`, `translations.parsed/added/updated` | [api] |
| Srovnat klíče se seznamem | `projects/sync` | projekt | `parsed`, `added`, `updated`, `deleted` | [api] |

- **Množné tvary:** klíč má pole `plural`, překlad pak `content` jako objekt s tvary (`one`, `other`) ([api]).
- **`projects/sync` a `sync_terms=1` mažou** klíče, které v odeslaných datech chybí, i s překlady; reference varuje před nevratnou ztrátou ([api]).
- **Co dokumentace neříká (nezjištěno):** jestli `terms/delete` maže i překlady klíče; co udělá `translations/update` nebo `terms/update` s klíčem, který neexistuje; co udělá `terms/add` s klíčem, který už existuje; jestli se dávka zpracuje atomicky; jestli je upload zpracovaný synchronně (chyba 4033 naznačuje frontu, popsané to není).

### Stažení stavu projektu

| Co | Metoda | Počet požadavků | Zdroj |
| --- | --- | --- | --- |
| Souhrn projektu | `projects/view`: `terms` (počet), `terms_last_added`, `terms_last_updated`, `created` | 1 | [api] |
| Jazyky | `languages/list`: na jazyk `code`, `translations` (počet), `percentage`, `updated` (poslední úprava) | 1 | [api] |
| Klíče a překlady | `terms/list` s `language`: na klíč `term`, `context`, `plural`, `created`, `updated`, `reference`, `tags`, `comment` a `translation` (`content`, `fuzzy`, `proofread`, `updated`) | 1 na jazyk | [api] |
| Soubor ve formátu platformy | `projects/export` vrátí odkaz platný 10 minut, pak stažení odkazu | 2 na jazyk; u xcstrings s `export_all` 2 celkem | [api] |

Jestli se stažení odkazu z exportu počítá do limitu požadavků, dokumentace neříká (nezjištěno).

### Podle čeho poznat, že je lokální kopie starší

- **POEditor sám doporučuje dotazování:** uložit čas posledního stažení a porovnávat ho s časem poslední úpravy jazyka z `languages/list` ([poll-kb]). Interval dotazování nedoporučuje.
- **Oznámení o každé změně neexistuje.** POEditor výslovně nenabízí spouštěč při každém novém překladu ([poll-kb]). Callbacks umí jen tři události (jazyk dokončen, jazyk zkontrolován, přidány nové klíče), jsou od tarifu Premium a posílají POST na veřejnou adresu ([callbacks]). Desktopová aplikace je přijímat nemůže a změny ani mazání nepokryjí.
- **Levná kontrola:** `projects/view` a `languages/list`, dva požadavky. Novější stav ukáže změna `terms`, `terms_last_added`, `terms_last_updated`, nebo u jazyka `updated` či `translations` oproti hodnotám uloženým při posledním stažení.
- **Počet novějších změn:** jen přes `terms/list` po jazycích a porovnání `updated` u klíčů a překladů s časem posledního stažení, plus porovnání seznamů klíčů kvůli smazaným.
- **Neověřené proti živému API:** které z časových údajů se změní při smazání klíče, smazání překladu, přejmenování klíče a nahrání souboru. Dokumentace u `languages/list` mluví o „last edit“, u `projects/view` o přidání a úpravě klíčů; o mazání nic.

### Formáty pro strings.xml, xcstrings a resx

| Platforma | Identifikátor `type` | Import | Export | Zdroj |
| --- | --- | --- | --- | --- |
| Android `strings.xml` | `android_strings` | ano | ano | [api] |
| iOS `Localizable.xcstrings` | `xcstrings` | ano | ano | [api] |
| .NET `Resources.resx` | `resx` (i `resw`) | ano | ano | [api], [resx] |

- **Android:** parsuje jednoduché stringy i `plurals` ([android]). Značku `string-array` nepodporuje ([android]). `translatable="false"` respektuje a takový string v rozhraní zamkne ([android]). Při exportu obaluje stringy uvozovkami; vypne to volba `options=[{"unquoted": 1}]` ([android], [api]). Jak zachází s komentáři, escapováním, CDATA a HTML, stránka neříká (nezjištěno).
- **xcstrings:** jeden soubor nese všechny jazyky. `projects/upload` s `updating=terms_translations` a prázdným `language` naimportuje všechny jazyky souboru ([api], [xcstrings-kb]); chybějící jazyky projekt založí, pokud jejich kód POEditor zná ([xcstrings-kb]). Export všech jazyků do jednoho souboru dělá volba `export_all` ([api], [xcstrings-kb]). Množné tvary se importují ([xcstrings-kb]); varianty podle zařízení a šířky se importují jako samostatné klíče pojmenované jako ve `.stringsdict` ([xcstrings-kb]). Odsazení souboru se ukládá a při exportu zachová ([xcstrings]). Substituce, komentáře, `shouldTranslate` a stav extrakce dokumentace nepopisuje (nezjištěno).
- **resx:** kontext a množné tvary nepodporuje ([resx]). Hodnota atributu `type` u `<data>` se importuje do atributů klíče ([resx]). Export má volbu `unencoded` ([api]). Jak se importují a exportují `<comment>`, stránka neříká (nezjištěno).
- **Volba `type` u uploadu** vynutí parser místo rozpoznání podle souboru ([api]).

### Co by ověřila část B

Seznam měření pro běh s tokenem testovacího projektu (jen čtení a malé nahrání do projektu výslovně označeného jako testovací):

1. Odpověď při překročení minutového limitu: HTTP stav, tělo, hlavičky, doba blokace.
2. Odpověď 4048 u uploadu, skutečný rozestup pro tarif testovacího účtu a jestli limit platí na účet, projekt, nebo token.
3. Největší dávka JSON, kterou server přijme (100, 500, 1 000, 5 000 položek), doba odpovědi a největší velikost těla.
4. Doba a velikost odpovědi `terms/list` pro projekt v řádu tisíců klíčů.
5. Které časové údaje (`terms_last_added`, `terms_last_updated`, `updated` jazyka, `updated` klíče a překladu) se změní po přidání, úpravě, přejmenování a smazání klíče, smazání překladu a nahrání souboru.
6. Chování `terms/add` s existujícím klíčem, `terms/update` a `translations/update` s neexistujícím, `terms/delete` vůči překladům a atomicita dávky.
7. Jestli chyby přicházejí s HTTP stavem 200 a kódem jen v těle.
8. Jestli se stažení odkazu z exportu počítá do limitu požadavků.
9. Věrnost exportu a importu `android_strings`, `xcstrings` a `resx` na smyšlených souborech: escapování, komentáře, CDATA a HTML, `translatable="false"`, množné tvary, varianty xcstrings, komentáře resx.
10. Co smí token jen pro čtení a na kterých metodách skončí chybou 4030.
11. Doba zpracování uploadu (chyba 4033).

## Decision

Návrh: Orca synchronizuje s POEditorem přes JSON metody API, požadavky posílá jeden za druhým s rezervou pod limity tarifu Free a nahrávání souborů pro odeslání čekajících změn nepoužívá.

- **Proč JSON metody, ne upload:** odpovídají modelu čekajících změn (přidat, upravit, smazat, jen vybrané klíče), nemají vlastní limit 20 s, nepotřebují soubor ve formátu platformy a nemažou nic, co v dávce chybí. Odeslání tak mění jen server a jen vybrané klíče, jak chce oddíl 14.
- **`projects/sync` a `sync_terms=1` Orca nikdy nepoužije**, protože mažou klíče, které v datech chybí.
- **Upload jen na výslovný pokyn** pro počáteční import souboru do prázdného projektu, nejvýš 1 za 21 s bez ohledu na tarif, dokud část B nezměří rozestup pro placené tarify.
- **Pořadí odeslání:** `terms/add` → `terms/update` (přejmenování) → `languages/update` po jazycích (nové i upravené překlady jedním voláním) → `translations/delete` po jazycích → `terms/delete`. Mazání je na konci, aby přerušené odeslání nic neztratilo. Po odeslání ověřovací `terms/list` dotčených jazyků, protože odpověď vrací jen počty.
- **Velikost dávky:** nejvýš 100 položek v jednom požadavku, dokud část B nezměří skutečný strop. Při běžné várce čekajících změn to znamená jeden požadavek na metodu a jazyk.
- **Rozestup:** jeden požadavek najednou, nejméně 1 s mezi požadavky (60 za minutu proti limitu 100) a klouzavý strop 1 500 požadavků za hodinu (proti 2 000). Stejné hodnoty pro všechny tarify, protože tarif účtu API nevrací a přiřazení „Paid“ k tarifům není zdokumentované.
- **Po chybě 429 nebo 4048** Orca přestane posílat, počká nejméně 60 s, další pokusy s rostoucím odstupem a stav ukáže uživateli. Zápis zopakuje až po ověřovacím čtení, protože API nemá idempotenci ani revize.
- **Kontrola zastaralosti:** dva požadavky (`projects/view`, `languages/list`) na pokyn uživatele a při otevření pohledu lokalizace, ne automaticky na pozadí v kratším intervalu než 5 minut. Počet novějších změn a konflikty s čekajícími změnami až z úplného stažení (`terms/list` po jazycích). Těsně před odesláním znovu porovnat `updated` dotčených překladů se staženým stavem, protože server souběžné změny nehlídá.
- **Stažení stavu:** `terms/list` po jazycích, ne export souborů. Je to formát nezávislý na platformě, nese časy úprav po klíčích a stojí jeden požadavek na jazyk místo dvou. Export ve formátu platformy nechat jako samostatnou akci pro zápis do souborů, až část B ověří věrnost formátů.

K návrhu se vrátit po části B; čísla dávky a rozestupu jsou výchozí hodnoty z dokumentace, ne měření.

## Consequences

- Klient pro M6 potřebuje frontu požadavků s jedním souběžným požadavkem, minimálním rozestupem a hodinovým rozpočtem. Odeslání stojí nejvýš 2 požadavky na kontrolu, 3 na projekt a 3 na jazyk včetně ověřovacího čtení, stažení 2 plus jeden na jazyk. Při šesti jazycích je to 23 a 8 požadavků, obojí se vejde do minuty.
- Chybějící revize a výsledky po položkách znamenají, že klient čte před zápisem a po něm. Konflikt „změna stejného textu na serveru“ jde poznat jen porovnáním `updated` a obsahu.
- Mapování klíčů platforem na `term` + `context` v POEditoru je otázka návrhu M6. resx kontext ani množné tvary nemá, Android nemá `string-array`, xcstrings má varianty podle zařízení jako samostatné klíče.
- Token platí pro celý účet. Nastavení musí umět vybrat projekt a dovolit token jen pro čtení, se kterým Orca nabídne jen stažení. Ochrana „nenahrávat do jiného než testovacího projektu“ z tiketu se v produktu promítne do potvrzení cílového projektu před odesláním.
- Přidání klíčů může selhat chybou 4032 podle stavu celého účtu. Orca musí chybu ukázat srozumitelně a odeslání nechat ve stavu, ze kterého jde pokračovat.
- Formáty `android_strings`, `xcstrings` a `resx` POEditor přijímá i vydává, takže zápis do souborů platforem může jít přes export. Věrnost formátů je ale neověřená (část B, bod 9).
- Oznámení o změnách na serveru Orca mít nebude; Callbacks jsou od tarifu Premium, potřebují veřejnou adresu a mazání nepokryjí.
- U SSH workspace může API volat Orca na počítači uživatele; soubory platforem se čtou a zapisují tam, kde leží worktree. Kde poběží klient POEditoru, rozhodne návrh M6.
- Neověřeno proti živému API: všechny limity, chování při jejich překročení, strop dávky, časové údaje po mazání, atomicita dávek a věrnost formátů. Seznam měření je výše v „Co by ověřila část B“.
