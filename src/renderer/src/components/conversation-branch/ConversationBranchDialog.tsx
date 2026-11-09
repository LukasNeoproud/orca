import { useState } from 'react'
import { GitBranch, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import {
  CONVERSATION_BRANCH_FOCUS_MAX,
  CONVERSATION_BRANCH_LABEL_MAX,
  type ConversationBranchMode
} from '../../../../shared/conversation-branch'
import {
  defaultCleanBranchPrompt,
  defaultConversationBranchLabel
} from './conversation-branch-dialog-defaults'
import { conversationBranchErrorText } from './conversation-branch-error-text'
import { ConversationBranchModeField } from './ConversationBranchModeField'

export type ConversationBranchDialogValues = {
  label: string
  mode: ConversationBranchMode
  focus: string
  prompt: string
}

/** Names a branch, picks how much of the conversation it keeps, and drafts its first prompt. */
export function ConversationBranchDialog({
  replyMarkdown,
  onCancel,
  onCreate
}: {
  replyMarkdown: string
  onCancel: () => void
  onCreate: (values: ConversationBranchDialogValues) => Promise<void>
}): React.JSX.Element {
  const [label, setLabel] = useState(() => defaultConversationBranchLabel(replyMarkdown))
  const [mode, setMode] = useState<ConversationBranchMode>('full')
  const [focus, setFocus] = useState('')
  const [prompt, setPrompt] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chooseMode = (next: ConversationBranchMode): void => {
    setMode(next)
    // A clean branch has no history, so an empty draft gets the reply it started from.
    if (next === 'clean' && !prompt.trim()) {
      setPrompt(defaultCleanBranchPrompt(replyMarkdown))
    }
  }
  const create = async (): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      await onCreate({ label: label.trim(), mode, focus: focus.trim() || label.trim(), prompt })
    } catch (failure) {
      setError(conversationBranchErrorText(failure))
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {translate('conversationBranch.title', 'Branch from this reply')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'conversationBranch.description',
              'The branch opens in a new chat with its prompt unsent. Branches share this workspace, so file changes made in one are visible in the others.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="conversation-branch-label">
              {translate('conversationBranch.label', 'Name')}
            </Label>
            <Input
              id="conversation-branch-label"
              value={label}
              maxLength={CONVERSATION_BRANCH_LABEL_MAX}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <ConversationBranchModeField mode={mode} disabled={pending} onChange={chooseMode} />
          {mode === 'compact' ? (
            <div className="space-y-1">
              <Label htmlFor="conversation-branch-focus">
                {translate('conversationBranch.focus', 'Summarize with a focus on')}
              </Label>
              <Input
                id="conversation-branch-focus"
                value={focus}
                placeholder={label}
                maxLength={CONVERSATION_BRANCH_FOCUS_MAX}
                onChange={(event) => setFocus(event.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="conversation-branch-prompt">
              {translate('conversationBranch.prompt', 'Prompt')}
            </Label>
            <Textarea
              id="conversation-branch-prompt"
              className="max-h-64 min-h-24"
              value={prompt}
              placeholder={translate(
                'conversationBranch.promptPlaceholder',
                'Optional. It waits in the branch’s composer until you send it.'
              )}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            {translate('conversationBranch.cancel', 'Cancel')}
          </Button>
          <Button disabled={pending || !label.trim()} onClick={() => void create()}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GitBranch className="size-4" />
            )}
            {pending
              ? mode === 'compact'
                ? translate('conversationBranch.summarizing', 'Summarizing…')
                : translate('conversationBranch.creating', 'Creating branch…')
              : translate('conversationBranch.create', 'Create branch')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
