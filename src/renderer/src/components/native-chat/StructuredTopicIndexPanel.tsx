import { useMemo, useState } from 'react'
import { ChevronRight, Combine, ListTree, Pencil, Scissors } from 'lucide-react'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { StructuredTopicIndex } from '../../../../shared/structured-topic-index'
import {
  mergeStructuredTopicChapters,
  renameStructuredTopicChapter,
  splitStructuredTopicChapter
} from '../../../../shared/structured-topic-index'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function excerpt(item: AgentJournalRenderItem): string {
  return item.body.kind === 'message'
    ? item.body.blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(' ')
        .slice(0, 72)
    : ''
}

export function StructuredTopicIndexPanel({
  index,
  onNavigate,
  onSave,
  items,
  onLoadOlder,
  epoch,
  error
}: {
  index: StructuredTopicIndex
  items: readonly AgentJournalRenderItem[]
  epoch: string | null | undefined
  onNavigate: (anchor: StructuredTopicIndex['chapters'][number]['start']) => void
  onSave: (index: StructuredTopicIndex) => void
  onLoadOlder: () => void
  error?: string | null
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [splitting, setSplitting] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const userTurns = useMemo(
    () => items.filter((item) => item.body.kind === 'message' && item.body.role === 'user'),
    [items]
  )
  return (
    <div className="border-b border-border px-3 py-1.5">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          className="flex-1 justify-between text-muted-foreground"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="flex items-center gap-1.5">
            <ListTree className="size-3.5" />
            Topics
          </span>
          <ChevronRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        </Button>
        <Button
          variant={index.automatic ? 'secondary' : 'ghost'}
          size="xs"
          onClick={() =>
            onSave({ ...index, revision: index.revision + 1, automatic: !index.automatic })
          }
        >
          {index.automatic ? 'Auto' : 'Manual'}
        </Button>
      </div>
      {error ? <p className="px-1 pt-1 text-xs text-destructive">{error}</p> : null}
      {open && index.chapters.length > 0 ? (
        <div className="mt-1 space-y-0.5 pb-1">
          {unavailable ? <p className="px-1 text-xs text-muted-foreground">{unavailable}</p> : null}
          {index.chapters.map((chapter, position) => (
            <div key={chapter.id} className="rounded-sm px-1 py-0.5 hover:bg-accent">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (chapter.start.epoch !== epoch) {
                      setUnavailable('This topic belongs to an earlier conversation history.')
                      return
                    }
                    setUnavailable(null)
                    onNavigate(chapter.start)
                  }}
                  className="min-w-0 flex-1 truncate px-1 text-left text-xs text-muted-foreground hover:text-accent-foreground"
                >
                  <span className="mr-2 font-mono text-[11px]">{position + 1}</span>
                  {chapter.title}
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Rename topic"
                  onClick={() => {
                    setEditing(chapter.id)
                    setTitle(chapter.title)
                  }}
                >
                  <Pencil />
                </Button>
                {position < index.chapters.length - 1 ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Merge topics"
                    onClick={() =>
                      onSave(
                        mergeStructuredTopicChapters(
                          index,
                          chapter.id,
                          index.chapters[position + 1]!.id
                        )
                      )
                    }
                  >
                    <Combine />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Split topic"
                  onClick={() => setSplitting(chapter.id)}
                >
                  <Scissors />
                </Button>
              </div>
              {editing === chapter.id ? (
                <form
                  className="mt-1 flex gap-1"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onSave(renameStructuredTopicChapter(index, chapter.id, title))
                    setEditing(null)
                  }}
                >
                  <Input
                    autoFocus
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="h-7 text-xs"
                  />
                  <Button size="xs">Save</Button>
                </form>
              ) : null}
              {splitting === chapter.id ? (
                <div className="mt-1 space-y-1">
                  <select
                    aria-label="Split at user turn"
                    className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                    defaultValue=""
                    onChange={(event) => {
                      const item = userTurns.find((row) => row.itemId === event.target.value)
                      if (item) {
                        onSave(
                          splitStructuredTopicChapter(
                            index,
                            chapter.id,
                            {
                              epoch: chapter.start.epoch,
                              itemId: item.itemId,
                              sequence: item.sequence
                            },
                            'New topic'
                          )
                        )
                        setSplitting(null)
                      }
                    }}
                  >
                    <option value="">Choose a user turn…</option>
                    {userTurns
                      .filter(
                        (item) =>
                          item.sequence > chapter.start.sequence &&
                          item.sequence <= chapter.end.sequence
                      )
                      .map((item) => (
                        <option key={item.itemId} value={item.itemId}>
                          {excerpt(item) || item.itemId}
                        </option>
                      ))}
                  </select>
                  <Button variant="ghost" size="xs" onClick={onLoadOlder}>
                    Load earlier turns
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
