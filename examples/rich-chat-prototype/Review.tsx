import { useRef, useState, type PointerEvent } from 'react'
import { MessageSquarePlus, Link2, Check, Image, Code2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AccountScreen } from './PreviewContent'

type Selection = { x: number; y: number; w: number; h: number }
export type ReviewComment = { id: string; file: string; anchor: string; text: string }
export function Review({
  initialKind,
  onSend
}: {
  initialKind: 'image' | 'code'
  onSend: (comments: ReviewComment[]) => void
}) {
  const [kind, setKind] = useState(initialKind)
  const [zoom, setZoom] = useState(100)
  const [stacked, setStacked] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState<ReviewComment[]>([])
  const [line, setLine] = useState<number | null>(null)
  const commentId = useRef(0)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const firstScroll = useRef<HTMLDivElement>(null)
  const secondScroll = useRef<HTMLDivElement>(null)
  const filename =
    kind === 'image' ? 'screenshots/account-settings.png' : 'src/components/AccountSettings.tsx'
  function point(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
    }
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = point(event)
    setSelection(null)
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) {
      return
    }
    const p = point(event),
      s = dragStart.current
    setSelection({
      x: Math.min(p.x, s.x),
      y: Math.min(p.y, s.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y)
    })
  }
  function end() {
    dragStart.current = null
    setSelection((s) => (s && s.w > 1 && s.h > 1 ? s : null))
  }
  const anchor =
    kind === 'image' && selection
      ? `Nová verze · oblast ${Math.round(selection.x)} %, ${Math.round(selection.y)} % (${Math.round(selection.w)} × ${Math.round(selection.h)} %)`
      : line
        ? `Nová verze · řádek ${line}`
        : ''
  function saveComment() {
    if (!comment.trim() || !anchor) {
      return
    }
    commentId.current += 1
    setComments((c) => [
      ...c,
      {
        id: `${filename}:${anchor}:${commentId.current}`,
        file: filename,
        anchor,
        text: comment.trim()
      }
    ])
    setComment('')
    setSelection(null)
    setLine(null)
  }
  const sync = (from: HTMLDivElement, to: HTMLDivElement | null) => {
    if (to && (to.scrollLeft !== from.scrollLeft || to.scrollTop !== from.scrollTop)) {
      to.scrollLeft = from.scrollLeft
      to.scrollTop = from.scrollTop
    }
  }
  return (
    <div className="review-layout">
      <aside className="changes-list">
        <div className="eyebrow">
          ZMĚNY <span>2</span>
        </div>
        <button
          className={kind === 'image' ? 'selected' : ''}
          onClick={() => {
            setKind('image')
            setLine(null)
          }}
        >
          <Image size={15} />
          account-settings.png<span className="git-modified">M</span>
        </button>
        <button
          className={kind === 'code' ? 'selected' : ''}
          onClick={() => {
            setKind('code')
            setSelection(null)
          }}
        >
          <Code2 size={15} />
          AccountSettings.tsx<span className="git-modified">M</span>
        </button>
        <p>Porovnání pracovních změn proti HEAD.</p>
        <p className="muted">Ukázkové změny · prototyp</p>
      </aside>
      <div className="review-main">
        <div className="review-toolbar">
          <span className="mono">{filename}</span>
          <div>
            <Button size="xs" variant="ghost" onClick={() => setStacked((s) => !s)}>
              {stacked ? 'Vedle sebe' : 'Pod sebou'}
            </Button>
            {kind === 'image' ? (
              <>
                <Link2 size={14} />
                <label className="zoom-label">
                  Zoom{' '}
                  <input
                    aria-label="Synchronizovaný zoom"
                    type="range"
                    min="70"
                    max="200"
                    step="10"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  />
                  {zoom}%
                </label>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Obnovit zoom"
                  onClick={() => setZoom(100)}
                >
                  <RotateCcw />
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <div className="review-heading">
          <div>
            <h2>
              {kind === 'image' ? 'Stejná obrazovka. Přesná připomínka.' : 'Změny kódu v kontextu.'}
            </h2>
            <p>
              {kind === 'image'
                ? 'Označte oblast v nové verzi a přidejte komentář.'
                : 'Klikněte na řádek v nové verzi a přidejte komentář.'}
            </p>
          </div>
          {kind === 'image' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelection({ x: 26, y: 78, w: 23, h: 16 })}
            >
              <MessageSquarePlus />
              Označit tlačítko
            </Button>
          ) : null}
        </div>
        <div className={`comparison ${stacked ? 'stacked' : ''}`}>
          {[true, false].map((before) => (
            <section className="comparison-pane" key={String(before)}>
              <header>
                <span>{before ? 'Původní' : 'Pracovní změny'}</span>
                <small>{before ? 'HEAD' : 'Aktuální soubor'}</small>
              </header>
              {kind === 'image' ? (
                <div
                  className="image-scroll scrollbar-editor"
                  ref={before ? firstScroll : secondScroll}
                  onScroll={(e) =>
                    sync(e.currentTarget, before ? secondScroll.current : firstScroll.current)
                  }
                >
                  <div
                    className={`image-canvas ${!before ? 'annotatable' : ''}`}
                    style={{ width: `${zoom}%` }}
                    onPointerDown={!before ? start : undefined}
                    onPointerMove={!before ? move : undefined}
                    onPointerUp={!before ? end : undefined}
                    onPointerCancel={!before ? end : undefined}
                  >
                    <AccountScreen before={before} />
                    {!before && selection ? (
                      <div
                        className="selection-box"
                        style={{
                          left: `${selection.x}%`,
                          top: `${selection.y}%`,
                          width: `${selection.w}%`,
                          height: `${selection.h}%`
                        }}
                      >
                        <span>1</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="text-diff">
                  {(before
                    ? [
                        'async function saveChanges() {',
                        '  setSaving(true)',
                        '  await updatePreferences(preferences)',
                        '  setSaving(false)',
                        '}'
                      ]
                    : [
                        'async function saveChanges() {',
                        '  setSaving(true)',
                        '  try {',
                        '    await updatePreferences(preferences)',
                        '  } finally {',
                        '    setSaving(false)',
                        '  }',
                        '}'
                      ]
                  ).map((text, i) =>
                    before ? (
                      <div className={i > 1 && i < 4 ? 'removed' : ''} key={text}>
                        <span>{44 + i}</span>
                        <code>{text}</code>
                      </div>
                    ) : (
                      <button
                        key={text}
                        className={`${i > 1 && i < 7 ? 'added' : ''} ${line === 44 + i ? 'chosen' : ''}`}
                        onClick={() => setLine(44 + i)}
                      >
                        <span>{44 + i}</span>
                        <code>{text}</code>
                        <MessageSquarePlus size={13} />
                      </button>
                    )
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
        {anchor ? (
          <div className="comment-form">
            <small>
              {filename} · {anchor}
            </small>
            <textarea
              aria-label="Komentář ke změně"
              placeholder="Co má agent na tomto místě upravit?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelection(null)
                  setLine(null)
                  setComment('')
                }}
              >
                Zrušit
              </Button>
              <Button size="sm" disabled={!comment.trim()} onClick={saveComment}>
                Přidat připomínku
              </Button>
            </div>
          </div>
        ) : null}
        {comments.length ? (
          <div className="review-comments">
            <div className="section-heading">
              <strong>Připravené připomínky · {comments.length}</strong>
              <Button
                size="sm"
                onClick={() => {
                  onSend(comments)
                  setComments([])
                }}
              >
                Přidat do promptu <Check />
              </Button>
            </div>
            {comments.map((c, i) => (
              <div className="saved-comment" key={c.id}>
                <span>{i + 1}</span>
                <div>
                  <small>
                    {c.file} · {c.anchor}
                  </small>
                  <p>{c.text}</p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setComments((all) => all.filter((_, index) => index !== i))}
                >
                  Odebrat
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="review-footnote">
          Připomínky se odešlou až s vaší zprávou v Codex chatu.
        </div>
      </div>
    </div>
  )
}
