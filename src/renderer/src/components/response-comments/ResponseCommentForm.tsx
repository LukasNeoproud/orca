import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'

export type ResponseCommentFormProps = {
  quote: string
  onSave: (comment: string) => boolean | Promise<boolean>
  /** Called after a successful save and on Cancel. */
  onDone: () => void
  editorRef?: React.Ref<HTMLTextAreaElement>
  submitLabel?: string
}

/** The quoted text and the comment editor for it; Cmd/Ctrl+Enter saves. */
export function ResponseCommentForm({
  quote,
  onSave,
  onDone,
  editorRef,
  submitLabel
}: ResponseCommentFormProps): React.JSX.Element {
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(async () => {
    if (!comment.trim() || saving) {
      return
    }
    setSaving(true)
    setError(null)
    const failed = translate(
      'components.response-comments.saveFailed',
      'Could not add comment. Try again.'
    )
    try {
      if (await onSave(comment.trim())) {
        onDone()
      } else {
        setError(failed)
      }
    } catch {
      setError(failed)
    } finally {
      setSaving(false)
    }
  }, [comment, onDone, onSave, saving])

  return (
    <div className="space-y-3">
      <blockquote className="max-h-28 whitespace-pre-wrap overflow-y-auto border-l-2 border-border pl-3 text-xs text-muted-foreground scrollbar-sleek">
        {quote}
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
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
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
            : (submitLabel ?? translate('components.response-comments.addComment', 'Add comment'))}
        </Button>
      </div>
    </div>
  )
}
