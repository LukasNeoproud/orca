# Zařízení, inspektory a hlas

Práce s emulátory a fyzickými zařízeními, inspektory běžící aplikace, přístupnost a hlasové ovládání Orca Dev.

## Co už fork má

| Oblast | Kde | Co umí |
| --- | --- | --- |
| Android emulátor a zařízení | `main/emulator/android` | `adb` inventář včetně fyzických zařízení, scrcpy stream a dotyky, logcat, strom UI (uiautomator), ovládání aplikace, oprávnění, start AVD |
| iOS simulátor | `main/emulator/*sim*`, `simctl-simulator-devices.ts` | simctl, stream obrazu, dotyky, strom přístupnosti |
| Panel emulátoru | `components/emulator-pane` | panel ve workspace, toolbar, hardwarová tlačítka, klávesnice |
| Samostatné okno | `main/window/dashboard-popout-window.ts` | vzor okna vyjmutého z hlavního okna |
| Hlas | `main/speech`, `components/dictation` | diktování s lokálními modely nebo přes OpenAI, nastavení mikrofonu |
| Oznámení | `main/notifications` | doručování oznámení, stav nepřítomnosti u počítače |

## Build a nasazení na zařízení

- **Cíl:** emulátor, simulátor nebo připojené zařízení vybrané v Orce; build a nasazení jedním krokem z workspace nebo review worktree.
- **Android:** Gradle `installDebug` nebo `adb install` na emulátor i fyzické zařízení přes USB nebo Wi-Fi; zrcadlení a ovládání fyzického zařízení přes scrcpy (už ve forku).
- **iOS simulátor:** `xcodebuild` a `simctl install` / `launch`.
- **iOS fyzické zařízení:** `xcodebuild` s podepsáním a `xcrun devicectl` pro instalaci, spuštění a logy. Zrcadlení obrazovky fyzického iPhonu nemá ekvivalent scrcpy, proto bez živého obrazu v Orce.
- **AI:** srozumitelná chyba buildu nebo podepsání s návrhem opravy; po nasazení průvodce, co vyzkoušet ([AI a review](./06-ai-a-review.md), bod 9).

## Umístění panelu emulátoru

Panel půjde zobrazit třemi způsoby a přepínat mezi nimi bez restartu streamu:

| Režim | Kdy | Realizace |
| --- | --- | --- |
| Tab v hlavní ploše | hlavní práce s aplikací, review | dnešní panel |
| Ukotvený v pravém sidebaru | vedle editoru při vývoji; telefon se do úzkého sidebaru vejde | panel jako tool window (viz [Rozložení](./03-rozlozeni.md)) |
| Samostatné okno | druhý monitor | okno podle vzoru `dashboard-popout-window.ts` |

Stream obrazu běží jednou na zařízení a zobrazení si ho jen přebírá. Při přesunu se sezení emulátoru nesmí odpojit.

## Inspektory běžící aplikace

Inspektory jsou panely nad vybraným zařízením a aplikací, dostupné z panelu emulátoru.

### Síť a MITM proxy

- **Záznam:** požadavky a odpovědi aplikace přes lokální MITM proxy (mitmproxy) nastavenou na emulátoru nebo zařízení. Debug build musí důvěřovat uživatelskému certifikátu (Android `network_security_config`, na iOS profil certifikátu).
- **Alternativa bez proxy:** debug knihovna v aplikaci (Chucker pro Android, Pulse pro iOS), ze které Orca čte.
- **Úpravy:** přerušení požadavku, úprava odpovědi, zpoždění, výpadek sítě.
- **AI:**
  - realistické mocky odpovědí z DTO backendové reference a zaznamenaného provozu;
  - scénáře (prázdná data, chyba 500, pomalá síť, neplatný token) jako pojmenované sady pravidel proxy;
  - testování: agent projde aplikaci se scénářem a zapíše, co se rozbilo.

### Databáze a úložiště

- **Android:** databáze SQLite (Room) a `shared_prefs` přes `adb shell run-as <balíček>` pro debug buildy; DataStore jen pro čtení, pokud jde rozparsovat.
- **iOS simulátor:** kontejner aplikace přes `xcrun simctl get_app_container`; SQLite, Core Data a `UserDefaults` plist.
- **iOS zařízení:** kopie z kontejneru přes `devicectl` pro vývojové buildy.
- **Úpravy:** změna hodnoty s restartem aplikace, export a import stavu (snímek dat pro opakované testy).
- **AI:** dotazy přirozeným jazykem, vysvětlení dat podle entit v kódu, generování realistických testovacích dat.

## Inspektor přístupnosti

- **Audit obrazovky:** chybějící popisky, malé dotykové plochy (pod 48 dp / 44 pt), nízký kontrast (z obrazu streamu), pořadí fokusu, prvky bez role, duplicitní popisky. Nález vede na prvek a zdroj.
- **Simulace čtečky obrazovky:** průchod stromem přístupnosti v pořadí čtečky, s vyznačenou cestou fokusu a předčítáním přes syntézu řeči („Tlačítko, bez popisku“). Volitelně ovládání skutečné TalkBack nebo VoiceOver na emulátoru, kde to platforma dovolí.
- **Další simulace:** velké písmo (Android `font_scale`, iOS Dynamic Type přes simctl), filtry barvosleposti a rozmazání nad streamem, tmavý režim.
- **AI:**
  - popis, jak obrazovku zažije nevidomý uživatel, a kde se ztratí;
  - návrhy popisků a oprav v kódu jako rychlé opravy nebo nálezy review;
  - audit změněných obrazovek jako součást review PR.
- **Realizace:** strom už fork čte (`uiautomator-tree.ts`, `serve-sim-accessibility-tree.ts`); syntéza řeči je společná s hlasovými oznámeními.

## Hlas

### Hlasové zadávání

- Diktování do chatu agenta, komentářů review, odpovědí na nálezy a vyhledávání. Navazuje na existující diktování (`main/speech`, `components/dictation`).
- Hlasové příkazy pro Orcu: „otevři PR od Petry“, „spusť review“, „publikuj vybrané nálezy“. Rozpoznaný příkaz se před provedením zobrazí; akce, které něco odesílají ven, vyžadují potvrzení.

### Hlasová oznámení

- Krátké předčítané zprávy o dokončených věcech a o tom, co vyžaduje pozornost: agent dokončil úlohu, agent čeká na odpověď, brány kvality selhaly, přišel nový PR k review, build na zařízení je hotový.
- **AI:** shrnutí do jedné věty („Agent ve feature/saved-cards dokončil práci, dvě brány neprošly“).
- **Pravidla:** výběr událostí a tichý režim v nastavení; oznámení jen když je uživatel u počítače nebo podle nastavení (`desktop-away-state.ts`); stav agentů výhradně z úložiště hook serveru (pravidlo Agent Status v AGENTS.md).
- **Realizace:** syntéza řeči operačního systému; texty oznámení z existující doručovací služby (`notification-delivery-service.ts`).
