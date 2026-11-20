import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import {
  QUALITY_GATE_FEEDBACK_LOOP_LIMITS,
  normalizeQualityGateFeedbackLoopSettings,
  type QualityGateFeedbackLoopSettings
} from '../../../../shared/quality-gate-feedback-loop'
import type { QualityGateDefinition } from '../../../../shared/quality-gate-types'
import type { Repo } from '../../../../shared/repo-types'
import { NumberField, SettingsSwitchRow } from '../settings/SettingsFormControls'

type RepositoryQualityGateFeedbackLoopSettingsProps = {
  repo: Repo
  gates: readonly QualityGateDefinition[]
  updateRepo: (
    repoId: string,
    updates: { qualityGateFeedbackLoop: QualityGateFeedbackLoopSettings }
  ) => void | Promise<boolean>
}

/**
 * The repository's switch and round limit of the feedback loop. Written by this window only, like
 * the gates, because turning it on spends the user's tokens.
 */
export function RepositoryQualityGateFeedbackLoopSettings({
  repo,
  gates,
  updateRepo
}: RepositoryQualityGateFeedbackLoopSettingsProps): React.JSX.Element {
  const settings = normalizeQualityGateFeedbackLoopSettings(repo.qualityGateFeedbackLoop)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const { minRounds, maxRounds, defaultRounds } = QUALITY_GATE_FEEDBACK_LOOP_LIMITS

  const save = async (next: QualityGateFeedbackLoopSettings): Promise<void> => {
    setSaving(true)
    setSaveFailed(false)
    try {
      setSaveFailed((await updateRepo(repo.id, { qualityGateFeedbackLoop: next })) === false)
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-border/50" data-quality-gate-feedback-loop-settings={repo.id}>
      <SettingsSwitchRow
        label={translate('qualityGates.loopTitle', 'Feedback loop')}
        description={translate(
          'qualityGates.loopSettingDescription',
          "After an agent finishes a step, Orca runs the required gates and sends what failed back to the agent to fix. Each message uses the agent's tokens."
        )}
        checked={settings.enabled}
        disabled={saving}
        onChange={() => void save({ ...settings, enabled: !settings.enabled })}
      />
      {settings.enabled ? (
        <NumberField
          label={translate('qualityGates.loopRoundsLabel', 'Rounds')}
          description={translate(
            'qualityGates.loopRoundsDescription',
            'How many times the failures are sent back before they are left to you.'
          )}
          value={settings.maxRounds}
          defaultValue={defaultRounds}
          min={minRounds}
          max={maxRounds}
          integer
          disabled={saving}
          onChange={(rounds) =>
            rounds === settings.maxRounds
              ? undefined
              : void save({ ...settings, maxRounds: rounds })
          }
        />
      ) : null}
      {settings.enabled && !gates.some((gate) => gate.required) ? (
        <p role="status" className="pb-2 text-xs text-muted-foreground">
          {translate(
            'qualityGates.loopNoRequiredGate',
            'No gate is required, so the loop has nothing to run.'
          )}
        </p>
      ) : null}
      {saveFailed ? (
        <p role="alert" className="pb-2 text-xs text-destructive">
          {translate(
            'qualityGates.loopSaveFailed',
            'The feedback loop setting could not be saved.'
          )}
        </p>
      ) : null}
    </div>
  )
}
