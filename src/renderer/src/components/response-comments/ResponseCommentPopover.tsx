import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquareQuote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { ResponseCommentSelection } from './response-comment-selection'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'

export type ResponseCommentPopoverProps = {
  selection: ResponseCommentSelection | null
  onSave: (comment: string) => boolean | Promise<boolean>
  onDismiss: () => void
  onEditingChange?: (editing: boolean) => void
  submitLabel?: string
}

export function ResponseCommentPopover({
  selection,
  onSave,
  onDismiss,
  onEditingChange,
  submitLabel
}: ResponseCommentPopoverProps): React.JSX.Element | null {
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => onEditingChange?.(false), [onEditingChange])

  useEffect(() => {
    if (editing) {
      return
    }
    const dismissOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-response-comment-ui="true"]')) {
        return
      }
      onDismiss()
    }
    document.addEventListener('pointerdown', dismissOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', dismissOnOutsidePointer)
  }, [editing, onDismiss])

  const dismiss = useCallback(() => {
    setEditing(false)
    onEditingChange?.(false)
    setComment('')
    setError(null)
    onDismiss()
  }, [onDismiss, onEditingChange])

  const save = useCallback(async () => {
    if (!comment.trim() || saving) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (await onSave(comment.trim())) {
        dismiss()
      } else {
        setError(
          translate('components.response-comments.saveFailed', 'Could not add comment. Try again.')
        )
      }
    } catch {
      setError(
        translate('components.response-comments.saveFailed', 'Could not add comment. Try again.')
      )
    } finally {
      setSaving(false)
    }
  }, [comment, dismiss, onSave, saving])

  if (!selection) {
    return null
  }

  return (
    <Popover
      open={editing}
      onOpenChange={(open) => {
        if (open) {
          onEditingChange?.(true)
          setEditing(true)
        } else if (editing) {
          dismiss()
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="fixed z-50 h-8 gap-1.5 shadow-floating"
          style={{
            left: Math.max(8, Math.min(selection.rect.left, window.innerWidth - 112)),
            top: Math.max(8, Math.min(selection.rect.bottom + 6, window.innerHeight - 40))
          }}
          data-response-comment-ui="true"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              dismiss()
            }
          }}
        >
          <MessageSquareQuote className="size-3.5" />
          {translate('components.response-comments.comment', 'Comment')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-testid="response-comment-popover"
        align="start"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(24rem,calc(100vw-1.5rem))] p-3"
        data-response-comment-ui="true"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          editorRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="space-y-3">
          <blockquote className="max-h-28 whitespace-pre-wrap overflow-y-auto border-l-2 border-border pl-3 text-xs text-muted-foreground scrollbar-sleek">
            {selection.quote}
          </blockquote>
          <Textarea
            ref={editorRef}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (isImeCompositionKeyDown(event)) {
                return
              }
              const isMac = navigator.userAgent.includes('Mac')
              if (
                event.key === 'Enter' &&
                (isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
              ) {
                event.preventDefault()
                void save()
              }
            }}
            placeholder={translate('components.response-comments.placeholder', 'Add your comment…')}
            aria-label={translate('components.response-comments.commentText', 'Comment text')}
            className="min-h-20 resize-y text-sm"
            data-response-comment-ui="true"
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
              {translate('components.response-comments.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!comment.trim() || saving}
              onClick={() => void save()}
            >
              {saving
                ? translate('components.response-comments.adding', 'Adding…')
                : (submitLabel ??
                  translate('components.response-comments.addComment', 'Add comment'))}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export type { ResponseCommentSelection } from './response-comment-selection'
