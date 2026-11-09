import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { startConversationBranchInChat } from '@/lib/conversation-branch-launch'
import { startConversationBranchInTerminal } from '@/lib/conversation-branch-terminal-launch'
import { readConversationBranchOutline } from '@/runtime/conversation-branch-client'
import type {
  ConversationBranchSurface,
  ConversationBranchTurn
} from '../../../../shared/conversation-branch'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { ConversationBranchDialog } from './ConversationBranchDialog'
import { conversationBranchErrorText } from './conversation-branch-error-text'

type Outline =
  | { kind: 'loading' }
  | { kind: 'ready'; turns: ConversationBranchTurn[]; lastReply: string | null }
  | { kind: 'failed'; message: string }

const EXCERPT_MAX = 90

function excerpt(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= EXCERPT_MAX ? line : `${line.slice(0, EXCERPT_MAX - 1).trimEnd()}…`
}

/** Branches a Claude terminal conversation after one of its completed turns. */
export function ConversationBranchTerminalDialog({
  target,
  worktreeId,
  providerSessionId,
  canOpenInChat,
  onClose
}: {
  target: RuntimeClientTarget
  worktreeId: string
  providerSessionId: string
  /** Chat UI can open here, so the branch may open as a chat instead of a terminal. */
  canOpenInChat: boolean
  onClose: () => void
}): React.JSX.Element {
  const [requestId] = useState(newAgentLaunchRequestId)
  const [outline, setOutline] = useState<Outline>({ kind: 'loading' })
  const [chosenUuid, setChosenUuid] = useState<string | null>(null)
  const [output, setOutput] = useState<ConversationBranchSurface>('terminal')

  useEffect(() => {
    let cancelled = false
    readConversationBranchOutline(target, worktreeId, providerSessionId).then(
      (result) =>
        !cancelled &&
        setOutline({ kind: 'ready', turns: result.turns, lastReply: result.lastReply ?? null }),
      (error: unknown) =>
        !cancelled && setOutline({ kind: 'failed', message: conversationBranchErrorText(error) })
    )
    return () => {
      cancelled = true
    }
  }, [target, worktreeId, providerSessionId])

  const turns = outline.kind === 'ready' ? outline.turns : []
  // The latest turn unless another was picked: branching "from here" is the usual ask.
  const turn = turns.find((candidate) => candidate.promptUuid === chosenUuid) ?? turns.at(-1)
  // Only the newest reply comes whole; older ones are excerpts, enough to name the branch.
  const replyMarkdown =
    outline.kind === 'ready' && turn && turn === turns.at(-1) && outline.lastReply
      ? outline.lastReply
      : (turn?.reply ?? '')

  const turnField = (disabled: boolean): React.ReactNode => (
    <div className="space-y-1">
      <Label htmlFor="conversation-branch-turn">
        {translate('conversationBranch.turn', 'Branch after')}
      </Label>
      {outline.kind === 'failed' ? (
        <p role="alert" className="text-xs text-destructive">
          {outline.message}
        </p>
      ) : outline.kind === 'ready' && turns.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'conversationBranch.noTurns',
            'This conversation has no completed reply to branch from yet.'
          )}
        </p>
      ) : (
        <Select
          value={turn?.promptUuid ?? ''}
          disabled={disabled || outline.kind === 'loading'}
          onValueChange={setChosenUuid}
        >
          <SelectTrigger id="conversation-branch-turn" className="w-full">
            <SelectValue
              placeholder={translate(
                'conversationBranch.loadingTurns',
                'Reading the conversation…'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {turns
              .map((candidate, index) => (
                <SelectItem key={candidate.promptUuid} value={candidate.promptUuid}>
                  {`${index + 1}. ${excerpt(candidate.prompt)}`}
                </SelectItem>
              ))
              .toReversed()}
          </SelectContent>
        </Select>
      )}
      {turn ? (
        <p className="line-clamp-3 text-xs text-muted-foreground">{excerpt(turn.reply)}</p>
      ) : null}
    </div>
  )

  const outputField = (disabled: boolean): React.ReactNode =>
    canOpenInChat ? (
      <div className="space-y-1">
        <Label htmlFor="conversation-branch-output">
          {translate('conversationBranch.output', 'Open in')}
        </Label>
        <Select
          value={output}
          disabled={disabled}
          onValueChange={(value) => setOutput(value === 'chat' ? 'chat' : 'terminal')}
        >
          <SelectTrigger id="conversation-branch-output" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="terminal">
              {translate('conversationBranch.outputTerminal', 'A new terminal')}
            </SelectItem>
            <SelectItem value="chat">
              {translate('conversationBranch.outputChat', 'A new chat')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    ) : null

  return (
    <ConversationBranchDialog
      replyMarkdown={replyMarkdown}
      title={translate('conversationBranch.terminalTitle', 'Branch this conversation')}
      description={translate(
        'conversationBranch.terminalDescription',
        'The branch opens with its prompt unsent. Branches share this workspace, so file changes made in one are visible in the others.'
      )}
      leadingFields={turnField}
      trailingFields={outputField}
      onCancel={onClose}
      onCreate={async (values) => {
        if (!turn) {
          throw new Error('conversation_branch_invalid_anchor')
        }
        const request = {
          requestId,
          worktreeId,
          source: { kind: 'transcript' as const, providerSessionId, promptUuid: turn.promptUuid },
          mode: values.mode,
          label: values.label,
          ...(values.mode === 'compact' ? { focus: values.focus } : {}),
          prompt: values.prompt
        }
        await (output === 'chat'
          ? startConversationBranchInChat(target, request)
          : startConversationBranchInTerminal(target, request))
        onClose()
      }}
    />
  )
}
