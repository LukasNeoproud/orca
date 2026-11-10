import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { requestClaudeSessionControl } from '@/runtime/claude-session-control-client'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { NativeChatMarkdown } from './NativeChatMarkdown'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import { claudeControlErrorText } from './native-chat-claude-control-error-text'

type Answer =
  | { state: 'asking' }
  | { state: 'answered'; text: string }
  | { state: 'failed'; text: string }

/** `/btw`: a question answered from the conversation so far, outside it. Nothing joins the transcript. */
export function NativeChatClaudeSideQuestionDialog({
  target,
  sessionId,
  question,
  onClose
}: {
  target: RuntimeClientTarget
  sessionId: string
  question: string
  onClose: () => void
}): React.JSX.Element {
  const [answer, setAnswer] = useState<Answer>({ state: 'asking' })
  useEffect(() => {
    let current = true
    requestClaudeSessionControl(target, sessionId, { kind: 'side-question', question }).then(
      (reply) => {
        if (current) {
          setAnswer(
            reply.response
              ? { state: 'answered', text: reply.response }
              : {
                  state: 'failed',
                  text: translate(
                    'components.native-chat.claudeControls.sideNoAnswer',
                    'Claude had no answer.'
                  )
                }
          )
        }
      },
      (error: unknown) => {
        if (current) {
          setAnswer({ state: 'failed', text: claudeControlErrorText(error) })
        }
      }
    )
    return () => {
      current = false
    }
  }, [question, sessionId, target])
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate('components.native-chat.claudeControls.sideTitle', 'Side question')}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap break-words">
            {question}
          </DialogDescription>
        </DialogHeader>
        <div
          data-native-chat-side-answer={answer.state}
          className="max-h-[60vh] min-h-16 overflow-auto scrollbar-sleek"
        >
          {answer.state === 'asking' ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {translate('components.native-chat.claudeControls.sideAsking', 'Asking Claude…')}
            </p>
          ) : answer.state === 'answered' ? (
            <NativeChatMarkdown
              content={answer.text}
              variant="document"
              className="text-sm text-chat-foreground"
              renderCodeBlock={NativeChatCodeBlock}
            />
          ) : (
            <p role="alert" className="text-sm text-destructive">
              {answer.text}
            </p>
          )}
        </div>
        <DialogFooter>
          {answer.state === 'answered' ? (
            <Button
              variant="outline"
              onClick={() => void window.api.ui.writeClipboardText(answer.text)}
            >
              {translate('components.native-chat.claudeControls.copy', 'Copy')}
            </Button>
          ) : null}
          <Button onClick={onClose}>
            {translate('components.native-chat.claudeControls.close', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
