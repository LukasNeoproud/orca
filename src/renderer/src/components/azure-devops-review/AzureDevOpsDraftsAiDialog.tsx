import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { useAppStore } from '@/store'
import { useAzureDevOpsReviewChatLinks } from '@/store/azure-devops-review-chat-links'
import { useAzureDevOpsReviewDraftPrompts } from '@/store/azure-devops-review-draft-prompts'
import { findAzureDevOpsReviewChatTab } from '@/lib/azure-devops-review-chat'
import { orcaLaunchCliCommand } from '../../../../shared/terminal-interaction-launch'
import { buildAzureDevOpsDraftReworkPrompt } from '../../../../shared/azure-devops-draft-rework-prompt'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'
import { draftLocationLabel } from './azure-devops-review-labels'
import { azureDevOpsDraftAiPresets } from './azure-devops-draft-ai-presets'
import { sendAzureDevOpsDraftReworkPrompt } from './azure-devops-draft-rework-delivery'

/** Collects drafts and their AI prompts and sends them to the pull request's AI chat. */
export function AzureDevOpsDraftsAiDialog({
  detail,
  initialDraftIds,
  onClose,
  onStartNewChat
}: {
  detail: AzureDevOpsReviewDetail
  /** Drafts the user picked; drafts that already carry a prompt are always offered. */
  initialDraftIds: readonly string[]
  onClose: () => void
  /** Starts a review agent with this prompt when the pull request has no AI chat yet. */
  onStartNewChat: (prompt: string) => Promise<boolean>
}): React.JSX.Element {
  const pullRequestKey = detail.pullRequest.key
  const prompts = useAzureDevOpsReviewDraftPrompts((s) => s.prompts)
  const setPrompt = useAzureDevOpsReviewDraftPrompts((s) => s.setPrompt)
  const clearPrompts = useAzureDevOpsReviewDraftPrompts((s) => s.clearPrompts)
  const tabLinks = useAzureDevOpsReviewChatLinks((s) => s.tabs)
  const chatTab = useAppStore((s) => findAzureDevOpsReviewChatTab(s, tabLinks, pullRequestKey))
  const [offered] = useState(() => {
    const picked = new Set(initialDraftIds)
    return detail.drafts.filter(
      (draft) => draft.state !== 'published' && (picked.has(draft.id) || prompts[draft.id])
    )
  })
  const [included, setIncluded] = useState(() => new Set(offered.map((draft) => draft.id)))
  const [general, setGeneral] = useState('')
  const [sending, setSending] = useState(false)
  const chosen = useMemo(
    () => offered.filter((draft) => included.has(draft.id)),
    [included, offered]
  )
  const hasInstruction =
    general.trim().length > 0 || chosen.some((draft) => prompts[draft.id]?.text.trim())

  const send = async (): Promise<void> => {
    const prompt = buildAzureDevOpsDraftReworkPrompt({
      pullRequest: detail.pullRequest,
      items: chosen.map((draft) => ({ draft, instruction: prompts[draft.id]?.text ?? '' })),
      generalInstruction: general,
      cli: orcaLaunchCliCommand(CLIENT_PLATFORM, import.meta.env.DEV)
    })
    setSending(true)
    try {
      const sent = chatTab
        ? await sendAzureDevOpsDraftReworkPrompt(chatTab, prompt)
        : await onStartNewChat(prompt)
      if (sent) {
        clearPrompts(chosen.map((draft) => draft.id))
        onClose()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate('azureDevOpsReview.aiDraftsTitle', 'Send drafts to AI')}
          </DialogTitle>
          <DialogDescription>
            {chatTab
              ? translate(
                  'azureDevOpsReview.aiDraftsToChat',
                  "The drafts and your prompts go to this pull request's AI chat. It checks them against the code and edits the drafts; nothing is published."
                )
              : translate(
                  'azureDevOpsReview.aiDraftsNewChat',
                  'No AI chat runs for this pull request yet, so a new one starts in the review workspace with the drafts and your prompts. Nothing is published.'
                )}
          </DialogDescription>
        </DialogHeader>
        {offered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate(
              'azureDevOpsReview.aiDraftsEmpty',
              'Select drafts in the Drafts tab or add an AI prompt to a draft first.'
            )}
          </p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1 scrollbar-sleek">
            {offered.map((draft) => (
              <li
                key={draft.id}
                className="flex items-start gap-2 rounded-md border border-border p-2"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={included.has(draft.id)}
                  aria-label={translate('azureDevOpsReview.aiDraftInclude', 'Include draft')}
                  onCheckedChange={(checked) =>
                    setIncluded((current) => {
                      const next = new Set(current)
                      if (checked === true) {
                        next.add(draft.id)
                      } else {
                        next.delete(draft.id)
                      }
                      return next
                    })
                  }
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {draftLocationLabel(draft)}
                  </p>
                  <p className="line-clamp-2 text-xs" title={draft.body}>
                    {draft.body}
                  </p>
                  <Input
                    value={prompts[draft.id]?.text ?? ''}
                    placeholder={translate(
                      'azureDevOpsReview.aiDraftPromptPlaceholder',
                      'Prompt for this draft (optional)'
                    )}
                    aria-label={translate('azureDevOpsReview.aiPrompt', 'AI prompt')}
                    onChange={(event) =>
                      setPrompt(draft.id, { pullRequestKey, text: event.target.value })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <Label htmlFor="ado-drafts-ai-general">
            {translate('azureDevOpsReview.aiGeneralPrompt', 'Prompt for all selected drafts')}
          </Label>
          <Textarea
            id="ado-drafts-ai-general"
            value={general}
            placeholder={translate(
              'azureDevOpsReview.aiGeneralPromptPlaceholder',
              'For example: check each finding for thread safety and drop the ones that do not hold.'
            )}
            onChange={(event) => setGeneral(event.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {azureDevOpsDraftAiPresets().map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="xs"
                title={preset.text}
                onClick={() => setGeneral(preset.text)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {translate('azureDevOpsReview.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={sending || chosen.length === 0 || !hasInstruction}
            onClick={() => void send()}
          >
            <Sparkles className="size-3.5" />
            {translate('azureDevOpsReview.aiDraftsSend', 'Send {{value0}} drafts to AI', {
              value0: chosen.length
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
