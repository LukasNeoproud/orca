import { useRef, useState } from 'react'
import { ListTree } from 'lucide-react'
import type {
  StructuredTaskProposal,
  StructuredTaskProposalBatchRequest,
  StructuredTaskProposalBatchResult,
  StructuredTaskProposalItem,
  StructuredTaskProposalItemResult,
  StructuredTaskProposalRelatedThread,
  StructuredTaskProposalWorkspace
} from '../../../../shared/structured-task-proposal'
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
import { StructuredTaskProposalItemEditor } from './StructuredTaskProposalItemEditor'

const NO_INITIAL_RESULTS: readonly StructuredTaskProposalItemResult[] = []

export type StructuredTaskProposalEditorProps = {
  open: boolean
  proposal: StructuredTaskProposal
  workspaces: readonly StructuredTaskProposalWorkspace[]
  relatedThreads: readonly StructuredTaskProposalRelatedThread[]
  initialResults?: readonly StructuredTaskProposalItemResult[]
  initialSourceNotice?: StructuredTaskProposalBatchResult['sourceNotice']
  onOpenChange: (open: boolean) => void
  onPrepareBatch: (
    request: StructuredTaskProposalBatchRequest
  ) => Promise<StructuredTaskProposalBatchResult>
}

function mergeItems(
  items: StructuredTaskProposalItem[],
  position: number
): StructuredTaskProposalItem[] {
  const left = items[position - 1]
  const right = items[position]
  if (!left || !right) {
    return items
  }
  const merged: StructuredTaskProposalItem = {
    ...left,
    name: left.name === right.name ? left.name : `${left.name} + ${right.name}`.slice(0, 120),
    scope: `${left.scope}\n\n${right.scope}`,
    verification: `${left.verification}\n${right.verification}`,
    dependencyIds: [...new Set([...left.dependencyIds, ...right.dependencyIds])].filter(
      (id) => id !== left.itemId && id !== right.itemId
    ),
    context: {
      content: `${left.context.content}\n\n${right.context.content}`,
      sourceItemIds: [...new Set([...left.context.sourceItemIds, ...right.context.sourceItemIds])]
    },
    uncertain: left.uncertain || right.uncertain
  }
  return items
    .filter((_, index) => index !== position)
    .map((item, index) => {
      const candidate = index === position - 1 ? merged : item
      return {
        ...candidate,
        dependencyIds: candidate.dependencyIds.map((id) => (id === right.itemId ? left.itemId : id))
      }
    })
}

function validItem(item: StructuredTaskProposalItem): boolean {
  if (item.action === 'reject') {
    return true
  }
  return Boolean(
    item.name.trim() &&
    item.scope.trim() &&
    item.context.content.trim() &&
    (item.action !== 'attach' || item.targetSessionId)
  )
}

function StructuredTaskProposalEditorContent({
  open,
  proposal,
  workspaces,
  relatedThreads,
  initialResults = NO_INITIAL_RESULTS,
  initialSourceNotice,
  onOpenChange,
  onPrepareBatch
}: StructuredTaskProposalEditorProps): React.JSX.Element {
  const [items, setItems] = useState(proposal.items)
  const [results, setResults] = useState<Record<string, StructuredTaskProposalItemResult>>(() =>
    Object.fromEntries(initialResults.map((result) => [result.itemId, result]))
  )
  const [noticeResult, setNoticeResult] =
    useState<StructuredTaskProposalBatchResult['sourceNotice']>(initialSourceNotice)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const updateItem = (next: StructuredTaskProposalItem): void => {
    setItems((current) => current.map((item) => (item.itemId === next.itemId ? next : item)))
  }
  const submit = async (selected: readonly StructuredTaskProposalItem[]): Promise<void> => {
    if (inFlight.current || selected.length === 0) {
      return
    }
    inFlight.current = true
    setBusy(true)
    const activeItemIds = new Set(
      items.filter((item) => item.action !== 'reject').map((item) => item.itemId)
    )
    const request: StructuredTaskProposalBatchRequest = {
      proposalId: proposal.proposalId,
      source: proposal.source,
      items: selected.map(({ uncertain: _uncertain, ...item }) => ({
        ...item,
        dependencyIds: item.dependencyIds.filter((dependencyId) => activeItemIds.has(dependencyId))
      }))
    }
    try {
      const outcome = await onPrepareBatch(request)
      setNoticeResult(outcome.sourceNotice)
      const byId = new Map(outcome.items.map((result) => [result.itemId, result]))
      setResults((current) => {
        const next = { ...current }
        for (const item of selected) {
          next[item.itemId] = byId.get(item.itemId) ?? {
            itemId: item.itemId,
            branchId: item.branchId,
            status: 'unknown',
            message: translate(
              'components.native-chat.taskProposal.missingResult',
              'No result was returned. Check the same prepared thread before trying again.'
            )
          }
        }
        return next
      })
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure)
      setResults((current) =>
        Object.fromEntries([
          ...Object.entries(current),
          ...selected.map((item) => [
            item.itemId,
            { itemId: item.itemId, branchId: item.branchId, status: 'unknown' as const, message }
          ])
        ])
      )
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const pending = items.filter((item) => item.action !== 'reject' && !results[item.itemId])
  const allValid = items.every(validItem)
  const settled = pending.length === 0 && items.some((item) => results[item.itemId])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          onOpenChange(next)
        }
      }}
    >
      <DialogContent
        className="flex max-h-[min(90vh,50rem)] min-w-0 flex-col overflow-hidden sm:max-w-3xl"
        showCloseButton={!busy}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ListTree className="size-4" />
            {translate('components.native-chat.taskProposal.title', 'Prepare related threads')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'components.native-chat.taskProposal.description',
              'Review independently verifiable outcomes. Preparing a thread does not start an agent.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto pr-1 scrollbar-sleek">
          {proposal.truncated ? (
            <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {translate(
                'components.native-chat.taskProposal.truncated',
                'The analysis reached its size limit. Review the targeted context before preparing threads.'
              )}
            </p>
          ) : null}
          {items.map((item, position) => (
            <StructuredTaskProposalItemEditor
              key={item.itemId}
              item={item}
              position={position}
              allItems={items}
              workspaces={workspaces}
              relatedThreads={relatedThreads}
              result={results[item.itemId]}
              disabled={busy}
              onChange={updateItem}
              onMergePrevious={
                position > 0 && Object.keys(results).length === 0
                  ? () => setItems((current) => mergeItems(current, position))
                  : undefined
              }
              onRetry={() => void submit([item])}
            />
          ))}
          {noticeResult ? (
            <div
              className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
              role={noticeResult.status === 'rejected' ? 'alert' : 'status'}
            >
              <div className="flex items-center justify-between gap-3">
                <span>
                  {noticeResult.status === 'accepted'
                    ? translate(
                        'components.native-chat.taskProposal.sourceNotified',
                        'The source conversation was notified about the prepared scope.'
                      )
                    : (noticeResult.message ??
                      translate(
                        'components.native-chat.taskProposal.sourceNoticeUnknown',
                        'The source notification is unconfirmed. Check it before retrying.'
                      ))}
                </span>
                {noticeResult.status !== 'accepted' ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void submit(items.filter((item) => item.action !== 'reject'))}
                  >
                    {translate('components.native-chat.taskProposal.retryNotice', 'Retry notice')}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {settled
              ? translate('components.native-chat.taskProposal.done', 'Done')
              : translate('components.native-chat.taskProposal.cancel', 'Cancel')}
          </Button>
          {!settled ? (
            <Button
              type="button"
              disabled={busy || !allValid || pending.length === 0}
              onClick={() => void submit(pending)}
            >
              {busy
                ? translate('components.native-chat.taskProposal.preparing', 'Preparing…')
                : translate('components.native-chat.taskProposal.prepare', 'Prepare threads')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function StructuredTaskProposalEditor(
  props: StructuredTaskProposalEditorProps
): React.JSX.Element {
  return <StructuredTaskProposalEditorContent key={props.proposal.proposalId} {...props} />
}
