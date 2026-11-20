import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Switch } from '../ui/switch'
import {
  QUALITY_GATE_FEEDBACK_LOOP_TONE_CLASS,
  type QualityGateFeedbackLoopReading
} from './quality-gate-feedback-loop-view'

type WorkspaceQualityGateFeedbackLoopProps = {
  reading: QualityGateFeedbackLoopReading
  /** The host cannot be asked: it did not answer. */
  disabled: boolean
  /** Resolves true once the host took the change, false when it did not. */
  onToggle: (enabled: boolean) => Promise<boolean>
}

/**
 * The feedback loop of the active workspace: what it is doing, and the switch that turns it off
 * here. Off stops a chain in progress; the repository setting stays as it is.
 */
export function WorkspaceQualityGateFeedbackLoop({
  reading,
  disabled,
  onToggle
}: WorkspaceQualityGateFeedbackLoopProps): React.JSX.Element {
  // Why: the switch holds what was asked for until a status read shows the host took it, so a
  // remote host's round trip does not flip it back for a moment.
  const [requested, setRequested] = useState<{ enabled: boolean; taken: boolean } | null>(null)
  const hostEnabled = !reading.loop.workspaceDisabled
  if (requested?.taken && requested.enabled === hostEnabled) {
    setRequested(null)
  }
  const toggle = (enabled: boolean): void => {
    setRequested({ enabled, taken: false })
    void onToggle(enabled).then((taken) => setRequested(taken ? { enabled, taken } : null))
  }
  return (
    <div
      className="space-y-0.5 border-b border-border/50 pb-2"
      data-workspace-quality-gate-feedback-loop={reading.tone}
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">
          {translate('qualityGates.loopTitle', 'Feedback loop')}
        </span>
        <Switch
          checked={requested?.enabled ?? hostEnabled}
          disabled={disabled || (requested !== null && !requested.taken)}
          aria-label={translate(
            'qualityGates.loopWorkspaceSwitch',
            'Feedback loop in this workspace'
          )}
          onCheckedChange={toggle}
        />
      </div>
      <p
        className={cn('text-xs select-text', QUALITY_GATE_FEEDBACK_LOOP_TONE_CLASS[reading.tone])}
        data-workspace-quality-gate-feedback-loop-state
      >
        {reading.text}
      </p>
    </div>
  )
}
