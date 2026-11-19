# Model kódu: schéma verze 0

Návrh společného schématu, ve kterém extraktory pro Kotlin, Swift a C# odevzdávají výsledky a ze kterého čtou všechny pohledy analytického jádra ([01-integrace.md](./01-integrace.md), oddíl Analytické jádro). Vznikl v pokusu TASK-60; měření, porovnání a návrh distribuce jsou v [decision-9](../../backlog/decisions/decision-9%20-%20Model-kódu-schéma-verze-0-a-statické-čtení-build-souborů-jako-výchozí-distribuce-extraktorů-k-rozhodnutí.md).

Stav: návrh. Části `structure` a `files` (bez `references`) vypisují tři prototypy nad smyšlenými i skutečnými projekty. Zbytek je navržený z četby kódu a ověřený jen počty rozpoznaných deklarací, viz [Co pokus ověřil a co ne](#co-pokus-ověřil-a-co-ne).

## Zásady

- **Jeden dokument JSON** s polem `schemaVersion`. Změna, která by rozbila čtenáře, zvyšuje verzi; nové nepovinné pole ne.
- **Cesty** jsou relativní ke kořeni workspace (git worktree nebo složka), s lomítkem `/`. **Řádky** se číslují od 1.
- **Identifikátory jsou stabilní mezi commity.** Skládají se ze jmen, nikdy z čísel řádků ani z pořadí. Grafický diff je rozdíl dvou modelů a entita, která se jen posunula, v něm nesmí vypadat jako smazaná a přidaná.
- **Výstup je deterministický.** Pole jsou seřazená, dokument nenese čas ani absolutní cesty. Stejný vstup dává stejné bajty, takže se výsledky dají porovnávat a ukládat podle obsahu.
- **Co extraktor neumí rozhodnout, ohlásí** v `problems`. Nic nedomýšlí potichu.
- **Extraktor nezná konvence aplikace.** Vypisuje fakta (deklarace, anotace, nadtypy, volání). Co je obrazovka, intent nebo controller, rozhoduje jádro Orky podle rozpoznávacího profilu v nastavení projektu.

## Kdo co počítá

| Vrstva                | Obsah                                                                      | Kdo ji počítá                                      | Na čem závisí                                    |
| --------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Struktura             | kořeny sestavení, moduly, závislosti                                       | čtečka build souborů                               | build soubory                                    |
| Fakta o souboru       | metriky, importy, osnova deklarací, vybraná volání                         | extraktor jazyka (Kotlin PSI, SwiftSyntax, Roslyn) | obsah jednoho souboru                            |
| Zdroje lokalizace     | klíče a hodnoty podle jazyka                                               | jádro Orky                                         | `strings.xml`, `.xcstrings`, `.strings`, `.resx` |
| Odvozené entity       | obrazovky, intenty, přechody, controllery, akce, volání API, použití klíčů | jádro Orky podle rozpoznávacího profilu            | fakta, struktura, profil                         |
| Doplňky podle commitu | četnost změn za 90 dní, pokrytí testy                                      | jádro Orky                                         | historie gitu, reporty                           |

Extraktor tedy odevzdá `structure`, `files` a `problems`. Ostatní části dokumentu doplní jádro, když skládá snímek. Fakta o souboru jsou čistou funkcí jeho obsahu, a proto se dají ukládat podle obsahu a sdílet mezi worktrees ([Klíč cache](#klíč-cache)).

## Dokument

```json
{
  "schemaVersion": 0,
  "producer": {
    "name": "orca-code-model-kotlin",
    "version": "1.0.0",
    "mode": "gradle-static+kotlin-psi"
  },
  "platform": "android",
  "root": "",
  "structure": { "roots": [], "modules": [], "dependencies": [], "externalDependencies": [] },
  "files": [],
  "localization": { "resources": [], "keys": [], "usages": [] },
  "screens": [],
  "transitions": [],
  "controllers": [],
  "apiCalls": [],
  "problems": []
}
```

`platform` je `android`, `ios` nebo `dotnet`. `root` je cesta, od které extraktor četl; prázdná znamená kořen workspace. Repozitář s více platformami má jeden dokument na platformu.

## Struktura

### Kořeny sestavení

Kořen je soubor, který moduly vyjmenovává: `settings.gradle.kts`, `Package.swift`, `project.pbxproj`, `Project.swift` (Tuist) nebo řešení `.sln`.

| Pole      | Význam                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `file`    | Cesta k souboru kořene; slouží i jako jeho identifikátor                                                                          |
| `kind`    | `gradle`, `swiftpm`, `xcodeproj`, `tuist`, `dotnet-solution`                                                                      |
| `path`    | Adresář kořene                                                                                                                    |
| `name`    | Jméno z build souboru                                                                                                             |
| `reader`  | Čím byl přečten: `gradle-static`, `gradle-tooling-api`, `swiftpm-describe`, `xcodeproj`, `tuist-dump`, `dotnet-static`, `msbuild` |
| `members` | Identifikátory modulů, které do kořene patří                                                                                      |

Modul může být členem více kořenů. U .NET je to běžné: projekt bývá ve více řešeních, nebo v žádném. Proto vazbu nese kořen, ne modul.

### Moduly

```json
{
  "id": ":feature:cart",
  "name": "cart",
  "path": "feature/cart",
  "kind": "library",
  "type": "com.android.library",
  "language": "kotlin",
  "buildFile": "feature/cart/build.gradle.kts",
  "namespace": "com.example.obchod.feature.cart",
  "sourceRoots": [
    { "path": "feature/cart/src/main/kotlin", "set": "main", "name": "main" },
    { "path": "feature/cart/src/test/kotlin", "set": "test", "name": "test" }
  ]
}
```

| Pole               | Význam                                                                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Jméno modulu v jeho build systému: cesta projektu Gradle (`:feature:cart`), jméno targetu (SwiftPM, Xcode, Tuist), jméno projektu .NET. Když se v dokumentu sejdou dva moduly stejného jména, dostanou oba tvar `<adresář>#<jméno>` a extraktor to ohlásí |
| `name`             | Jméno k zobrazení                                                                                                                                                                                                                                         |
| `path`             | Adresář modulu; prázdný, když modul nemá jeden společný adresář                                                                                                                                                                                           |
| `kind`             | `application`, `library`, `test`, `tool`                                                                                                                                                                                                                  |
| `type`             | Původní typ: identifikátor pluginu Gradle, typ produktu Xcode, `swiftpm:library`, `sdk:Microsoft.NET.Sdk.Web`, `msbuild:legacy`                                                                                                                           |
| `language`         | `kotlin`, `swift`, `csharp`                                                                                                                                                                                                                               |
| `buildFile`        | Soubor, který modul deklaruje                                                                                                                                                                                                                             |
| `namespace`        | Kořenový balíček nebo jmenný prostor, když ho build soubor uvádí                                                                                                                                                                                          |
| `targetFrameworks` | Jen .NET: cílové frameworky                                                                                                                                                                                                                               |
| `sourceRoots`      | Adresáře se zdroji; `set` je `main` nebo `test`, `name` původní jméno sady                                                                                                                                                                                |

Soubor patří modulu, jehož kořen zdrojů je nejdelší předponou jeho cesty. Soubor mimo všechny kořeny modul nemá.

### Závislosti

`dependencies` jsou hrany mezi moduly workspace, `externalDependencies` hrany na knihovny a na projekty mimo workspace. Mají stejný tvar:

```json
{
  "from": ":feature:cart",
  "to": ":core:ui",
  "scope": "implementation",
  "declaredAs": "implementation",
  "origin": { "file": "build-logic/src/main/kotlin/obchod.android.feature.gradle.kts", "line": 26 },
  "via": "obchod.android.feature"
}
```

| Pole         | Význam                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------- |
| `from`, `to` | Identifikátory modulů; u vnější závislosti je `to` souřadnice nebo jméno balíčku          |
| `scope`      | Sjednocený druh hrany, viz tabulka níže                                                   |
| `declaredAs` | Původní zápis: konfigurace Gradle, `target`, `packageProduct:<jméno>`, `ProjectReference` |
| `origin`     | Soubor a řádek deklarace. Chybí, když ji čtečka nezná (model z Gradlu ji nedává)          |
| `via`        | Konvenční plugin nebo sdílený soubor, který hranu přidal za modul                         |
| `version`    | Jen vnější závislosti, když je verze známá bez rozřešení                                  |

| `scope`          | Gradle                             | SwiftPM, Xcode, Tuist         | .NET                                                    |
| ---------------- | ---------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `api`            | `api`                              | —                             | `ProjectReference`, `PackageReference` (přenáší se dál) |
| `implementation` | `implementation`                   | závislost targetu             | s `PrivateAssets="all"`                                 |
| `compileOnly`    | `compileOnly`                      | —                             | —                                                       |
| `runtime`        | `runtimeOnly`                      | —                             | —                                                       |
| `test`           | `test*`, `androidTest*`            | závislost testovacího targetu | reference z testovacího projektu                        |
| `tooling`        | `ksp`, `kapt`, `lint*`, desugaring | pluginy a makra               | `ReferenceOutputAssembly="false"`                       |
| `other`          | ostatní konfigurace                | —                             | —                                                       |

Pravidla vrstev (například „feature nesmí záviset na feature“) se vyhodnocují nad `dependencies` v jádře. Smyšlené projekty jednu takovou hranu záměrně obsahují.

## Fakta o souboru

```json
{
  "path": "core/data/src/main/kotlin/com/example/obchod/core/data/CartApi.kt",
  "module": ":core:data",
  "set": "main",
  "language": "kotlin",
  "namespace": "com.example.obchod.core.data",
  "imports": [
    "com.example.obchod.core.model.Cart",
    "com.example.obchod.core.model.Order",
    "com.example.obchod.core.model.PaymentMethod",
    "retrofit2.http.Body",
    "retrofit2.http.DELETE",
    "retrofit2.http.GET",
    "retrofit2.http.POST",
    "retrofit2.http.Path"
  ],
  "metrics": {
    "lines": 23,
    "codeLines": 18,
    "commentLines": 0,
    "blankLines": 5,
    "types": 2,
    "functions": 3,
    "complexity": 3,
    "maxFunctionComplexity": 1,
    "parseErrors": 0
  },
  "declarations": [],
  "references": []
}
```

`module` a `set` doplňuje ten, kdo zná strukturu; samotná fakta na nich nezávisí.

### Metriky

| Pole                    | Definice                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `lines`                 | Počet řádků souboru                                                                    |
| `codeLines`             | Řádky, na kterých je aspoň jeden token                                                 |
| `commentLines`          | Řádky, na které zasahuje komentář a není na nich kód                                   |
| `blankLines`            | Zbytek                                                                                 |
| `types`                 | Deklarace typů včetně vnořených                                                        |
| `functions`             | Funkce, metody a konstruktory mimo těla jiných funkcí                                  |
| `complexity`            | Součet složitostí funkcí a větví v inicializátorech a přístupových metodách vlastností |
| `maxFunctionComplexity` | Nejvyšší složitost jedné funkce v souboru                                              |
| `parseErrors`           | Chyby parseru; soubor s chybou se přesto popíše, jak to jde                            |

Složitost funkce je 1 a za každé větvení další 1: `if`, `guard`, cykly, `catch`, větev `when`/`switch` kromě výchozí, ternární výraz a operátory `&&`, `||`, `??` a `?:`. Lokální funkce a lambdy se počítají do funkce, která je obsahuje.

Četnost změn a pokrytí do faktů nepatří, protože nezávisí jen na obsahu souboru. Jádro je připojuje ke snímku podle commitu.

### Deklarace

Osnova souboru: typy, funkce, vlastnosti, případy výčtu. Je podkladem pro rozpoznání obrazovek a controllerů i pro vyhledání a skok na řádek.

```json
{
  "id": "com.example.obchod.core.data.CartApi.removeItem(String)",
  "kind": "function",
  "name": "removeItem",
  "parent": "com.example.obchod.core.data.CartApi",
  "modifiers": ["suspend"],
  "annotations": [{ "name": "DELETE", "arguments": ["\"api/cart/items/{itemId}\""] }],
  "parameters": [
    {
      "name": "itemId",
      "type": "String",
      "annotations": [{ "name": "Path", "arguments": ["\"itemId\""] }]
    }
  ],
  "returnType": "Cart",
  "complexity": 1,
  "line": 16,
  "endLine": 17
}
```

| Pole                 | Význam                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                 | Kvalifikované jméno; funkce nese i typy nebo jmenovky parametrů, aby se rozlišila přetížení. Druhý výskyt téhož `id` v souboru dostane příponu `#2`    |
| `kind`               | `class`, `interface`, `object`, `struct`, `enum`, `protocol`, `actor`, `extension`, `record`, `function`, `property`, `field`, `enumCase`, `typealias` |
| `name`, `parent`     | Jméno bez kvalifikace a `id` nadřazené deklarace                                                                                                       |
| `modifiers`          | Modifikátory tak, jak jsou v kódu (`sealed`, `data`, `public`, `suspend`, `async`)                                                                     |
| `annotations`        | Anotace a atributy; `arguments` je text argumentů beze změny                                                                                           |
| `supertypes`         | Nadtypy a protokoly tak, jak jsou zapsané                                                                                                              |
| `parameters`         | Parametry funkce nebo primárního konstruktoru, s typem a anotacemi                                                                                     |
| `returnType`, `type` | Zapsaný typ, když je uveden                                                                                                                            |
| `complexity`         | Jen funkce                                                                                                                                             |
| `line`, `endLine`    | Rozsah deklarace včetně anotací, bez dokumentačního komentáře                                                                                          |

Typy jsou text ze zdroje, ne rozřešené symboly. Extraktory nekompilují, a proto nepotřebují build, závislosti ani síť. Cenou je, že `Cart` v jednom souboru a `Cart` v druhém spojuje jádro podle importů a jmenných prostorů, ne podle symbolu.

### Volání

`references` zachycuje vybraná volání: ta, jejichž jméno je v rozpoznávacím profilu, a přístupy ke zdrojům lokalizace. Všechna volání by výstup znásobila.

```json
{
  "kind": "call",
  "name": "navigate",
  "receiver": "navController",
  "arguments": ["Routes.CHECKOUT"],
  "in": "com.example.obchod.ObchodNavHost()",
  "line": 25
}
```

`in` je `id` deklarace, ve které volání leží. Druhy jsou `call` (volání funkce), `resource` (například `R.string.cart_title`, `Text("cart_title")`, `localizer["CartEmpty"]`) a `typeUse` (použití typu jako argumentu, například cíl navigace).

## Obrazovky, intenty a přechody

```json
{
  "id": "screen:com.example.obchod.feature.cart.CartScreen",
  "name": "Cart",
  "module": ":feature:cart",
  "ui": "com.example.obchod.feature.cart.CartScreen(CartViewModel,() -> Unit,() -> Unit)",
  "viewModel": "com.example.obchod.feature.cart.CartViewModel",
  "route": "cart",
  "state": "com.example.obchod.feature.cart.CartState",
  "intents": [
    {
      "id": "com.example.obchod.feature.cart.CartIntent.RemoveItem",
      "name": "RemoveItem",
      "parameters": [{ "name": "itemId", "type": "String" }]
    }
  ],
  "effects": ["com.example.obchod.feature.cart.CartEffect.NavigateToCheckout"],
  "file": "feature/cart/src/main/kotlin/com/example/obchod/feature/cart/CartScreen.kt",
  "line": 14
}
```

Obrazovka odkazuje na deklarace přes jejich `id`: `ui` (composable, `View`, view controller), `viewModel`, `state`, `intents` (případy zapečetěného typu nebo výčtu akcí) a `effects`. Chybějící část se vynechá; obrazovka bez view modelu je platná.

```json
{
  "id": "transition:screen:…CartScreen->screen:…CheckoutScreen",
  "from": "screen:com.example.obchod.feature.cart.CartScreen",
  "to": "screen:com.example.obchod.feature.checkout.CheckoutScreen",
  "kind": "push",
  "trigger": "com.example.obchod.feature.cart.CartEffect.NavigateToCheckout",
  "origin": { "file": "app/src/main/kotlin/com/example/obchod/ObchodNavHost.kt", "line": 25 }
}
```

`kind` je `push`, `replace`, `back`, `modal` nebo `unknown`. `to` chybí u návratu zpět. Přechod, jehož cíl se nepodařilo určit (cesta složená za běhu), se uvede s `kind: "unknown"` a s problémem, aby graf ukázal, že je neúplný.

## Controllery a akce

```json
{
  "id": "Obchod.Api.Controllers.OrdersController",
  "name": "Orders",
  "module": "Obchod.Api",
  "routePrefix": "api/orders",
  "authorization": { "required": true, "policies": [] },
  "file": "src/Obchod.Api/Controllers/OrdersController.cs",
  "line": 11,
  "actions": [
    {
      "id": "Obchod.Api.Controllers.OrdersController.Create(CreateOrderRequest,CancellationToken)",
      "name": "Create",
      "method": "POST",
      "route": "api/orders",
      "parameters": [{ "name": "request", "type": "CreateOrderRequest", "source": "body" }],
      "returnType": "Order",
      "responses": [{ "status": 201, "type": "Order" }, { "status": 409 }],
      "authorization": { "required": true, "policies": [] },
      "line": 16
    }
  ]
}
```

`route` je šablona složená z prefixu controlleru a akce, se zástupkami v původním zápisu (`{itemId}`). `source` parametru je `route`, `query`, `body`, `header`, `form` nebo `services`. Koncové body minimal API (`app.MapGet`) se uvádějí jako controller s `kind: "minimalApi"` a akcemi podle volání.

`apiCalls` jsou volání API z klientů, ve stejném tvaru `method` a `route`:

```json
{
  "id": "com.example.obchod.core.data.CartApi.removeItem(String)",
  "module": ":core:data",
  "method": "DELETE",
  "route": "api/cart/items/{itemId}",
  "file": "core/data/src/main/kotlin/com/example/obchod/core/data/CartApi.kt",
  "line": 16
}
```

Spárování klienta s akcí backendu je porovnání `method` a normalizované `route` napříč dokumenty platforem jedné Funkce. Smyšlené projekty mají tři stejné koncové body na všech třech platformách právě kvůli tomu.

## Lokalizační klíče

```json
{
  "resources": [
    {
      "id": "core/ui/src/main/res/values",
      "module": ":core:ui",
      "format": "android-xml",
      "locales": ["en", "cs"],
      "sourceLocale": "en"
    }
  ],
  "keys": [
    {
      "key": "checkout_pay",
      "resource": "core/ui/src/main/res/values",
      "kind": "string",
      "values": {
        "en": {
          "value": "Pay %1$s",
          "placeholders": ["%1$s"],
          "file": "core/ui/src/main/res/values/strings.xml",
          "line": 8
        },
        "cs": {
          "value": "Zaplatit",
          "placeholders": [],
          "file": "core/ui/src/main/res/values-cs/strings.xml",
          "line": 8
        }
      }
    }
  ],
  "usages": [
    {
      "key": "checkout_pay",
      "resource": "core/ui/src/main/res/values",
      "in": "com.example.obchod.feature.checkout.CheckoutScreen(CheckoutViewModel,(orderId: String) -> Unit,() -> Unit)",
      "file": "feature/checkout/src/main/kotlin/com/example/obchod/feature/checkout/CheckoutScreen.kt",
      "line": 34
    }
  ]
}
```

`format` je `android-xml`, `xcstrings`, `strings`, `resx`. `kind` je `string`, `plural` nebo `array`; plurál má hodnoty podle kategorie (`one`, `few`, `other`). Katalog `.xcstrings` nese u hodnoty i `state` (`translated`, `needs_review`). Chybějící překlad je klíč bez hodnoty v některém jazyce, nesoulad zástupek rozdílné `placeholders`; obojí počítá jádro z `keys` a smyšlené projekty mají od každého jeden případ. `usages` vzniká z `references` druhu `resource`.

## Problémy

```json
{
  "severity": "warning",
  "code": "gradle.unknown-project",
  "message": "dependency on :core:legacy, which is not an included project with a build file",
  "file": "app/build.gradle.kts",
  "line": 31
}
```

`severity` je `error`, `warning` nebo `info`. `code` je stabilní a začíná oblastí (`gradle.`, `msbuild.`, `dotnet.`, `swiftpm.`, `xcodeproj.`, `tuist.`, `structure.`). Pohled, který z neúplných dat kreslí, to má uživateli ukázat.

## Rozpoznávací profil

Profil říká, podle čeho jádro pozná odvozené entity: nadtypy a anotace obrazovek, přípony jmen kontraktů, jména volání navigace, anotace klientů API a atributy controllerů. Patří do nastavení projektu v Orce, ne do repozitáře ([01-integrace.md](./01-integrace.md), Pravidla mimo repozitář). Orca dodá výchozí profil pro každou platformu (Compose a ViewModel, SwiftUI a UIKit, ASP.NET Core) a projekt ho upraví.

Extraktor z profilu dostává jen seznam jmen volání, která má zapsat do `references`. Otisk této části profilu je proto součástí klíče faktů o souboru; zbytek profilu ovlivňuje až skládání snímku.

## Klíč cache

| Co se ukládá      | Klíč                                                                                              | Proč                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Fakta o souboru   | otisk obsahu souboru, extraktor a jeho verze, `schemaVersion`, otisk seznamu zachytávaných volání | Fakta jsou funkcí obsahu. Stejný soubor ve dvou worktrees, větvích nebo commitech se počítá jednou |
| Struktura         | čtečka a její verze, `schemaVersion`, otisk množiny build souborů (cesta a otisk obsahu každého)  | Změna zdrojového souboru strukturu nemění; změna build souboru ano                                 |
| Zdroje lokalizace | otisk obsahu souboru zdrojů, verze čtečky                                                         | Stejně jako fakta                                                                                  |
| Složený snímek    | identita repozitáře, otisk stromu, verze extraktorů, otisk profilu                                | Rychlé otevření už spočítaného commitu; dá se kdykoli složit znovu z vrstev výše                   |

- **Otisk obsahu** je identifikátor blobu v gitu. Pro sledované nezměněné soubory ho git dá bez čtení obsahu (`git ls-tree`, `git ls-files -s`); pro změněné a nesledované soubory a pro složku bez gitu ho Orca spočítá stejným vzorcem.
- **Otisk stromu** je u čistého commitu identifikátor jeho stromu. U rozpracovaného worktree a u složky bez gitu se snímek skládá z vrstev při každém dotazu a neukládá se; počítají se jen soubory, jejichž otisk v cache chybí.
- **Grafický diff** báze proti HEAD jsou dva snímky. Fakta sdílejí všechny soubory, které se mezi nimi nezměnily, takže druhý snímek stojí jen změněné soubory.
- **Cache leží na hostiteli, který kód vykonává,** v datech Orky mimo repozitář. Platí to i pro SSH: extraktor běží tam, kde jsou soubory, a klient dostává hotový snímek.
- **Sdílí se mezi worktrees** téhož repozitáře i mezi repozitáři, protože klíč faktů repozitář neobsahuje.

Klíč „repozitář a SHA commitu“ z původního návrhu tedy zůstává jen pro složený snímek. Samotný by nepokryl rozpracované změny ani složky bez gitu a každý commit by počítal všechno znovu.

## Co pokus ověřil a co ne

Ověřeno prototypy nad smyšlenými projekty i nad kopiemi skutečných projektů všech tří platforem:

- `structure`: kořeny, moduly, závislosti a vnější závislosti. U Kotlinu shodně se dvěma čtečkami (statické čtení a Gradle Tooling API), u C# shodně s vyhodnocením v MSBuildu.
- `files`: metriky a osnova deklarací s anotacemi, nadtypy a parametry, bez jediné chyby parseru. Výstup je stejný bez ohledu na počet vláken.
- Rozpoznání z osnovy: počty view modelů, obrazovek, kontraktů, klientů API, controllerů a akcí nalezených jen z anotací, nadtypů a jmen odpovídají tomu, co v projektech je. Počty jsou v záznamu rozhodnutí.

Navrženo, ale žádný prototyp to nevypisuje:

- `references`, a tedy přechody mezi obrazovkami, použití lokalizačních klíčů a koncové body minimal API.
- Čtení zdrojů lokalizace a párování volání API s akcemi.
- Samotná cache a skládání snímku v jádře.

Prototypy se od schématu liší ve třech drobnostech: v C# a ve Swiftu nese `name` funkce i signaturu, pravidlo pro dva moduly stejného jména umí jen prototyp pro .NET a v prototypu pro Kotlin začíná `line` deklarace u dokumentačního komentáře, když ho deklarace má.

## Smyšlené projekty pro testy

Tři smyšlené projekty téhož obchodu jsou v [`tests/fixtures/code-model`](../../tests/fixtures/code-model/): Android (Gradle, sedm modulů, konvenční plugin), iOS (projekt Xcode a místní balíček SwiftPM) a backend (.NET, řešení s pěti projekty). Vedle nich je očekávaná `structure` každého z nich. Umístění a obsah popisuje tamní `README.md`.
