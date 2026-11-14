# Funkce převzaté z IDE

Funkce Android Studia, Rideru a Xcode, které přidáme do Orca Dev, seřazené od nejpraktičtějších. Pořadí určuje četnost použití a to, jak moc navazují na existující části (Monaco, language servery, hooky agentů, panel emulátoru). U každé je přínos AI a realizovatelnost.

| # | Funkce | Původ | Realizovatelnost |
| --- | --- | --- | --- |
| 1 | Search Everywhere a navigace | Double Shift, Recent Locations, Open Quickly | snadná |
| 2 | Find Usages a Call Hierarchy | Android Studio, Rider, Xcode Callers | snadná s language servery |
| 3 | Inspekce, rychlé opravy a chyby buildu | Alt+Enter, Fix-it, Build Analyzer | střední |
| 4 | Local History | JetBrains | střední |
| 5 | Annotate a historie výběru | Git Blame, Show History for Selection | snadná |
| 6 | Logcat a konzole aplikace | Android Studio, Xcode | snadná pro Android, střední pro iOS |
| 7 | Layout Inspector a View Debugger | Android Studio, Xcode | střední až náročná |
| 8 | TODO okno | JetBrains | snadná |
| 9 | HTTP klient a Endpoints | Rider | snadná |
| 10 | Refaktoringy | všechna IDE | střední |
| 11 | Structural Search | IntelliJ | náročná |
| 12 | Aktualizace závislostí | Android Studio, Rider (NuGet), Xcode (SPM) | střední |
| 13 | Pády z produkce | App Quality Insights | střední, vyžaduje napojení na službu |

Debugger, profilery a Instruments, Compose a SwiftUI Preview, podepisování a release zůstávají v nativních IDE. Orca do nich předá kontext otevřením na konkrétním řádku.

## 1. Search Everywhere a navigace

- Jedno hledání přes soubory, symboly, akce, PR, lokalizační klíče a obrazovky všech platforem projektu, včetně referencí.
- Zpět a Vpřed mezi místy a seznam nedávných míst.
- **AI:** hledání přirozeným jazykem nad modelem kódu („kde se počítá cena dopravy“) vrátí místa na Androidu, v iOS i na backendu.
- **Realizace:** existující rychlé otevírání a paleta worktrees, symboly z language serverů (`workspace/symbol`).

## 2. Find Usages a Call Hierarchy

- Použití symbolu a strom volajících a volaných přes language server (`references`, `callHierarchy`).
- **AI:** použití seskupená podle účelu a odhad dopadu změny („signatura se mění na 14 místech, 3 jsou v platbách“). Odhad je vstupem hodnocení rizika celků ([AI a review](./06-ai-a-review.md), bod 6).
- **Realizace:** závisí jen na mostu language serverů do Monaca.

## 3. Inspekce, rychlé opravy a chyby buildu

- Code actions language serveru jako rychlé opravy v editoru.
- Srozumitelné zobrazení chyb Gradle, xcodebuild a dotnet build s odkazem na místo.
- **AI:** oprava s vysvětlením, „oprav všechny výskyty v projektu“, a stejné nálezy jako vstup bran kvality pro agenta.
- **Realizace:** code actions z language serverů; parsování výstupu buildů; navazuje na `pr-checks-fix-prompt.ts`.

## 4. Local History

- Časová osa změn souboru včetně každého zápisu agenta, s náhledem a vrácením libovolného bodu.
- Vrácení celého celku, ne jen souboru.
- **AI:** body pojmenované podle záměru („agent přidal opakování dotazu“).
- **Realizace:** zápisy agenta z hooků (Edit, Write) a ukládání editoru; vlastní úložiště snímků mimo git. Při práci s agenty je to záchranná síť, kterou commity nepokryjí.

## 5. Annotate a historie výběru

- Blame u řádků a historie vybraného bloku.
- **AI:** „proč je ten kód takhle“ složené z commitů, PR, pracovních položek Azure DevOps a přepisů agentů. Navazuje na důvod u hunku.
- **Realizace:** git log a blame s omezeným rozsahem (pravidla Git Scan Safety), API Azure DevOps z TASK-51.

## 6. Logcat a konzole aplikace

- Strukturované logy aplikace z emulátoru nebo zařízení s filtrem na balíček, úroveň a tag; zachycení pádů.
- **AI:** vysvětlení stack trace, nalezení řádků v kódu a PR, který je naposledy měnil, a oprava agentem.
- **Realizace:** Android má `main/emulator/android/android-logcat.ts`. iOS simulátor přes `xcrun simctl spawn <device> log stream`, fyzický iPhone přes `devicectl` nebo konzoli zařízení.

## 7. Layout Inspector a View Debugger

- Klik na prvek obrazovky v emulátoru ukáže jeho vlastnosti a otevře zdroj (composable, SwiftUI view).
- **AI:** odpovědi typu „proč je tlačítko mimo“ a dohledání zdroje, když přímé mapování chybí.
- **Realizace:** strom UI už fork čte (`uiautomator-tree.ts`, `serve-sim-accessibility-tree.ts`). Mapování prvku na zdroj je náročné: pro Compose přes `testTag` a informace o zdroji v debug buildu, jinak přes text a identifikátory s pomocí AI. Viz také [Zařízení, inspektory a hlas](./08-zarizeni-inspektory-hlas.md).

## 8. TODO okno

- TODO a FIXME ze všech platforem na jednom místě, filtr na změněné soubory.
- **AI:** TODO, která nechal agent, jsou zvýrazněná a v review se ukáží jako nedodělky.
- **Realizace:** hledání přes bundlovaný `rg`; původ z hooků agenta.

## 9. HTTP klient a Endpoints

- Z pohledu Controllery a akce poslat požadavek na endpoint lokálního nebo testovacího backendu; historie požadavků.
- **AI:** sestavení požadavku z DTO a autorizace, realistická testovací data.
- **Realizace:** síťová vrstva hlavního procesu; prostředí a tokeny v safeStorage.

## 10. Refaktoringy

- Přejmenování, změna signatury, přesun: jednoduché přes language server, složité přes agenta s plánem a branami kvality.
- **AI:** přejmenování napříč platformami přes Funkci (lokalizační klíč, pole DTO i u klientů).
- **Realizace:** `rename` a code actions z language serverů; cross-platform část až s analytickým jádrem.

## 11. Structural Search

- Hledání podle struktury kódu, ne textu.
- **AI:** dotaz přirozeným jazykem („ViewModely, které volají API napřímo“) se přeloží na dotaz nad modelem kódu. Výsledek jde uložit jako vlastní kontrolu ve Zdraví kódu.
- **Realizace:** vyžaduje analytické jádro s dostatečně bohatým modelem.

## 12. Aktualizace závislostí

- Přehled zastaralých závislostí (Gradle version catalog, SPM, NuGet).
- **AI:** shrnutí changelogu a změn, které rozbijí kompatibilitu; agent připraví upgrade ve worktree a hotovo je až po průchodu branami kvality.
- **Realizace:** čtení manifestů a registrů balíčků; upgrade jako běžná úloha agenta.

## 13. Pády z produkce

- Pády a ANR z Crashlytics nebo Play Vitals propojené s řádky kódu a verzemi.
- **AI:** třídění pádů podle dopadu, souvislost s nedávnými PR a návrh opravy.
- **Realizace:** napojení na API služby s tokenem v safeStorage; proto až na konci.
