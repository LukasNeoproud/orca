import { useRef, useState } from 'react'
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
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { launchPortableConversationBranch } from '@/lib/portable-conversation-branch-launch'
import {
  openPortableConversationBranch,
  portableConversationBranchTargetSource
} from '@/lib/portable-conversation-navigation'
import { resolvePortableConversationBranchTarget } from '@/lib/portable-conversation-branch-client'
import { conversationBranchError } from '@/lib/conversation-branch-error'
import type {
  PortableConversationBranchRecord,
  PortableConversationReturnArtifact
} from '../../../../shared/portable-conversation-branch'

export function PortableConversationBranchDetails({
  branch,
  target,
  results,
  onClose,
  onUpdated,
  onSource,
  onInspectTarget,
  onReturn
}: {
  branch: PortableConversationBranchRecord
  target: RuntimeClientTarget
  results: readonly PortableConversationReturnArtifact[]
  onClose: () => void
  onUpdated: (branch: PortableConversationBranchRecord) => void
  onSource: () => void
  onInspectTarget: (branch: PortableConversationBranchRecord) => void
  onReturn: () => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const attempt = useRef(branch.delivery?.clientMessageId ?? null)
  const act = async (action: 'start' | 'open' | 'read'): Promise<void> => {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      if (action === 'start') {
        attempt.current ??= crypto.randomUUID()
        onUpdated(await launchPortableConversationBranch(target, branch.branchId, attempt.current))
      } else if (action === 'read') {
        const resolved = portableConversationBranchTargetSource(branch)
          ? branch
          : (await resolvePortableConversationBranchTarget(target, branch.branchId)).branch
        if (!portableConversationBranchTargetSource(resolved)) {
          throw new Error(
            translate(
              'conversations.portableBranch.historyUnavailable',
              'Conversation history is unavailable. Reconnect its host and try again.'
            )
          )
        }
        onUpdated(resolved)
        onInspectTarget(resolved)
      } else {
        const status = await openPortableConversationBranch(target, branch)
        if (status === 'activated' || status === 'restored') {
          onClose()
        } else {
          setError(
            translate(
              'conversations.portableBranch.ownerUnverifiable',
              'The conversation cannot be opened safely. Reconnect its host and check the original terminal. No second agent was started.'
            )
          )
        }
      }
    } catch (failure) {
      setError(conversationBranchError(failure))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const prepared = branch.state === 'prepared'
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
          <DialogTitle>{branch.title}</DialogTitle>
          <DialogDescription>
            {branch.target.terminal.workspace.path} · {branch.target.agent} ·{' '}
            {branch.target.terminal.workspace.executionHostId}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto scrollbar-sleek">
          <p role="status" className="text-xs text-muted-foreground">
            {prepared
              ? translate(
                  'conversations.branch.prepared',
                  'Conversation prepared. Work starts only when you explicitly start it.'
                )
              : branch.target.terminal.existingSource && !branch.delivery
                ? translate(
                    'conversations.portableBranch.linkOnly',
                    'Linked to an existing conversation. This saved context has not been sent to its agent.'
                  )
                : branch.delivery?.status === 'accepted'
                  ? translate(
                      'conversations.portableBranch.deliveryAccepted',
                      'The agent acknowledged the handoff.'
                    )
                  : translate(
                      'conversations.portableBranch.deliveryUnverified',
                      'Delivery is unverified. Starting again will not resend the handoff.'
                    )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="outline" disabled={busy} onClick={onSource}>
              {translate('conversations.family.sourceResponse', 'Source response')}
            </Button>
            {!prepared ? (
              <Button size="xs" variant="outline" disabled={busy} onClick={() => void act('read')}>
                {translate('conversations.portableBranch.readConversation', 'Read conversation')}
              </Button>
            ) : null}
            {!prepared ? (
              <Button size="xs" variant="outline" disabled={busy} onClick={onReturn}>
                {translate('conversations.portableBranch.returnResult', 'Return result to parent')}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {branch.handoff.mode === 'preserve-history'
              ? translate('conversations.portableBranch.historyCopy', 'Portable history copy')
              : translate('conversations.branch.targeted', 'Targeted, editable handoff')}
          </p>
          <pre className="whitespace-pre-wrap break-words text-xs">{branch.handoff.content}</pre>
          {results.map((result) => (
            <details key={result.returnId} className="border-t border-border pt-2 text-xs">
              <summary>
                {translate('conversations.portableBranch.savedResult', 'Saved result for parent')} ·{' '}
                {result.delivery?.status ??
                  translate('conversations.portableBranch.notSent', 'Not sent')}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">{result.content}</pre>
              <p className="mt-2 text-muted-foreground">
                {translate(
                  'conversations.portableBranch.noIntegration',
                  'Information handoff only. Code integration and verification are separate.'
                )}
              </p>
            </details>
          ))}
        </div>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {translate('conversations.branch.close', 'Close')}
          </Button>
          <Button disabled={busy} onClick={() => void act(prepared ? 'start' : 'open')}>
            {busy
              ? translate('conversations.portableBranch.working', 'Working…')
              : prepared
                ? attempt.current
                  ? translate('conversations.portableBranch.checkStart', 'Check start attempt')
                  : translate('conversations.family.start', 'Start work')
                : translate('conversations.portableBranch.openConversation', 'Open conversation')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
