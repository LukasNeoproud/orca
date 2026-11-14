# Prototyp review IDE

Klikací prototyp obrazovek popsaných v [`docs/review-ide/05-funkce.md`](../../docs/review-ide/05-funkce.md). Není součástí aplikace.

## Spuštění

Obrazovky se načítají přes `fetch`, proto je potřeba lokální HTTP server, `file://` nestačí:

```sh
cd examples/review-ide-prototype
python3 -m http.server 8765
```

Pak otevřít <http://localhost:8765/>.

## Obsah

- `*.dc.html`: jedna obrazovka na soubor. Šablona v `<x-dc>`, logika v `<script type="text/x-dc">` jako `class Component extends DCLogic` s `renderVals()` a `setState()`.
- `TopBar.dc.html`: sdílené menu, vkládané přes `<dc-import>`.
- `support.js`: malý runtime pro `{{ díry }}`, `<sc-for>`, `<sc-if>`, `<dc-import>` a stav komponent.

Prototyp vznikl na Claude Design canvasu; `support.js` nahrazuje jeho runtime, aby obrazovky šly otevřít samostatně.
