import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { getAgentLabel } from '@/lib/agent-catalog'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { translate } from '@/i18n/i18n'
import type {
  ConversationContinuationMode,
  ConversationContinuationView
} from '../../../../shared/conversation-continuation-view'

type Props = {
  view: ConversationContinuationView | null
  busy: boolean
  pending: boolean
  compact?: boolean
  error: string | null
  readError: string | null
  onChoose: (mode: ConversationContinuationMode) => void
  targetAgent: TuiAgent
  agents: TuiAgent[]
  detecting: boolean
  onAgentChange: (agent: TuiAgent) => void
}

function Choice({
  label,
  description,
  disabled,
  tag,
  onClick
}: {
  label: string
  description: string
  disabled?: boolean
  tag?: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto w-full min-w-0 flex-col items-start gap-0.5 whitespace-normal px-2 py-2 text-left"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="text-xs font-medium">{label}</span>
      {tag ? (
        <Badge variant="secondary" className="text-xs font-normal">
          {tag}
        </Badge>
      ) : null}
      <span className="text-xs font-normal text-muted-foreground">{description}</span>
    </Button>
  )
}

export function ConversationContinuationChoices({
  view,
  busy,
  pending,
  compact,
  error,
  readError,
  onChoose,
  targetAgent,
  agents,
  detecting,
  onAgentChange
}: Props): React.JSX.Element {
  const preparing = view?.candidate?.status === 'preparing'
  const locked = busy || pending
  const otherAgent = targetAgent !== 'codex'
  const ready = view?.candidate?.status === 'ready' && view.candidate.mode !== 'fresh'
  const tag = preparing
    ? translate('continuation.preparing', 'Preparing…')
    : ready
      ? view.candidate?.compactionOrigin === 'automatic'
        ? translate('continuation.readyAutomatically', 'Prepared automatically')
        : translate('continuation.ready', 'Prepared')
      : translate('continuation.compactOnStart', 'Compacts on start')
  return (
    <div className="w-[min(22rem,calc(100vw-1rem))] max-h-[min(28rem,var(--radix-popover-content-available-height))] space-y-1 overflow-y-auto p-2 scrollbar-sleek">
      <div className="space-y-1 px-2 py-2">
        <p className="text-xs text-muted-foreground">
          {translate('continuation.targetAgent', 'Target agent')}
        </p>
        <Select
          value={targetAgent}
          disabled={pending || detecting}
          onValueChange={(value) => onAgentChange(value as TuiAgent)}
        >
          <SelectTrigger
            aria-label={translate('continuation.targetAgent', 'Target agent')}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agents.map((agent) => (
              <SelectItem key={agent} value={agent}>
                {getAgentLabel(agent)}
                {agent === 'codex'
                  ? translate('continuation.currentAgentSuffix', ' · current')
                  : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {detecting ? (
          <p role="status" className="text-xs text-muted-foreground">
            {translate('continuation.detectingAgents', 'Finding agents on this host…')}
          </p>
        ) : null}
      </div>
      <Choice
        label={
          otherAgent
            ? translate('continuation.compactAndReference', 'Compact and pass a reference')
            : translate('continuation.continueCompacted', 'Continue with compacted context')
        }
        tag={
          view?.candidate?.status === 'used'
            ? translate('continuation.selected', 'Copy selected')
            : tag
        }
        description={
          otherAgent
            ? translate(
                'continuation.compactReferenceDescription',
                'The original agent compacts the conversation. The selected agent receives a reference to that copy.'
              )
            : translate(
                'continuation.compactDescription',
                'Start a new session with compacted context. Preparation uses model tokens.'
              )
        }
        disabled={locked || preparing || !view?.checkpoint || view?.candidate?.status === 'used'}
        onClick={() => onChoose('compacted')}
      />
      <Choice
        label={translate('continuation.reference', 'New with reference')}
        description={translate(
          'continuation.referenceDescription',
          'Start a new session with a reference to this conversation.'
        )}
        disabled={locked || !view?.checkpoint}
        onClick={() => onChoose('reference')}
      />
      <Choice
        label={translate('continuation.emptyConversation', 'Empty conversation')}
        description={translate(
          'continuation.freshDescription',
          'Start without the context of this conversation.'
        )}
        disabled={locked}
        onClick={() => onChoose('fresh')}
      />
      {busy ? (
        <p className="px-2 text-xs text-muted-foreground">
          {translate('continuation.busy', 'Finish or stop the current turn before switching.')}
        </p>
      ) : compact ? (
        <p className="px-2 text-xs text-muted-foreground">
          {translate(
            'continuation.draft',
            'Switching may discard the message being typed. The original conversation is preserved.'
          )}
        </p>
      ) : null}
      {view?.candidate?.status === 'used' ? (
        <p className="px-2 text-xs text-muted-foreground">
          {translate(
            'continuation.recover',
            'This copy has already been selected. If switching was interrupted, reopen it from Session History.'
          )}
        </p>
      ) : null}
      {error || readError ? (
        <p role="alert" className="px-2 text-xs text-destructive">
          {error ?? readError}
        </p>
      ) : null}
      {view?.candidate?.error && !error ? (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          {view.candidate.error}
        </p>
      ) : null}
    </div>
  )
}
