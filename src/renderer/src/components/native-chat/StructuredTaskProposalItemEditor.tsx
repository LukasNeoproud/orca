import { GitMerge, Link2 } from 'lucide-react'
import type {
  StructuredTaskProposalItem,
  StructuredTaskProposalItemResult,
  StructuredTaskProposalRelatedThread,
  StructuredTaskProposalWorkspace
} from '../../../../shared/structured-task-proposal'
import { formatStructuredTaskProposalHandoff } from '../../../../shared/structured-task-proposal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'

type Props = {
  item: StructuredTaskProposalItem
  position: number
  allItems: readonly StructuredTaskProposalItem[]
  workspaces: readonly StructuredTaskProposalWorkspace[]
  relatedThreads: readonly StructuredTaskProposalRelatedThread[]
  result?: StructuredTaskProposalItemResult
  disabled: boolean
  onChange: (item: StructuredTaskProposalItem) => void
  onMergePrevious?: () => void
  onRetry: () => void
}

const resultCopy = (result: StructuredTaskProposalItemResult): string => {
  if (result.status === 'prepared') {
    return translate('components.native-chat.taskProposal.prepared', 'Prepared')
  }
  if (result.status === 'attached') {
    return translate('components.native-chat.taskProposal.attached', 'Attached')
  }
  if (result.status === 'failed') {
    return translate('components.native-chat.taskProposal.failed', 'Failed')
  }
  return translate('components.native-chat.taskProposal.unknown', 'Status unknown')
}

export function StructuredTaskProposalItemEditor({
  item,
  position,
  allItems,
  workspaces,
  relatedThreads,
  result,
  disabled,
  onChange,
  onMergePrevious,
  onRetry
}: Props): React.JSX.Element {
  const locked = disabled || Boolean(result)
  const update = (patch: Partial<StructuredTaskProposalItem>): void =>
    onChange({ ...item, ...patch })
  const availableThreads = relatedThreads.filter(
    (thread) => thread.workspaceId === item.workspaceId
  )
  return (
    <section
      className="rounded-lg border border-border bg-card p-3 shadow-xs"
      aria-label={`Proposal ${position + 1}`}
    >
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[10px] text-muted-foreground">
          {position + 1}
        </span>
        <div className="min-w-0 flex-1">
          <Input
            aria-label={translate('components.native-chat.taskProposal.name', 'Name')}
            value={item.name}
            disabled={locked}
            onChange={(event) => update({ name: event.target.value })}
            className="h-8 font-medium"
          />
          {item.uncertain ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {translate(
                'components.native-chat.taskProposal.needsVerification',
                'Unconfirmed finding — this thread starts with verification.'
              )}
            </p>
          ) : null}
        </div>
        {result ? <Badge variant="outline">{resultCopy(result)}</Badge> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">
            {translate('components.native-chat.taskProposal.action', 'Action')}
          </Label>
          <Select
            value={item.action}
            disabled={locked}
            onValueChange={(value) =>
              update({
                action: value as StructuredTaskProposalItem['action'],
                targetSessionId: undefined
              })
            }
          >
            <SelectTrigger
              aria-label={translate('components.native-chat.taskProposal.action', 'Action')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="prepare">
                {translate(
                  'components.native-chat.taskProposal.prepareThread',
                  'Prepare new thread'
                )}
              </SelectItem>
              <SelectItem value="attach">
                {translate(
                  'components.native-chat.taskProposal.attachThread',
                  'Attach related thread'
                )}
              </SelectItem>
              <SelectItem value="reject">
                {translate('components.native-chat.taskProposal.rejectPart', 'Reject this part')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            {translate('components.native-chat.taskProposal.workspace', 'Workspace')}
          </Label>
          <Select
            value={item.workspaceId}
            disabled={locked}
            onValueChange={(workspaceId) => update({ workspaceId, targetSessionId: undefined })}
          >
            <SelectTrigger
              aria-label={translate('components.native-chat.taskProposal.workspace', 'Workspace')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.workspaceId} value={workspace.workspaceId}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {item.action === 'attach' ? (
        <div className="mt-3 space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Link2 className="size-3" />
            {translate('components.native-chat.taskProposal.relatedThread', 'Related thread')}
          </Label>
          <Select
            value={item.targetSessionId}
            disabled={locked}
            onValueChange={(targetSessionId) => update({ targetSessionId })}
          >
            <SelectTrigger
              aria-label={translate(
                'components.native-chat.taskProposal.relatedThread',
                'Related thread'
              )}
            >
              <SelectValue
                placeholder={translate(
                  'components.native-chat.taskProposal.chooseThread',
                  'Choose a thread'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {availableThreads.map((thread) => (
                <SelectItem key={thread.sessionId} value={thread.sessionId}>
                  {thread.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {item.action !== 'reject' ? (
        <>
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs">
              {translate('components.native-chat.taskProposal.scope', 'Scope')}
            </Label>
            <Textarea
              aria-label={translate('components.native-chat.taskProposal.scope', 'Scope')}
              value={item.scope}
              disabled={locked}
              rows={3}
              onChange={(event) => update({ scope: event.target.value })}
            />
          </div>
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs">
              {translate(
                'components.native-chat.taskProposal.verification',
                'Expected verification'
              )}
            </Label>
            <Textarea
              aria-label={translate(
                'components.native-chat.taskProposal.verification',
                'Expected verification'
              )}
              value={item.verification}
              disabled={locked}
              rows={2}
              onChange={(event) => update({ verification: event.target.value })}
            />
          </div>
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs">
              {translate('components.native-chat.taskProposal.targetedContext', 'Targeted context')}
            </Label>
            <Textarea
              aria-label={translate(
                'components.native-chat.taskProposal.targetedContext',
                'Targeted context'
              )}
              value={item.context.content}
              disabled={locked}
              rows={4}
              className="font-mono text-xs"
              onChange={(event) =>
                update({ context: { ...item.context, content: event.target.value } })
              }
            />
            <p className="text-[11px] text-muted-foreground">
              {translate(
                'components.native-chat.taskProposal.sourcePassages',
                '{{value0}} source passage(s)',
                { value0: item.context.sourceItemIds.length }
              )}
            </p>
            <details className="rounded-md border border-border px-2.5 py-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                {translate(
                  'components.native-chat.taskProposal.exactHandoff',
                  'Exact handoff preview'
                )}
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs scrollbar-sleek">
                {formatStructuredTaskProposalHandoff(item)}
              </pre>
            </details>
          </div>
          <fieldset className="mt-3 space-y-1.5" disabled={locked}>
            <legend className="text-xs font-medium">
              {translate('components.native-chat.taskProposal.dependencies', 'Depends on')}
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {allItems
                .filter(
                  (candidate) => candidate.itemId !== item.itemId && candidate.action !== 'reject'
                )
                .map((candidate) => {
                  const checked = item.dependencyIds.includes(candidate.itemId)
                  return (
                    <label
                      key={candidate.itemId}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          update({
                            dependencyIds: next
                              ? [...item.dependencyIds, candidate.itemId]
                              : item.dependencyIds.filter((id) => id !== candidate.itemId)
                          })
                        }
                      />
                      <span className="max-w-48 truncate">{candidate.name}</span>
                    </label>
                  )
                })}
            </div>
          </fieldset>
        </>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
        {onMergePrevious && !result ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            onClick={onMergePrevious}
          >
            <GitMerge className="size-3.5" />
            {translate('components.native-chat.taskProposal.mergePrevious', 'Merge with previous')}
          </Button>
        ) : (
          <span />
        )}
        {result?.status === 'failed' || result?.status === 'unknown' ? (
          <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={onRetry}>
            {result.status === 'unknown'
              ? translate('components.native-chat.taskProposal.checkAgain', 'Check / retry')
              : translate('components.native-chat.taskProposal.retry', 'Retry')}
          </Button>
        ) : null}
      </div>
      {result?.message ? (
        <p
          className="mt-2 text-xs text-muted-foreground"
          role={result.status === 'failed' ? 'alert' : undefined}
        >
          {result.message}
        </p>
      ) : null}
    </section>
  )
}
