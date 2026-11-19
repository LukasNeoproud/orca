---
id: TASK-117
title: 'Stabilizovat e2e sledování vláken: měřit polohu řádku až po ustálení diffu'
status: Done
assignee: []
created_date: '2026-11-19T04:10:00Z'
updated_date: '2026-11-19T04:18:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
priority: medium
type: bug
ordinal: 200500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Spec z TASK-76 padá zhruba v polovině běhů chybou „The element is not laid out“: měří řádek Monaca krátce po přepnutí záložky, dřív než se diff rozloží. Nestabilní test znehodnocuje e2e při přebírání dalších tiketů.

### Rozsah

- `tests/e2e/pull-request-thread-tracking.spec.ts`; případně pomocná funkce pro čekání na rozložený diff, kterou použijí i další specy pull requestu.
- Zjisti, jestli jde jen o test, nebo o skutečnou vadu rozhraní (karta se chvíli kreslí na špatném místě); skutečnou vadu popiš a oprav jen pokud je to malá změna v adresáři funkce.

### Omezení

- Jen skryté okno: `ORCA_BACKGROUND_LAUNCH=1 ORCA_SKIP_DEV_CLI_SYMLINK=1`, projekt `electron-headless`, jeden worker, izolovaný HOME.
- Nezvyšuj časové limity jako jedinou opravu a nepřidávej opakování testu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tests/e2e/pull-request-thread-tracking.spec.ts projde dvacetkrát po sobě ve skrytém okně s jedním workerem
- [x] #2 Test čeká na pozorovatelný stav rozhraní, ne na pevnou prodlevu, a dál ověřuje, že karta vlákna stojí mezi svým řádkem a následujícím
- [x] #3 Ostatní specy tests/e2e/pull-request-*.spec.ts dál procházejí
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker, 2026-11-19): 1) sestavit e2e build v tomto checkoutu a zopakovat selhání opakovaným během specu (--repeat-each) ve skrytém okně; 2) zjistit, co se v okamžiku měření děje (diff ještě není spočítaný/rozložený, sdílený prohlížeč posouvá na první změnu z use-azure-devops-review-diff-reveal / auto-scroll) a jestli karta vlákna stojí chvíli na špatném místě; 3) opravit test čekáním na pozorovatelný stav (rozložený řádek a karta) bez pevné prodlevy, případně malou opravou v adresáři funkce; 4) dvacet průchodů po sobě a ostatní pull-request-*.spec.ts.

Hotovo (worker, 2026-11-19): Zopakováno nad stromem bez změn (sestavení e2e z HEAD 47b4ed8177): --repeat-each=12 → 3 selhání z 12, vždy řádek 187 top(card(MOVED)), tedy karta bez boxu. Diagnostika snímkováním každého snímku po kliknutí na Files (10 běhů): karta je v DOM 115–136 ms po kliknutí, ale její view zone má display:none, dokud editor nedoroste na výšku obsahu (výška sekce se dopočítá po spočítání diffu); box dostane po 136–164 ms. Test měřil v 157–175 ms. V žádném snímku nestála viditelná karta mimo svůj řádek; nejde o vadu rozhraní, Monaco jen nekreslí zónu mimo svůj viewport. Posun z use-azure-devops-review-diff-reveal ani posun na první změnu tu nehraje roli (první změna je řádek 1, reveal se nežádá). Oprava jen v testu: čeká na viditelnou kartu v sekci cart.ts (toBeVisible) a polohu karty, jejího řádku a následujícího řádku čte jedním evaluate z jednoho rozložení. Po opravě 20 z 20 po sobě, ostatní pull-request-*.spec.ts 8 z 8.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Spec sledování vláken z TASK-76 padal asi ve čtvrtině běhů (3 z 12) chybou The element is not laid out. Příčina: karta komentáře je v DOM i s textem o 25–45 ms dřív, než ji Monaco zobrazí; view zone zůstává skrytá, dokud editor sekce nedoroste na výšku obsahu, a test měřil přesně na hraně tohoto okna. Snímkování každého snímku v deseti bězích neukázalo žádný okamžik, kdy by viditelná karta stála na špatném místě, takže rozhraní se nemění. Test teď čeká na viditelnou kartu a polohu karty, jejího řádku a následujícího řádku čte najednou z jednoho rozložení; dál ověřuje, že karta stojí mezi řádkem 8 a následujícím. Ve skrytém okně s jedním workerem prošel dvacetkrát po sobě a ostatní specy pull requestů procházejí.
<!-- SECTION:FINAL_SUMMARY:END -->
