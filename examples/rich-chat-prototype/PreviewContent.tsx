import { useState } from 'react'
import { ArrowRight, Check, File, Globe, Unplug, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { code, diagram, html, type PreviewFile } from './fixtures'

export function AccountScreen({ before = false }: { before?: boolean }) {
  return (
    <svg
      className="account-screen"
      viewBox="0 0 720 450"
      role="img"
      aria-label={
        before
          ? 'Nastavení účtu před změnou: tlačítko uložit nahoře'
          : 'Nastavení účtu po změně: tlačítko uložit pod formulářem'
      }
    >
      <rect width="720" height="450" fill="var(--background)" />
      <rect width="164" height="450" fill="var(--muted)" />
      <g fill="var(--foreground)" fontFamily="Geist, sans-serif">
        <text x="24" y="40" fontSize="18" fontWeight="650">
          studio.
        </text>
        <text x="24" y="102" fontSize="12">
          Pracovní prostor
        </text>
        <text x="24" y="142" fontSize="12">
          Projekty
        </text>
        <text x="24" y="182" fontSize="12">
          Členové týmu
        </text>
        <rect
          x="14"
          y="210"
          width="136"
          height="34"
          rx="6"
          fill="var(--accent)"
          stroke="var(--border)"
        />
        <text x="24" y="232" fontSize="12" fontWeight="600">
          Nastavení
        </text>
        <text x="202" y="42" fontSize="11" fill="var(--muted-foreground)">
          PRACOVNÍ PROSTOR / NASTAVENÍ
        </text>
        <text x="202" y="93" fontSize="24" fontWeight="600">
          Nastavení účtu
        </text>
        <text x="202" y="120" fontSize="12" fill="var(--muted-foreground)">
          Spravujte svůj profil a předvolby oznámení.
        </text>
        <text x="202" y="170" fontSize="12">
          Zobrazované jméno
        </text>
        <rect
          x="202"
          y="184"
          width="460"
          height="38"
          rx="6"
          fill="var(--background)"
          stroke="var(--border)"
        />
        <text x="216" y="208" fontSize="12">
          Alex Novák
        </text>
        <text x="202" y="255" fontSize="12">
          E-mail
        </text>
        <rect
          x="202"
          y="270"
          width="460"
          height="38"
          rx="6"
          fill="var(--background)"
          stroke="var(--border)"
        />
        <text x="216" y="294" fontSize="12">
          alex@example.com
        </text>
        <text x="202" y="340" fontSize="12" fill="var(--muted-foreground)">
          O důležitých změnách vám dáme vědět.
        </text>
        <rect
          x={before ? 558 : 202}
          y={before ? 61 : 368}
          width="104"
          height="34"
          rx="6"
          fill="var(--primary)"
        />
        <text
          x={before ? 572 : 216}
          y={before ? 83 : 390}
          fontSize="12"
          fill="var(--primary-foreground)"
        >
          Uložit změny
        </text>
      </g>
    </svg>
  )
}

export function CodePreview({ changed = false }: { changed?: boolean }) {
  return (
    <pre className="code-preview">
      {code
        .split('\n')
        .slice(0, 10)
        .map((line, i) => (
          <div key={i}>
            <span className="line-number">{i + 42}</span>
            <code>{changed && i === 6 ? '      announce("Nastavení uloženo")' : line}</code>
          </div>
        ))}
    </pre>
  )
}

export function PreviewContent({
  file,
  expanded = false,
  updated = false
}: {
  file: PreviewFile
  expanded?: boolean
  updated?: boolean
}) {
  const [source, setSource] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [retry, setRetry] = useState(false)
  if (file.status === 'missing' || file.status === 'offline') {
    return (
      <div className="unavailable">
        {file.status === 'offline' ? <Unplug /> : <AlertCircle />}
        <strong>{file.status === 'offline' ? 'Host není dostupný' : 'Soubor nebyl nalezen'}</strong>
        <span>
          {file.status === 'offline'
            ? 'Náhled bude dostupný po obnovení spojení.'
            : 'Odkaz zůstává v historii. Obsah již není dostupný.'}
        </span>
        {file.status === 'offline' ? (
          <Button variant="outline" size="xs" onClick={() => setRetry(true)}>
            Zkusit znovu
          </Button>
        ) : null}
        {retry ? <small role="status">Ukázkový SSH host je stále odpojený.</small> : null}
      </div>
    )
  }
  if (file.status === 'large' && !loaded) {
    return (
      <div className="unavailable">
        <File />
        <strong>Náhled velkého souboru</strong>
        <span>42 MB · načte se pouze prvních 20 řádků.</span>
        <Button size="xs" variant="outline" onClick={() => setLoaded(true)}>
          Načíst začátek
        </Button>
      </div>
    )
  }
  if (file.status === 'large') {
    return (
      <pre className="raw">
        {Array.from(
          { length: 20 },
          (_, i) => `09:14:${String(i).padStart(2, '0')} INFO preview.ready file=${i + 1}`
        ).join('\n')}
      </pre>
    )
  }
  const switcher = (a: string, b: string) => (
    <div className="preview-switch">
      <Button variant={!source ? 'secondary' : 'ghost'} size="xs" onClick={() => setSource(false)}>
        {a}
      </Button>
      <Button variant={source ? 'secondary' : 'ghost'} size="xs" onClick={() => setSource(true)}>
        {b}
      </Button>
    </div>
  )
  switch (file.kind) {
    case 'image':
      return (
        <div className="screenshot-preview">
          <AccountScreen before={file.id === 'state-screen' && !updated} />
        </div>
      )
    case 'code':
      return <CodePreview changed={updated || file.status === 'changed'} />
    case 'markdown':
      return (
        <div>
          {switcher('Náhled', 'Zdroj')}
          {source ? (
            <pre className="raw">
              # Nastavení účtu{'\n\n'}Změny se ukládají explicitně.{'\n\n'}- [x] Stav při ukládání
              {'\n'}- [ ] Vizuální kontrola
            </pre>
          ) : (
            <div className="document-preview">
              <h3>Nastavení účtu</h3>
              <p>Změny se ukládají explicitně. Během ukládání zůstává formulář stabilní.</p>
              <p className="checkline">
                <Check size={14} /> Stav při ukládání
              </p>
              <p className="muted">□ Vizuální kontrola</p>
            </div>
          )}
        </div>
      )
    case 'diagram':
      return (
        <div>
          {switcher('Diagram', 'Zdroj')}
          {source ? (
            <pre className="raw">{diagram}</pre>
          ) : (
            <div className="diagram-preview">
              <span>Změna nastavení</span>
              <ArrowRight size={16} />
              <span>Uložit</span>
              <ArrowRight size={16} />
              <span>Výsledek</span>
              <div className="diagram-outcomes">
                <span>Uloženo</span>
                <span>Zkusit znovu</span>
              </div>
            </div>
          )}
        </div>
      )
    case 'json':
    case 'yaml':
      return (
        <div>
          {switcher('Strom', 'Text')}
          {source ? (
            <pre className="raw">
              {file.kind === 'json'
                ? '{\n  "theme": "system",\n  "notifications": true,\n  "locale": "cs-CZ"\n}'
                : 'preview:\n  enabled: true\n  theme: system\n  locale: cs-CZ'}
            </pre>
          ) : (
            <div className="data-tree">
              <details open>
                <summary>{file.kind === 'json' ? 'preferences {3}' : 'preview {3}'}</summary>
                <p>
                  theme <span>&quot;system&quot;</span>
                </p>
                <p>
                  {file.kind === 'yaml' ? 'enabled' : 'notifications'} <span>true</span>
                </p>
                <p>
                  locale <span>&quot;cs-CZ&quot;</span>
                </p>
              </details>
            </div>
          )}
        </div>
      )
    case 'csv':
      return (
        <div>
          {switcher('Tabulka', 'Text')}
          {source ? (
            <pre className="raw">
              screen,before_ms,after_ms{'\n'}Account,142,86{'\n'}Profile,118,79{'\n'}
              Security,154,102
            </pre>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Obrazovka</th>
                  <th>Před (ms)</th>
                  <th>Po (ms)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Account', 142, 86],
                  ['Profile', 118, 79],
                  ['Security', 154, 102]
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell) => (
                      <td key={`${row[0]}-${String(cell)}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )
    case 'pdf':
      return (
        <div className="pdf-preview">
          <div className="pdf-paper">
            <small>STUDIO / PRODUCT</small>
            <h3>Nastavení účtu</h3>
            <p>Specifikace interakcí</p>
            <hr />
            <strong>01 — Cíl změny</strong>
            <p>Uživatel má jasnou kontrolu nad uložením svých předvoleb.</p>
            {expanded ? (
              <p>
                Ovládací prvky zůstávají dostupné klávesnicí. Stav ukládání nemění jejich rozměry.
              </p>
            ) : null}
            <small>Ukázka stránky · 1 / 6</small>
          </div>
        </div>
      )
    case 'report':
      return (
        <div className="report-preview">
          <div>
            <strong>18 / 19</strong>
            <span>testů prošlo · ukázkový běh</span>
          </div>
          <details>
            <summary>1 selhání · save-button.spec.ts</summary>
            <pre>
              Expected: button enabled{'\n'}Received: button disabled{'\n'}at save-button.spec.ts:42
            </pre>
          </details>
        </div>
      )
    case 'chart':
      return (
        <div className="chart-preview">
          <strong>Doba vykreslení</strong>
          {[
            ['Account', 86],
            ['Profile', 79],
            ['Security', 102]
          ].map(([label, value]) => (
            <div className="chart-row" key={label}>
              <span>{label}</span>
              <i style={{ width: `${Number(value) / 1.6}%` }} />
              <small>{value} ms</small>
            </div>
          ))}
          <small className="muted">Ukázková měření · nižší je lepší</small>
        </div>
      )
    case 'html':
      return loaded ? (
        <iframe
          title="Izolovaný HTML prototyp"
          sandbox="allow-scripts"
          srcDoc={html}
          className="html-preview"
        />
      ) : (
        <div className="unavailable">
          <Globe />
          <strong>Interaktivní HTML</strong>
          <span>Obsah se spustí až po otevření náhledu.</span>
          <Button size="xs" variant="outline" onClick={() => setLoaded(true)}>
            Spustit ukázkový náhled
          </Button>
        </div>
      )
    case 'web':
      return (
        <div className="web-preview">
          <Globe size={24} />
          <div>
            <strong>Web Accessibility Initiative</strong>
            <p>Pravidla a zdroje pro přístupný web.</p>
            <small>w3.org · metadata již dostupná v konverzaci</small>
            {loaded ? (
              <p className="web-result">
                Ukázka rozšířené karty: návody, standardy a přístupné vzory ovládání.
              </p>
            ) : (
              <Button size="xs" variant="ghost" onClick={() => setLoaded(true)}>
                Zobrazit ukázku rozšířeného náhledu
              </Button>
            )}
          </div>
        </div>
      )
    case 'binary':
      return (
        <div className="unavailable">
          <File />
          <strong>Pro tento formát není náhled</strong>
          <span>Soubor můžete otevřít přes nabídku odkazu.</span>
        </div>
      )
    default:
      return null
  }
}
