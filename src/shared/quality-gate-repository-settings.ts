import {
  normalizeQualityGateFeedbackLoopSettings,
  type QualityGateFeedbackLoopSettings
} from './quality-gate-feedback-loop'
import { normalizeQualityGateDefinitions, type QualityGateDefinition } from './quality-gate-types'

/** What a repository row holds about its gates, as the host that keeps the row stored it. */
export type QualityGateRepositorySettings = {
  gates: QualityGateDefinition[]
  feedbackLoop: QualityGateFeedbackLoopSettings
}

/** A field left out is not written and stays as the host has it. */
export type QualityGateRepositorySettingsUpdate = Partial<QualityGateRepositorySettings>

/**
 * The answer of `qualityGates.setRepositorySettings`, read by a client of another build: null when
 * it carries no list of gates, so a reply this build cannot read is never shown as saved.
 */
export function readQualityGateRepositorySettings(
  value: unknown
): QualityGateRepositorySettings | null {
  if (!value || typeof value !== 'object' || !('gates' in value)) {
    return null
  }
  const gates = normalizeQualityGateDefinitions(value.gates)
  if (!gates) {
    return null
  }
  return {
    gates,
    feedbackLoop: normalizeQualityGateFeedbackLoopSettings(
      'feedbackLoop' in value ? value.feedbackLoop : undefined
    )
  }
}
