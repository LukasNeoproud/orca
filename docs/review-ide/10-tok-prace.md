# Tok práce: od tiketu po vydání

Zadání uživatele z 2026-11-24. Orca má ukázat, kde která práce vázne mezi tiketem, větví, pull requestem a vydaným buildem, a upozornit na kroky, na které se zapomíná.

## Co uživatel řeší

1. Tikety z Jiry chce vidět v Orce se stavem a s návazností na pull requesty. Stačí čtení.
2. Zapomene z větve založit pull request.
3. Reviewerovi trvá review dlouho a uživatel si toho nevšimne.
4. Reviewer review dokončí, ale uživatel zapomene opravy udělat.
5. Funkce je sloučená, ale dlouho s ní nevyšel build.

## Co už v Orce je

- **Jira:** klient, hledání a čtení tiketů, přechody a komentáře (`src/main/jira/`), stránka Tasks se zdrojem Jira (`src/renderer/src/components/task-page/`) a nastavení zdrojů úkolů. Workspace nese výslovně připojené položky (`linkedItems` s `provider: 'jira'`). Klíč tiketu ze jména větve se nečte.
- **Pull requesty Azure DevOps:** seznam se skupinami Čeká na mě, Moje a Ostatní, stránka pull requestu, vlákna a iterace v detailu. Seznam nenese reviewery, čas poslední změny, počet nevyřešených vláken ani navázané položky. Seznam se na pozadí obnovuje jen se zapnutým automatickým review.
- **Ostatní poskytovatelé:** `src/shared/hosted-review.ts` (`HostedReviewInfo` se stavem a `reviewDecision`), workspace zná `linkedPR` a `linkedGitLabMR`.
- **Oznámení:** `src/main/notifications/` s oznámením nového pull requestu a registrem už oznámeného; nastavení v `NotificationsPane.tsx`.
- **Buildy a vydání:** Orca o tagu ani o buildu neví nic.

## Jednotka práce a její fáze

Jednotka práce je jedna větev uživatele v jednom repozitáři a všechno, co k ní patří: workspace, tiket a pull request. Vzniká z větve s vlastními commity, která má v Orce workspace, nebo z pull requestu, který uživatel založil. Tiket bez větve a bez pull requestu jednotku nezakládá; ten ukazuje stránka Tasks.

Tiket se k jednotce přiřadí výslovným připojením k workspace, jinak klíčem tiketu ve jménu větve nebo v názvu pull requestu.

- **Klíč ve jménu** se bere jen velkými písmeny (`feature/APP-123-nazev`), aby se za tiket nepovažovalo třeba `utf-8`. Když Orca zná projekty z Jiry, bere jen jejich klíče a na velikosti písmen nezáleží.
- **Holé číslo** na začátku poslední části jména větve (`feature/123-nazev`) se čte jen tehdy, když je známý projekt, ke kterému patří.

| Fáze | Kdy | Vázne po (výchozí) |
| --- | --- | --- |
| Bez pull requestu | větev má vlastní commity proti základní větvi a žádný otevřený ani dokončený pull request | 1 pracovní den od posledního commitu |
| Čeká na review | pull request uživatele je otevřený, není koncept a žádný reviewer se k poslední verzi nevyjádřil | 2 pracovní dny od poslední verze |
| Čekají opravy | pull request uživatele má nevyřešená vlákna od jiných lidí nebo hlas „čeká na autora“ či zamítnutí a uživatel od té doby nic neposlal | 1 pracovní den od poslední připomínky |
| Schváleno | pull request je schválený a nesloučený | nevázne |
| Sloučeno, nevydáno | pull request je sloučený a jeho commit není v žádném ostrém tagu | 3 pracovní dny od sloučení |
| Vydáno | commit sloučení je v ostrém tagu | konec |

U sloučené práce Orca navíc ukáže, jestli je commit aspoň v dev buildu.

Pracovní den je pondělí až pátek; svátky se nepočítají. Lhůta N pracovních dní vyprší ve stejný čas dne o N pracovních dní později, takže páteční odpoledne plus jeden den je pondělní odpoledne. Začátek o víkendu se počítá od pondělní půlnoci. Lhůty jdou změnit v nastavení (1 až 60 dní).

### Zpřesnění fází

Pravidla určuje sdílený modul `src/shared/work-flow/`; architekturu skládání popisuje [decision-17](../../backlog/decisions/decision-17%20-%20Tok-práce-jednotky-skládá-hostitel-který-repozitář-vede-a-spojuje-je-aplikace-u-které-uživatel-sedí.md).

- **Koncept:** pull request ve stavu konceptu má fázi Koncept bez lhůty.
- **Čekají opravy má přednost před Schváleno:** schválený pull request s nevyřešenými vlákny od jiných lidí čeká na opravy.
- **Po nové verzi je na tahu reviewer:** když uživatel po připomínce pošle novou verzi, je pull request ve fázi Čeká na review, i když vlákna zůstala otevřená. Odpověď v diskusi bez nové verze fázi nemění.
- **Čeká na review** je každý otevřený pull request, který není koncept, není schválený a nečekají u něj opravy. Lhůta běží od poslední verze, nebo od pozdější připomínky, která je už vyřešená.
- **Zrušený pull request** vrací větev s vlastními commity do fáze Bez pull requestu.
- **Sloučeno** bez lhůty je konec práce v repozitáři, který má ostrý vzor tagu vypnutý.
- **Cizí pull request** a větev bez vlastních commitů jednotku práce nezakládají.
- **Neznámá fáze:** když zdroj fakt nedodal (poskytovatel neodpověděl, hostitel je bez spojení, tagy mohou být zastaralé, poskytovatel nedává rozhodnutí review nebo commit sloučení), je fáze neznámá s důvodem. Neznámá fáze nevázne a nevyvolá oznámení.
- **Nepřesná lhůta:** poskytovatel, který nedává čas poslední verze a poslední připomínky, dává jen čas poslední aktivity. Lhůta se pak počítá od ní a přehled ji označí jako nepřesnou.

## Vydání

Vydaný build pozná Orca podle tagů v repozitáři. Repozitář má v nastavení dva vzory: ostrý build a dev build. Výchozí vzory odpovídají značení, které uživatel používá u mobilních aplikací: tag začínající `v` je ostrý build, tentýž tvar s příponou `-dev` je dev build. Repozitář s jiným značením si vzory nastaví; repozitář bez vzoru fázi vydání neukazuje.

Ve vzoru je `*` libovolný úsek znaků a `?` jeden znak. Tag, kterému odpovídají oba vzory, je dev build. Repozitář, který má vzor, ale žádný odpovídající tag, má stav vydání neznámý, ne „nevydáno“.

Fakta o tagu zjišťuje hostitel, který repozitář vlastní. Práce je „v buildu“, když je commit sloučení pull requestu předkem tagu.

## Kde to uživatel uvidí

- **Přehled Moje práce:** jedna stránka se všemi jednotkami práce napříč repozitáři, váznoucí nahoře. Řádek ukazuje tiket a jeho stav v Jiře, větev, pull request, fázi, jak dlouho v ní je, a stav vydání. Z řádku jde otevřít tiket, pull request a workspace, u větve bez pull requestu rovnou založení pull requestu.
- **Odznak:** počet váznoucích jednotek u položky Moje práce v postranním panelu a značka fáze na kartě workspace.
- **Stránka Tasks:** tiket z Jiry ukazuje fázi práce a odkaz na pull request.
- **Oznámení na ploše:** jedno oznámení, když jednotka překročí lhůtu; pro stejnou jednotku a fázi se neopakuje. Jde vypnout po fázích.

## Mimo rozsah

- Zápis do Jiry nad rámec toho, co Orca umí dnes.
- Připomenutí reviewerovi (komentář nebo zpráva jeho jménem).
- Oznámení na telefon; přidá se, až rozhodne pokus TASK-131.
- Stav buildu z Azure Pipelines a z Firebase App Distribution; vydání se čte jen z tagů.
- Svátky a pracovní kalendář.
