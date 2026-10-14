import type { Dispatch, JSX, SetStateAction } from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { DiffCommentCard } from '../diff-comments/DiffCommentCard'
import type { DiffComment, ImageReviewRegion } from '../../../../shared/diff-comment-types'
import { isImageReviewRegion } from './image-review-region'

/** The note composer for a selected image area, and the notes already left on the image. */
export function ImageDiffNotesPanel({
  worktreeId,
  comments,
  region,
  onRegionChange,
  body,
  onBodyChange,
  error,
  submitting,
  onSave
}: {
  worktreeId: string
  comments: readonly DiffComment[]
  region: ImageReviewRegion | null
  onRegionChange: Dispatch<SetStateAction<ImageReviewRegion | null>>
  body: string
  onBodyChange: (body: string) => void
  error: boolean
  submitting: boolean
  onSave: () => void
}): JSX.Element {
  const deleteDiffComment = useAppStore((s) => s.deleteDiffComment)
  const updateDiffComment = useAppStore((s) => s.updateDiffComment)
  return (
    <div className="max-h-72 shrink-0 space-y-2 overflow-y-auto border-t border-border bg-background p-3 scrollbar-editor">
      {region && (
        <div className="rounded-md border border-border p-3">
          <div className="mb-2 text-xs font-medium text-foreground">
            {translate('image.review.areaNote', 'Note on selected area')}
          </div>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            {(['x', 'y', 'width', 'height'] as const).map((field) => (
              <label key={field} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {field} (%)
                <input
                  type="number"
                  min={field === 'width' || field === 'height' ? 0.1 : 0}
                  max={100}
                  step={0.1}
                  value={region[field]}
                  onChange={(event) =>
                    onRegionChange((current) =>
                      current ? { ...current, [field]: Number(event.target.value) } : null
                    )
                  }
                  className="h-8 w-20 rounded-md border border-input bg-background px-2 text-foreground"
                />
              </label>
            ))}
          </div>
          <Textarea
            aria-label={translate('image.review.noteBody', 'Image area note')}
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            placeholder={translate(
              'image.review.notePlaceholder',
              'Describe what should change in this area…'
            )}
            className="min-h-16 text-sm"
          />
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {translate('image.review.saveFailed', 'Could not save the note. Try again.')}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onRegionChange(null)}>
              {translate('auto.components.diff.comments.DiffCommentPopover.2b3ce6d394', 'Cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!body.trim() || !isImageReviewRegion(region) || submitting}
              onClick={onSave}
            >
              {translate('image.review.saveNote', 'Add note')}
            </Button>
          </div>
        </div>
      )}
      {comments.map((comment) => (
        <div key={comment.id} id={`image-review-note-${comment.id}`}>
          <DiffCommentCard
            lineNumber={0}
            label={translate('image.review.imageArea', 'image area')}
            body={comment.body}
            sentAt={comment.sentAt}
            onDelete={() => void deleteDiffComment(worktreeId, comment.id)}
            onSubmitEdit={(next) => updateDiffComment(worktreeId, comment.id, next)}
          />
        </div>
      ))}
    </div>
  )
}
