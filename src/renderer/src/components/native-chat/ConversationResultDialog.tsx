import { conversationBranchError } from '@/lib/conversation-branch-error'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  AgentSessionBranchRecord,
  AgentSessionBranchResult,
  AgentSessionReturnArtifact
} from '../../../../shared/agent-session-branch'
import { callConversationBranch } from '@/lib/structured-conversation-branch-client'
import { conversationDeliveryEnvelope } from '@/lib/conversation-branch-delivery'
import { conversationResultDraft } from './conversation-branch-draft'
import { structuredSessionOperationId } from './use-structured-agent-session-outbox'

export function ConversationResultDialog({
  branch,
  target,
  text,
  existing,
  onClose,
  onChanged
}: {
  branch: AgentSessionBranchRecord
  target: RuntimeClientTarget
  text: string
  existing?: AgentSessionReturnArtifact
  onClose: () => void
  onChanged: () => void
}): React.JSX.Element {
  const [content, setContent] = useState(existing?.content ?? conversationResultDraft(text))
  const [artifact, setArtifact] = useState(existing ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intent = useRef<{ returnId: string; content: string } | null>(
    existing ? { returnId: existing.returnId, content: existing.content } : null
  )
  const inFlight = useRef(false)
  const operationId = useRef<string | null>(existing?.delivery?.clientMessageId ?? null)
  const send = async (): Promise<void> => {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      intent.current ??= { returnId: crypto.randomUUID(), content }
      const prepared = await callConversationBranch<AgentSessionBranchResult>(
        target,
        'agentSession.branchResultPrepare',
        {
          ...intent.current,
          branchId: branch.branchId
        }
      )
      setArtifact(prepared.result)
      onChanged()
      if (prepared.result.delivery?.status === 'accepted') {
        return
      }
      operationId.current =
        prepared.result.delivery?.clientMessageId ??
        operationId.current ??
        structuredSessionOperationId()
      const envelope = await conversationDeliveryEnvelope(
        target,
        prepared.result.targetSessionId,
        operationId.current,
        prepared.result.content
      )
      const sent = await callConversationBranch<AgentSessionBranchResult>(
        target,
        'agentSession.branchResultSend',
        {
          returnId: prepared.result.returnId,
          envelope,
          ...(artifact?.delivery?.status === 'unknown' ? { retryUnknown: true } : {})
        }
      )
      setArtifact(sent.result)
      onChanged()
    } catch (failure) {
      setError(conversationBranchError(failure))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose()
        }
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{translate('conversations.result.title', 'Return a result')}</DialogTitle>
          <DialogDescription>
            {translate(
              'conversations.result.destination',
              'Send this exact text to the source conversation. This does not merge code or complete a task.'
            )}
            <span className="mt-1 block break-all">
              {branch.source.location.workspaceId} · {branch.source.agent} ·{' '}
              {branch.source.sessionId}
            </span>
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label={translate('conversations.result.content', 'Result content')}
          className="min-h-64 overflow-auto scrollbar-sleek font-mono text-xs"
          value={content}
          readOnly={intent.current !== null}
          onChange={(event) => setContent(event.target.value)}
        />
        {artifact ? (
          <p role="status" className="text-xs text-muted-foreground">
            {artifact.delivery?.status === 'accepted'
              ? translate(
                  'conversations.result.accepted',
                  'The source conversation accepted the result.'
                )
              : translate(
                  'conversations.result.unconfirmed',
                  'Result saved. Delivery is not confirmed.'
                )}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {translate('conversations.result.close', 'Close')}
          </Button>
          <Button
            disabled={busy || !content.trim() || artifact?.delivery?.status === 'accepted'}
            onClick={() => void send()}
          >
            {busy
              ? translate('conversations.result.sending', 'Sending…')
              : intent.current
                ? translate('conversations.result.retry', 'Check and retry delivery')
                : translate('conversations.result.send', 'Send result')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
