import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquareQuote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { ResponseCommentForm } from './ResponseCommentForm'

export type ResponseCommentSelection = {
  quote: string
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number }
}

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
    onDismiss()
  }, [onDismiss, onEditingChange])

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
        <ResponseCommentForm
          quote={selection.quote}
          onSave={onSave}
          onDone={dismiss}
          editorRef={editorRef}
          submitLabel={submitLabel}
        />
      </PopoverContent>
    </Popover>
  )
}
