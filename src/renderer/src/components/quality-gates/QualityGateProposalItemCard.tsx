import { translate } from '@/i18n/i18n'
import { QUALITY_GATE_LIMITS } from '../../../../shared/quality-gate-types'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import type {
  QualityGateProposalEntry,
  QualityGateProposalField
} from './quality-gate-proposal-view'

type QualityGateProposalItemCardProps = {
  entry: QualityGateProposalEntry
  busy: boolean
  onAccept: () => void
  onEdit: () => void
  onDismiss: () => void
}

function requiredLabel(required: boolean): string {
  return required
    ? translate('qualityGates.required', 'Required')
    : translate('qualityGates.optional', 'Optional')
}

function limitLabel(seconds: number): string {
  return translate('qualityGates.timeLimit', 'Limit {{value0}} s', { value0: seconds })
}

/** One changed field: what is in force and what the item would put there. */
function ChangedField({
  entry,
  field
}: {
  entry: QualityGateProposalEntry
  field: Exclude<QualityGateProposalField, 'command'>
}): React.JSX.Element | null {
  const { current, item } = entry
  if (!current) {
    return null
  }
  // Only a name needs a label; the other values say what they are.
  const [label, before, after] =
    field === 'name'
      ? [translate('qualityGates.nameLabel', 'Name'), current.name, item.name]
      : field === 'required'
        ? [null, requiredLabel(current.required), requiredLabel(item.required)]
        : [null, limitLabel(current.timeoutSeconds), limitLabel(item.timeoutSeconds)]
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
      {label ? <span className="text-muted-foreground">{label}</span> : null}
      <span className="text-muted-foreground line-through select-text">{before}</span>
      <span aria-hidden>→</span>
      <span className="sr-only">{translate('qualityGates.proposalChangesTo', 'changes to')}</span>
      <span className="select-text">{after}</span>
    </div>
  )
}

function Command({ text }: { text: string }): React.JSX.Element {
  return (
    <pre className="scrollbar-sleek max-h-24 overflow-auto font-mono text-xs whitespace-pre-wrap break-words select-text">
      {text}
    </pre>
  )
}

function Note({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p role="status" className="text-xs text-muted-foreground">
      {children}
    </p>
  )
}

/**
 * One item of a proposal as a difference against the gate in force. Its text came from an agent,
 * so it is shown as written and never as a gate that already runs.
 */
export function QualityGateProposalItemCard({
  entry,
  busy,
  onAccept,
  onEdit,
  onDismiss
}: QualityGateProposalItemCardProps): React.JSX.Element {
  const { item, current, changed, conflict } = entry
  const commandChanged = changed.includes('command')

  return (
    <div
      className="space-y-2 rounded-xl border border-dashed border-border bg-background/60 px-4 py-3"
      data-quality-gate-proposal-item={item.id}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant="outline">
              {current
                ? translate('qualityGates.proposalKindChange', 'Change')
                : translate('qualityGates.proposalKindNew', 'New')}
            </Badge>
            <h5 className="min-w-0 truncate text-sm font-medium select-text">{item.name}</h5>
            <Badge variant={item.required ? 'secondary' : 'outline'}>
              {requiredLabel(item.required)}
            </Badge>
            <span className="text-2xs text-muted-foreground">
              {limitLabel(item.timeoutSeconds)}
            </span>
            {current ? (
              <span className="font-mono text-2xs text-muted-foreground">{current.id}</span>
            ) : null}
          </div>
          {current && commandChanged ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {translate('qualityGates.proposalCommandNow', 'Command now')}
              </p>
              <div className="text-muted-foreground line-through">
                <Command text={current.command} />
              </div>
              <p className="text-xs text-muted-foreground">
                {translate('qualityGates.proposalCommandProposed', 'Proposed command')}
              </p>
              <Command text={item.command} />
            </div>
          ) : (
            <div className="text-muted-foreground">
              <Command text={item.command} />
            </div>
          )}
          {(['name', 'required', 'timeoutSeconds'] as const)
            .filter((field) => changed.includes(field))
            .map((field) => (
              <ChangedField key={field} entry={entry} field={field} />
            ))}
          {item.rationale ? (
            <p className="text-xs">
              <span className="text-muted-foreground">
                {translate('qualityGates.proposalReasonLabel', 'Reason given:')}
              </span>{' '}
              <span className="whitespace-pre-wrap break-words select-text">{item.rationale}</span>
            </p>
          ) : null}
          {current && changed.length === 0 ? (
            <Note>{translate('qualityGates.proposalUnchanged', 'Same as the gate in force.')}</Note>
          ) : null}
          {entry.targetGone ? (
            <Note>
              {translate(
                'qualityGates.proposalTargetGone',
                'The gate this would change was removed. Accepting adds it as a new gate.'
              )}
            </Note>
          ) : null}
          {conflict === 'duplicate-name' ? (
            <Note>
              {translate(
                'qualityGates.proposalNameTaken',
                'Another gate already has this name. Edit the item to take it.'
              )}
            </Note>
          ) : null}
          {conflict === 'too-many' ? (
            <Note>
              {translate(
                'qualityGates.proposalTooMany',
                'The repository already has {{value0}} gates, the most it can hold.',
                { value0: QUALITY_GATE_LIMITS.maxGates }
              )}
            </Note>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={translate('qualityGates.proposalDismissItem', 'Dismiss {{value0}}', {
              value0: item.name
            })}
            disabled={busy}
            onClick={onDismiss}
          >
            {translate('qualityGates.proposalDismiss', 'Dismiss')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={translate('qualityGates.edit', 'Edit {{value0}}', { value0: item.name })}
            disabled={busy}
            onClick={onEdit}
          >
            {translate('qualityGates.proposalEdit', 'Edit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={translate('qualityGates.proposalAcceptItem', 'Accept {{value0}}', {
              value0: item.name
            })}
            disabled={busy || conflict !== null}
            onClick={onAccept}
          >
            {translate('qualityGates.proposalAccept', 'Accept')}
          </Button>
        </div>
      </div>
    </div>
  )
}
