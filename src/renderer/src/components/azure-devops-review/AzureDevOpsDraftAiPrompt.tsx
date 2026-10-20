import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAzureDevOpsReviewDraftPrompts } from '@/store/azure-devops-review-draft-prompts'

/**
 * Attaches an AI prompt to one draft; prompts collect until the user sends them together.
 * `pill` matches the inline diff card's action pill, `button` the Drafts tab card header.
 */
export function AzureDevOpsDraftAiPrompt({
  draftId,
  pullRequestKey,
  variant
}: {
  draftId: string
  pullRequestKey: string
  variant: 'button' | 'pill'
}): React.JSX.Element {
  const saved = useAzureDevOpsReviewDraftPrompts((s) => s.prompts[draftId]?.text ?? '')
  const setPrompt = useAzureDevOpsReviewDraftPrompts((s) => s.setPrompt)
  const [open, setOpen] = useState(false)
  const label = saved
    ? translate('azureDevOpsReview.editAiPrompt', 'Edit AI prompt')
    : translate('azureDevOpsReview.addAiPrompt', 'Add AI prompt')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === 'pill' ? (
          <button
            type="button"
            className="orca-diff-comment-pill-btn"
            title={label}
            aria-label={label}
          >
            <Sparkles className={cn('size-3', saved && 'text-primary')} />
          </button>
        ) : (
          <Button variant="ghost" size="icon-xs" title={label} aria-label={label}>
            <Sparkles className={cn('size-3', saved && 'text-primary')} />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <div className="space-y-2 p-3">
          <p className="text-sm font-medium">
            {translate('azureDevOpsReview.aiPromptTitle', 'AI prompt for this draft')}
          </p>
          <Textarea
            autoFocus
            value={saved}
            // Why save per keystroke: the page unmounts on a workspace switch and would drop unsaved text.
            onChange={(event) => setPrompt(draftId, { pullRequestKey, text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                setOpen(false)
              }
            }}
            aria-label={translate('azureDevOpsReview.aiPrompt', 'AI prompt')}
            className="min-h-24"
          />
          <div className="flex justify-end">
            {/* Clearing the text removes the prompt. */}
            <Button size="xs" onClick={() => setOpen(false)}>
              {translate('azureDevOpsReview.doneAiPrompt', 'Done')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
