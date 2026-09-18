import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowUp,
  Check,
  ChevronRight,
  Code2,
  GitBranch,
  GitCompareArrows,
  MessageSquare,
  Moon,
  Sun,
  PanelLeft,
  Paperclip,
  RotateCcw,
  X,
  FlaskConical,
  Folder,
  ArrowUpRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { FileActions } from './FileCard'
import { Conversation } from './Conversation'
import { PreviewContent } from './PreviewContent'
import { Review, type ReviewComment } from './Review'
import { scenarios, type PreviewFile } from './fixtures'
import './prototype.css'

function App() {
  const [scenario, setScenario] = useState('daily')
  const [tab, setTab] = useState<'chat' | 'review' | 'file'>('chat')
  const [dark, setDark] = useState(true)
  const [sidebar, setSidebar] = useState(true)
  const [updated, setUpdated] = useState(false)
  const [selected, setSelected] = useState<PreviewFile | null>(null)
  const [reviewKind, setReviewKind] = useState<'image' | 'code'>('image')
  const [format, setFormat] = useState('all')
  const [draft, setDraft] = useState('')
  const [attached, setAttached] = useState<string[]>([])
  const [feedback, setFeedback] = useState<ReviewComment[]>([])
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([])
  const [toast, setToast] = useState('')
  const [guide, setGuide] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const activeScenario = scenarios.find((s) => s.id === scenario)!
  const actions: FileActions = {
    open(file) {
      setSelected(file)
      setTab('file')
    },
    review(file) {
      setReviewKind(file.kind === 'image' ? 'image' : 'code')
      setResetKey((k) => k + 1)
      setTab('review')
    },
    attach(file) {
      setAttached((a) => (a.includes(file.path) ? a : [...a, file.path]))
      setToast('Odkaz připojen k rozepsané zprávě')
    },
    notify: setToast
  }
  function choose(id: string) {
    setScenario(id)
    setTab(id === 'review' ? 'review' : 'chat')
    setToast('')
  }
  function theme() {
    document.documentElement.classList.toggle('dark', !dark)
    setDark(!dark)
  }
  function reset() {
    setUpdated(false)
    setSelected(null)
    setDraft('')
    setAttached([])
    setFeedback([])
    setMessages([])
    setFormat('all')
    setResetKey((k) => k + 1)
    setToast('Ukázkové interakce obnoveny')
  }
  function send() {
    if (!draft.trim() && !attached.length && !feedback.length) {
      return
    }
    setMessages((m) => [
      ...m,
      {
        id: Date.now(),
        text: [
          draft,
          ...attached.map((a) => `Připojeno: ${a}`),
          ...feedback.map((c) => `${c.file} · ${c.anchor}\n${c.text}`)
        ]
          .filter(Boolean)
          .join('\n')
      }
    ])
    setDraft('')
    setAttached([])
    setFeedback([])
    setToast('Zpráva přidána do prototypu. Žádný agent nebyl spuštěn.')
  }
  const iconButton = (label: string, fn: () => void, icon: React.ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={label} onClick={fn}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
  return (
    <TooltipProvider>
      <div className="prototype-shell">
        <header className="prototype-bar">
          <div>
            <FlaskConical size={15} />
            <strong>Design lab</strong>
            <span className="divider" />
            <span>Rich previews</span>
            <span className="version-label">PROTOTYP 02</span>
          </div>
          <div>
            <span className="mock-label">Ukázková data</span>
            <Button variant="ghost" size="xs" onClick={() => setGuide(true)}>
              Co vyzkoušet
            </Button>
            {iconButton('Obnovit ukázky', reset, <RotateCcw />)}
            {iconButton(dark ? 'Světlý vzhled' : 'Tmavý vzhled', theme, dark ? <Sun /> : <Moon />)}
          </div>
        </header>
        <div className="workspace-shell">
          {sidebar ? (
            <aside className="workspace-sidebar">
              <div className="brand">
                <span className="orca-mark">o</span>
                <strong>Orca</strong>
                <span>workspace</span>
              </div>
              <div className="workspace-name">
                <Folder size={16} />
                <div>
                  <strong>studio-app</strong>
                  <small>Lokální workspace</small>
                </div>
                <GitBranch size={14} />
              </div>
              <div className="sidebar-caption">SCÉNÁŘE PROTOTYPU</div>
              <nav aria-label="Scénáře">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    className={`scenario ${scenario === s.id ? 'active' : ''}`}
                    aria-current={scenario === s.id ? 'page' : undefined}
                    onClick={() => choose(s.id)}
                  >
                    <span className="scenario-number">{s.count}</span>
                    <span>
                      <strong>{s.title}</strong>
                      <small>{s.description}</small>
                    </span>
                    {scenario === s.id ? <ChevronRight size={14} /> : null}
                  </button>
                ))}
              </nav>
              <div className="sidebar-bottom">
                <div className="mini-branch">
                  <GitBranch size={14} />
                  feature/account-settings
                </div>
                <p>
                  Náhledy v chatu.
                  <br />
                  Kontrola změn v Source Control.
                </p>
                <Button size="xs" variant="outline" onClick={() => setGuide(true)}>
                  Průvodce prototypem <ArrowUpRight />
                </Button>
              </div>
            </aside>
          ) : null}
          <main className="workspace-main">
            <div className="workspace-topline">
              {iconButton('Přepnout postranní panel', () => setSidebar((s) => !s), <PanelLeft />)}
              <span>studio-app</span>
              <ChevronRight size={13} />
              <span>Nastavení účtu</span>
              <span className="topline-tail">
                <span className="status-dot" />
                Lokální
              </span>
            </div>
            <div className="workspace-tabs" role="tablist" aria-label="Pracovní plocha">
              <button
                role="tab"
                aria-selected={tab === 'chat'}
                className={tab === 'chat' ? 'active' : ''}
                onClick={() => setTab('chat')}
              >
                <MessageSquare size={15} />
                Codex chat
              </button>
              <button
                role="tab"
                aria-selected={tab === 'review'}
                className={tab === 'review' ? 'active' : ''}
                onClick={() => setTab('review')}
              >
                <GitCompareArrows size={15} />
                Source Control <span className="count">2</span>
              </button>
              {selected ? (
                <button
                  role="tab"
                  aria-selected={tab === 'file'}
                  className={tab === 'file' ? 'active' : ''}
                  onClick={() => setTab('file')}
                >
                  <Code2 size={15} />
                  {selected.name}
                </button>
              ) : null}
            </div>
            {tab === 'review' ? (
              <Review
                key={resetKey}
                initialKind={reviewKind}
                onSend={(items) => {
                  setFeedback((f) => [...f, ...items])
                  setTab('chat')
                  setToast(
                    items.length === 1
                      ? 'Připomínka připravena v promptu'
                      : `Připraveno připomínek: ${items.length}`
                  )
                }}
              />
            ) : tab === 'file' && selected ? (
              <div className="file-tab scrollbar-editor">
                <div className="section-heading">
                  <div>
                    <h2>{selected.name}</h2>
                    <p className="mono muted">{selected.path}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setTab('chat')}>
                    Zpět do chatu
                  </Button>
                </div>
                <div className="opened-preview">
                  <PreviewContent key={selected.id} file={selected} expanded updated={updated} />
                </div>
                <p className="muted file-detail-note">
                  {selected.kind === 'web'
                    ? 'Ukázka náhledu odkazu; prototyp nenačítá externí web.'
                    : 'Aktuální obsah · ukázkový soubor'}
                </p>
              </div>
            ) : (
              <>
                <div className="chat-heading">
                  <div>
                    <h1>
                      {scenario === 'daily' ? 'Doladění nastavení účtu' : activeScenario.title}
                    </h1>
                    <p>
                      {scenario === 'daily'
                        ? 'Codex · feature/account-settings'
                        : activeScenario.description}
                    </p>
                  </div>
                  {scenario === 'states' ? (
                    <Button size="sm" variant="outline" onClick={() => setUpdated((u) => !u)}>
                      <RotateCcw />
                      {updated ? 'Vrátit ukázkovou změnu' : 'Simulovat změnu souborů'}
                    </Button>
                  ) : (
                    <span className="quiet-badge">{activeScenario.count} / 05</span>
                  )}
                </div>
                <Conversation
                  scenario={scenario}
                  updated={updated}
                  format={format}
                  setFormat={setFormat}
                  actions={actions}
                  messages={messages}
                  setTab={setTab}
                />
                <div className="composer-area">
                  <div className="composer">
                    {attached.length || feedback.length ? (
                      <div className="attachments">
                        {attached.map((path) => (
                          <span className="attachment-chip" key={path}>
                            <Paperclip size={12} />
                            {path.split('/').pop()}
                            <button
                              aria-label={`Odebrat ${path}`}
                              onClick={() => setAttached((a) => a.filter((p) => p !== path))}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        {feedback.map((c, i) => (
                          <details className="feedback-chip" key={c.id}>
                            <summary>
                              Připomínka {i + 1} · {c.file.split('/').pop()}
                            </summary>
                            <p>{c.anchor}</p>
                            <p>{c.text}</p>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() =>
                                setFeedback((f) => f.filter((_, index) => index !== i))
                              }
                            >
                              Odebrat
                            </Button>
                          </details>
                        ))}
                      </div>
                    ) : null}
                    <textarea
                      aria-label="Zpráva pro Codex"
                      placeholder="Navázat na výsledek…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="composer-bottom">
                      <span>
                        Codex <ChevronRight size={12} /> Lokální workspace
                      </span>
                      <Button
                        size="icon-sm"
                        aria-label="Odeslat ukázkovou zprávu"
                        disabled={!draft.trim() && !attached.length && !feedback.length}
                        onClick={send}
                      >
                        <ArrowUp />
                      </Button>
                    </div>
                  </div>
                  <small>
                    Odkazy zobrazují aktuální obsah. Připomínky ke změnám patří do Source Control.
                  </small>
                </div>
              </>
            )}
            <footer className="statusbar">
              <span>
                <GitBranch size={12} />
                feature/account-settings
              </span>
              <span>Codex chat · prototyp interakcí</span>
            </footer>
          </main>
        </div>
        {toast ? (
          <div className="prototype-toast" role="status">
            <Check size={15} />
            {toast}
            <button aria-label="Zavřít oznámení" onClick={() => setToast('')}>
              <X size={14} />
            </button>
          </div>
        ) : null}
        <Dialog open={guide} onOpenChange={setGuide}>
          <DialogContent>
            <DialogTitle>Co vyzkoušet</DialogTitle>
            <DialogDescription>
              Prototyp používá ukázkové soubory. Nemění workspace ani nespouští agenta.
            </DialogDescription>
            <ol className="guide-list">
              <li>
                Najeďte na cestu přímo ve větě nebo ji zaměřte klávesnicí. Kliknutí otevře nabídku
                akcí odkazu.
              </li>
              <li>V galerii přepínejte zdroj, strom a tabulku. HTML se spustí až na vyžádání.</li>
              <li>Ve scénáři Život odkazu simulujte změnu: staré odkazy ukážou nový obsah.</li>
              <li>
                V Source Control označte oblast nové verze nebo řádek kódu, napište připomínku a
                přidejte ji do promptu.
              </li>
              <li>Přepněte světlý vzhled a zkuste užší okno.</li>
            </ol>
            <Button onClick={() => setGuide(false)}>Vyzkoušet</Button>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
