import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { InlinePreviews } from './InlinePreviews'
import type { FileActions } from './FileCard'

const response = `Upravil jsem ukládání v \`src/components/AccountSettings.tsx:42\`. Tlačítko se teď odblokuje i při chybě a zůstává pod formulářem.

Výsledek je na screenshots/account-settings.png. Zkontroluj prosím odstup tlačítka od posledního pole; logiku samotného ukládání najdeš ve stejném souboru (src/components/AccountSettings.tsx:48).

- Chování a otevřené otázky jsem popsal v [poznámkách k nastavení](docs/account-settings.md).
- Průběh ukládání zachycuje \`docs/save-flow.mmd\`, naměřené hodnoty jsou v reports/measurements.csv.
- Kontrola přístupnosti vychází z https://www.w3.org/WAI/.

Pro porovnání je k dispozici také absolutní cesta: \`/workspace/studio-app/screenshots/account-settings.png\`. Oba odkazy na obrázek ukazují stejný aktuální obsah.

Screenshoty jsem vygeneroval tímto příkazem:

\`\`\`sh
pnpm screenshots:update --output screenshots/account-settings.png
\`\`\`

Testy prošly kromě jednoho scénáře ukládání; podrobnosti jsou v [reportu testů](reports/test-results.json). Starý náhled screenshots/old-layout.png už není dostupný.`

export function RealConversation({ actions, updated }: { actions: FileActions; updated: boolean }) {
  const [text, setText] = useState(response)
  const [placement, setPlacement] = useState<'hover' | 'paragraph' | 'end'>('paragraph')
  const [editing, setEditing] = useState(false)
  return (
    <>
      <div className="placement-selector">
        <span>Umístění náhledů</span>
        <div>
          {(
            [
              ['hover', 'U odkazu'],
              ['paragraph', 'Za odstavcem'],
              ['end', 'Na konci odpovědi']
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="xs"
              variant={placement === value ? 'secondary' : 'ghost'}
              aria-pressed={placement === value}
              onClick={() => setPlacement(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <InlinePreviews text={text} actions={actions} updated={updated} placement={placement} />
      <div className="recognition-lab">
        <div>
          <span>UKÁZKA ROZPOZNÁVÁNÍ</span>
          <Button size="xs" variant="ghost" onClick={() => setEditing((value) => !value)}>
            {editing ? 'Skrýt zdroj odpovědi' : 'Upravit text odpovědi'}
          </Button>
        </div>
        <p>
          Najeď na cestu nebo ji zaměř klávesnicí. Kliknutí otevře nabídku akcí. Cesty v bloku
          skriptu zůstávají kódem.
        </p>
        {editing ? (
          <>
            <label htmlFor="response-source">
              Markdown odpovědi · změny se projeví přímo nad editorem
            </label>
            <textarea
              id="response-source"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
            />
            <Button size="xs" variant="outline" onClick={() => setText(response)}>
              Obnovit ukázkový text
            </Button>
            <p>
              Rozpoznávání používá parser Orcy. Náhledy mají ukázkový obsah; skutečné soubory ani
              weby se nenačítají.
            </p>
          </>
        ) : null}
      </div>
    </>
  )
}
