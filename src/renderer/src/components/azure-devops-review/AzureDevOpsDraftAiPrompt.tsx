import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAzureDevOpsReviewDraftPrompts } from '@/store/azure-devops-review-draft-prompts'
import { azureDevOpsDraftAiPresets } from './azure-devops-draft-ai-presets'

/**
 * Attaches an AI instruction to one draft; prompts collect until the user sends them together.
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
  const [text, setText] = useState(saved)
  const label = saved
    ? translate('azureDevOpsReview.editAiPrompt', 'Edit AI prompt')
    : translate('azureDevOpsReview.addAiPrompt', 'Add AI prompt')
  const save = (value: string): void => {
    setPrompt(draftId, { pullRequestKey, text: value.trim() })
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setText(saved)
        }
        setOpen(next)
      }}
    >
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
      <PopoverContent align="end" className="w-80">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {translate(
              'azureDevOpsReview.aiPromptHint',
              'What should the AI check or change in this draft? Prompts wait until you send them.'
            )}
          </p>
          <Textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                save(text)
              }
            }}
            placeholder={translate(
              'azureDevOpsReview.aiPromptPlaceholder',
              'e.g. Is this really a race?'
            )}
            aria-label={translate('azureDevOpsReview.aiPrompt', 'AI prompt')}
            className="min-h-20 text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {azureDevOpsDraftAiPresets().map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="xs"
                title={preset.text}
                onClick={() => setText(preset.text)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            {saved ? (
              <Button variant="ghost" size="xs" onClick={() => save('')}>
                {translate('azureDevOpsReview.removeAiPrompt', 'Remove')}
              </Button>
            ) : null}
            <Button size="xs" disabled={!text.trim()} onClick={() => save(text)}>
              {translate('azureDevOpsReview.saveAiPrompt', 'Save prompt')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
