import { MessageSquareQuote, Trash2 } from 'lucide-react'
import type { AiResponseComment } from '../../../../shared/ai-response-comments'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'

export function ResponseCommentsChip({
  comments,
  onChange,
  onRemove
}: {
  comments: readonly AiResponseComment[]
  onChange: (id: string, comment: string) => void
  onRemove: (id: string) => void
}): React.JSX.Element | null {
  if (comments.length === 0) {
    return null
  }
  const label =
    comments.length === 1
      ? translate('components.response-comments.oneComment', '1 comment')
      : translate('components.response-comments.manyComments', '{{count}} comments', {
          count: comments.length
        })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5">
          <MessageSquareQuote className="size-3.5" />
          <span className="tabular-nums">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[min(28rem,calc(100vw-1.5rem))] p-2"
      >
        <div className="max-h-80 space-y-2 overflow-y-auto p-1 scrollbar-sleek">
          {comments.map((entry, index) => (
            <div key={entry.id} className="rounded-md bg-muted/60 p-2.5">
              <div className="mb-2 flex items-start gap-2">
                <blockquote className="line-clamp-3 min-w-0 flex-1 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                  {entry.quote}
                </blockquote>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={translate(
                    'components.response-comments.removeComment',
                    'Remove comment {{number}}',
                    { number: index + 1 }
                  )}
                  onClick={() => onRemove(entry.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <Textarea
                value={entry.comment}
                onChange={(event) => onChange(entry.id, event.target.value)}
                aria-label={translate(
                  'components.response-comments.editComment',
                  'Edit comment {{number}}',
                  { number: index + 1 }
                )}
                className="min-h-16 resize-y bg-background text-sm"
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
