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
import { conversationBranchError } from '@/lib/conversation-branch-error'
import { branchResultPreparePortableConversation } from '@/lib/portable-conversation-branch-client'
import { sendPortableConversationResult } from '@/lib/portable-conversation-result-send'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type {
  PortableConversationBranchRecord,
  PortableConversationReturnArtifact
} from '../../../../shared/portable-conversation-branch'
import { conversationResultDraft } from './conversation-branch-draft'

type ResultIntent = { returnId: string; content: string }

function maySendResult(artifact: PortableConversationReturnArtifact | null): boolean {
  return artifact !== null && (!artifact.delivery || artifact.delivery.status === 'rejected')
}

function resultStatus(artifact: PortableConversationReturnArtifact): string {
  switch (artifact.delivery?.status) {
    case 'accepted':
      return translate(
        'conversations.result.accepted',
        'The source conversation accepted the result.'
      )
    case 'pending':
      return translate(
        'conversations.result.pending',
        'Delivery is already in progress. Check the source conversation before trying again.'
      )
    case 'unknown':
      return translate(
        'conversations.result.unconfirmed',
        'Result saved. Delivery is not confirmed.'
      )
    case 'rejected':
      return translate(
        'conversations.result.rejected',
        'Delivery was rejected before the source received the result. You can retry.'
      )
    case undefined:
      return translate(
        'conversations.portableBranch.resultPrepared',
        'Result prepared. Review the exact text, then send it.'
      )
  }
}

export function PortableConversationResultDialog({
  target,
  branch,
  existingArtifact,
  onClose,
  onSaved
}: {
  target: RuntimeClientTarget
  branch: PortableConversationBranchRecord
  existingArtifact?: PortableConversationReturnArtifact
  onClose: () => void
  onSaved: (result: PortableConversationReturnArtifact) => void
}): React.JSX.Element {
  const [content, setContent] = useState(
    () => existingArtifact?.content ?? conversationResultDraft('')
  )
  const [artifact, setArtifact] = useState<PortableConversationReturnArtifact | null>(
    existingArtifact ?? null
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intent = useRef<ResultIntent | null>(
    existingArtifact
      ? { returnId: existingArtifact.returnId, content: existingArtifact.content }
      : null
  )
  const inFlight = useRef(false)

  const save = (result: PortableConversationReturnArtifact): void => {
    setArtifact(result)
    setContent(result.content)
    onSaved(result)
  }
  const prepare = async (): Promise<void> => {
    if (inFlight.current || artifact || !content.trim()) {
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      intent.current ??= { returnId: crypto.randomUUID(), content }
      const prepared = await branchResultPreparePortableConversation(target, {
        branchId: branch.branchId,
        ...intent.current
      })
      save(prepared.result)
    } catch (failure) {
      setError(conversationBranchError(failure))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const send = async (): Promise<void> => {
    const preparedArtifact = artifact
    if (inFlight.current || !preparedArtifact || !maySendResult(preparedArtifact)) {
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      save(await sendPortableConversationResult(target, branch, preparedArtifact))
    } catch (failure) {
      setError(conversationBranchError(failure))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const prepared = artifact !== null
  const retry = artifact?.delivery?.status === 'rejected'

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose()
        }
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {translate('conversations.portableBranch.returnResult', 'Return result to parent')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'conversations.portableBranch.resultDescription',
              'Prepare a concise result for the parent conversation. Review the saved text before sending.'
            )}
            <span className="mt-1 block break-all">
              {branch.source.portable.source.executionHostId} · {branch.source.agent} ·{' '}
              {branch.source.portable.source.workspace.path} ·{' '}
              {branch.source.portable.source.provider.sessionId}
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
            {resultStatus(artifact)}
          </p>
        ) : null}
        {artifact?.delivery?.reason ? (
          <p className="text-xs text-muted-foreground">
            {conversationBranchError(new Error(artifact.delivery.reason))}
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
          {prepared ? (
            <Button disabled={busy || !maySendResult(artifact)} onClick={() => void send()}>
              {busy
                ? translate('conversations.result.sending', 'Sending…')
                : retry
                  ? translate('conversations.portableBranch.retryResult', 'Retry delivery')
                  : translate('conversations.result.send', 'Send result')}
            </Button>
          ) : (
            <Button disabled={busy || !content.trim()} onClick={() => void prepare()}>
              {busy
                ? translate('conversations.portableBranch.preparingResult', 'Preparing…')
                : translate('conversations.portableBranch.prepareResult', 'Prepare result')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
