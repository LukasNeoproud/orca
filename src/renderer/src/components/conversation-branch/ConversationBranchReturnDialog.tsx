import { useState } from 'react'
import { Loader2, Reply } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { CONVERSATION_BRANCH_RETURN_MAX } from '../../../../shared/conversation-branch'
import { conversationBranchErrorText } from './conversation-branch-error-text'

/** What a branch hands back to the conversation it came from, edited before it goes. */
export function ConversationBranchReturnDialog({
  initialContent,
  parentName,
  onCancel,
  onReturn
}: {
  initialContent: string
  parentName: string
  onCancel: () => void
  onReturn: (content: string) => Promise<void>
}): React.JSX.Element {
  const [content, setContent] = useState(initialContent)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      await onReturn(content.trim())
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
            {translate('conversationBranch.returnTitle', 'Return the result')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'conversationBranch.returnDescription',
              'It goes into the composer of {{value0}} as a draft. Nothing is sent.',
              { value0: parentName }
            )}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          className="max-h-[50vh] min-h-40"
          value={content}
          maxLength={CONVERSATION_BRANCH_RETURN_MAX}
          disabled={pending}
          aria-label={translate('conversationBranch.returnContent', 'Result')}
          onChange={(event) => setContent(event.target.value)}
        />
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            {translate('conversationBranch.cancel', 'Cancel')}
          </Button>
          <Button disabled={pending || !content.trim()} onClick={() => void submit()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Reply className="size-4" />}
            {translate('conversationBranch.returnSubmit', 'Return to the branch point')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
