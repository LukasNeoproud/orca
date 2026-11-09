import { useState } from 'react'
import { Check, GitBranch, Loader2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import type {
  ConversationBranchBatchItem,
  ConversationBranchBatchOutcome
} from '@/lib/conversation-branch-launch'
import {
  CONVERSATION_BRANCH_LABEL_MAX,
  type ConversationBranchMode
} from '../../../../shared/conversation-branch'
import type { ConversationBranchFinding } from '../../../../shared/conversation-branch-findings'
import {
  defaultFindingBranchFocus,
  defaultFindingBranchLabel,
  defaultFindingBranchPrompt
} from './conversation-branch-dialog-defaults'
import { conversationBranchErrorText } from './conversation-branch-error-text'
import { ConversationBranchModeField } from './ConversationBranchModeField'

type FindingRow = {
  finding: ConversationBranchFinding
  selected: boolean
  label: string
  prompt: string
  /** The prompt was typed, so a change of context keeps it. */
  promptEdited: boolean
  requestId: string
  outcome: ConversationBranchBatchOutcome | null
}

function initialRows(findings: readonly ConversationBranchFinding[]): FindingRow[] {
  return findings.map((finding) => ({
    finding,
    selected: true,
    label: defaultFindingBranchLabel(finding),
    prompt: defaultFindingBranchPrompt(finding, 'full'),
    promptEdited: false,
    requestId: newAgentLaunchRequestId(),
    outcome: null
  }))
}

/** One branch per finding of a reply. Every branch opens with its prompt unsent: nothing starts. */
export function ConversationBranchBatchDialog({
  findings,
  onCancel,
  onCreate
}: {
  findings: readonly ConversationBranchFinding[]
  onCancel: () => void
  onCreate: (
    mode: ConversationBranchMode,
    items: ConversationBranchBatchItem[],
    onOutcome: (index: number, outcome: ConversationBranchBatchOutcome) => void
  ) => Promise<void>
}): React.JSX.Element {
  const [mode, setMode] = useState<ConversationBranchMode>('full')
  const [rows, setRows] = useState(() => initialRows(findings))
  const [pending, setPending] = useState(false)
  const update = (index: number, patch: Partial<FindingRow>): void =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)))
  const chooseMode = (next: ConversationBranchMode): void => {
    setMode(next)
    setRows((current) =>
      current.map((row) =>
        row.promptEdited ? row : { ...row, prompt: defaultFindingBranchPrompt(row.finding, next) }
      )
    )
  }
  const todo = rows.flatMap((row, index) =>
    row.selected && row.outcome?.kind !== 'created' && row.label.trim() ? [{ row, index }] : []
  )
  const create = async (): Promise<void> => {
    setPending(true)
    const outcomes = new Map<number, ConversationBranchBatchOutcome>()
    await onCreate(
      mode,
      todo.map(({ row }) => ({
        requestId: row.requestId,
        label: row.label.trim(),
        prompt: row.prompt,
        focus: defaultFindingBranchFocus(row.finding)
      })),
      (position, outcome) => {
        const index = todo[position]?.index
        if (index !== undefined) {
          outcomes.set(index, outcome)
          update(index, { outcome })
        }
      }
    )
    setPending(false)
    if ([...outcomes.values()].every((outcome) => outcome.kind === 'created')) {
      onCancel()
    }
  }
  const failed = rows.some((row) => row.outcome?.kind === 'failed')

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate('conversationBranch.batchTitle', 'Branch per finding')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'conversationBranch.batchDescription',
              'Each finding gets its own chat, opened beside this one with its prompt unsent. Nothing starts until you send it. Branches share this workspace, so finish one before you send the next.'
            )}
          </DialogDescription>
        </DialogHeader>
        <ConversationBranchModeField mode={mode} disabled={pending} onChange={chooseMode} />
        <ul className="max-h-[50vh] space-y-3 overflow-y-auto pr-1 scrollbar-sleek">
          {rows.map((row, index) => {
            const created = row.outcome?.kind === 'created'
            return (
              <li key={row.requestId} className="flex gap-2">
                <Checkbox
                  className="mt-2"
                  checked={row.selected}
                  disabled={pending || created}
                  aria-label={row.label}
                  onCheckedChange={(checked) => update(index, { selected: checked === true })}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={row.label}
                      maxLength={CONVERSATION_BRANCH_LABEL_MAX}
                      disabled={pending || created || !row.selected}
                      aria-label={translate('conversationBranch.label', 'Name')}
                      onChange={(event) => update(index, { label: event.target.value })}
                    />
                    {created ? <Check className="size-4 shrink-0 text-status-success" /> : null}
                  </div>
                  <Textarea
                    className="min-h-14"
                    rows={2}
                    value={row.prompt}
                    disabled={pending || created || !row.selected}
                    aria-label={translate('conversationBranch.prompt', 'Prompt')}
                    onChange={(event) =>
                      update(index, { prompt: event.target.value, promptEdited: true })
                    }
                  />
                  {row.outcome?.kind === 'failed' ? (
                    <p role="alert" className="text-xs text-destructive">
                      {conversationBranchErrorText(row.outcome.error)}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            {failed
              ? translate('conversationBranch.close', 'Close')
              : translate('conversationBranch.cancel', 'Cancel')}
          </Button>
          <Button disabled={pending || todo.length === 0} onClick={() => void create()}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GitBranch className="size-4" />
            )}
            {failed
              ? translate('conversationBranch.batchRetry', 'Retry {{value0}}', {
                  value0: todo.length
                })
              : translate('conversationBranch.batchCreate', 'Create {{value0}} branches', {
                  value0: todo.length
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
