# Code model fixtures

Three invented projects of the same small shop ("Obchod"), one per platform the code model covers. They exist so the extractors and the code model core can be tested without a real project. Schema: [`docs/review-ide/09-model-kodu.md`](../../../docs/review-ide/09-model-kodu.md).

Everything here is made up. Never copy code, names, paths or addresses from a real project into this folder.

| Folder          | Platform        | Build files                                                                                                      |
| --------------- | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `kotlin-gradle` | Android, Kotlin | Gradle Kotlin DSL: 7 modules, version catalog, a convention plugin in `build-logic`, type-safe project accessors |
| `swift-ios`     | iOS, Swift      | A hand-written `Obchod.xcodeproj` with 3 targets and a local Swift package `Packages/ObchodKit` with 6 targets   |
| `dotnet-api`    | Backend, C#     | `Obchod.sln` with 5 SDK-style projects, `Directory.Build.props`, central package versions                        |

## What the projects contain on purpose

- **The same three endpoints on all platforms** (`GET api/cart`, `DELETE api/cart/items/{itemId}`, `POST api/orders`), so client calls can be paired with backend actions.
- **A dependency that breaks layering:** the checkout feature depends on the cart feature (`:feature:checkout` to `:feature:cart`, `CheckoutFeature` to `CartFeature`).
- **A dependency a module does not declare itself:** `:feature:cart` gets `:core:ui` from the convention plugin `obchod.android.feature`.
- **Screens with a state, intents and effects, and navigation between them:** cart, checkout and order confirmation.
- **Localization defects:** a key without a Czech translation, a translation that lost its placeholder, a plural, and in the string catalog a value marked `needs_review`.
- **Authorization on one controller only**, with one anonymous action, and one minimal API endpoint in `Program.cs`.

## Expected output

`expected/<fixture>.structure.json` holds the `structure` and `problems` parts of the model for each fixture: build roots, modules, module dependencies and external dependencies. They were produced by the TASK-60 prototypes; for `kotlin-gradle` the static reader and the Gradle Tooling API gave the same result, for `dotnet-api` the static reader and MSBuild's own evaluation did, and for `swift-ios` the result was checked by hand against the build files.

There is no expected output for file facts, screens, controllers or localization yet. Add it together with the code that produces it.

## Why here

- `tests/` is not packaged into the app, and the root gates do not look inside `tests/fixtures`: Vitest only collects `src/**`, `config/scripts/**`, `tests/tools/**` and `tests/e2e/**`, no `tsconfig` includes this folder, and it holds no TypeScript or JavaScript for the linters to pick up. JSON here is formatted by `oxfmt` like everywhere else.
- The folder is neutral between the TypeScript core and the three extractors, which are built with different toolchains and all read the same fixtures.
- Upstream has no `tests/fixtures/code-model`, so merges from upstream do not touch it.

## Rules

- Do not run Gradle, Xcode, SwiftPM or `dotnet` inside this folder: they write `build`, `.gradle`, `.build`, `.swiftpm`, `bin` and `obj` next to the sources. Copy the fixture elsewhere first.
- No Gradle wrapper jar, no lock files and no generated files are checked in.
- The projects do not have to build an app. The Swift package builds and the .NET solution builds and passes its tests; the Android project was only configured by Gradle and its Kotlin sources were only parsed.
