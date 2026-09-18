import { Check, Code2, GitCompareArrows, ArrowUpRight, RotateCcw, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FileCard, type FileActions } from './FileCard'
import { files } from './fixtures'
import { RealConversation } from './RealConversation'
import { InlinePreviews } from './InlinePreviews'

type Props = {
  scenario: string
  updated: boolean
  format: string
  setFormat: (format: string) => void
  actions: FileActions
  messages: { id: number; text: string }[]
  setTab: (tab: 'chat' | 'review' | 'file') => void
}
export function Conversation({
  scenario,
  updated,
  format,
  setFormat,
  actions,
  messages,
  setTab
}: Props) {
  return (
    <div className="chat-scroll scrollbar-sleek" key={scenario}>
      <div className={`chat-content ${scenario === 'formats' ? 'gallery-content' : ''}`}>
        <div className="user-message">
          {scenario === 'daily'
            ? 'Uprav ukládání nastavení účtu a ukaž mi výsledek.'
            : scenario === 'formats'
              ? 'Ukaž podklady a výsledky v různých formátech.'
              : scenario === 'states'
                ? 'Otevři podklady z předchozí kontroly.'
                : scenario === 'tools'
                  ? 'Oprav stav při ukládání a přegeneruj screenshoty.'
                  : 'Podívejme se na změny a připravme připomínky.'}
        </div>
        <div className="assistant-identity">
          <span className="agent-symbol">✳</span>
          <strong>Codex</strong>
          <span>09:14</span>
        </div>
        {scenario === 'daily' ? <RealConversation actions={actions} updated={updated} /> : null}
        {scenario === 'formats' ? (
          <>
            <p className="prose-lead">Stejná nabídka odkazu, náhled podle obsahu.</p>
            <div className="format-filter" aria-label="Filtr formátů">
              {[
                ['all', 'Vše'],
                ['documents', 'Dokumenty'],
                ['data', 'Data a výsledky'],
                ['visual', 'Vizuální a web']
              ].map(([id, label]) => (
                <Button
                  key={id}
                  size="xs"
                  variant={format === id ? 'secondary' : 'ghost'}
                  onClick={() => setFormat(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="format-grid">
              {files
                .slice(0, 13)
                .filter(
                  (f) =>
                    format === 'all' ||
                    (format === 'documents'
                      ? ['code', 'markdown', 'pdf', 'binary']
                      : format === 'data'
                        ? ['json', 'yaml', 'csv', 'report', 'chart']
                        : ['image', 'diagram', 'html', 'web']
                    ).includes(f.kind)
                )
                .map((file) => (
                  <FileCard key={file.id} file={file} actions={actions} updated={updated} />
                ))}
            </div>
          </>
        ) : null}
        {scenario === 'states' ? (
          <>
            <p className="prose-lead">
              Odkazy ukazují aktuální soubory. Dostupnost i změna obsahu zůstávají viditelné.
            </p>
            <div className="state-note">
              <RotateCcw size={14} />
              Tato zpráva vznikla v 09:14. Náhledy se načítají ze současného workspace.
            </div>
            <InlinePreviews
              actions={actions}
              updated={updated}
              text={
                'Původní implementaci najdeš v `src/components/AccountSettings.tsx:42`, výsledek na screenshots/account-settings.png. Po změně souborů ukazují i tyto staré odkazy nový obsah.\n\nStarý soubor screenshots/old-layout.png už neexistuje. Náhled z SSH hostu `/srv/orca/screenshots/remote-screen.png` nyní nelze načíst.\n\nVelký log `/workspace/reports/diagnostics.log` načteme až na vyžádání. Opakovaný odkaz na `src/components/AccountSettings.tsx:42` zůstává součástí věty.'
              }
            />
          </>
        ) : null}
        {scenario === 'tools' ? (
          <>
            <p className="prose-lead">
              Stav ukládání jsem upravil přímo. Screenshoty vznikly následným skriptem.
            </p>
            <details className="tool-block" open>
              <summary>
                <Code2 size={15} />
                Edit · AccountSettings.tsx <span>Dokončeno</span>
              </summary>
              <div className="inline-diff">
                <div className="removed">− await updatePreferences(preferences)</div>
                <div className="added">+ try {'{'}</div>
                <div className="added">+ await updatePreferences(preferences)</div>
                <div className="added">
                  + {'}'} finally {'{'}
                </div>
                <div className="added">+ setSaving(false)</div>
                <div className="added">+ {'}'}</div>
              </div>
            </details>
            <details className="tool-block" open>
              <summary>
                <Terminal size={15} />
                Spustit skript <span>exit 0</span>
              </summary>
              <pre>pnpm screenshots:update{'\n\n'}Generated 2 screenshots.</pre>
            </details>
            <InlinePreviews
              text="Výsledek najdete na screenshots/account-settings.png; upravený soubor je src/components/AccountSettings.tsx."
              actions={actions}
              updated
            />
            <div className="review-callout">
              <GitCompareArrows size={18} />
              <span>Kompletní změny souborů</span>
              <Button variant="outline" size="sm" onClick={() => setTab('review')}>
                Source Control <ArrowUpRight />
              </Button>
            </div>
          </>
        ) : null}
        {scenario === 'review' ? (
          <p className="chat-paragraph">
            Připomínky z Source Control se objeví v rozepsané zprávě níže.
          </p>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className="user-message sent-message">
            {message.text}
          </div>
        ))}
        <div className="assistant-end">
          <Check size={13} />
          Ukázka dokončené odpovědi
        </div>
      </div>
    </div>
  )
}
