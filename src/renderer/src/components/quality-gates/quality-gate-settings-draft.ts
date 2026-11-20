import { qualityGateIdFromName } from '../../../../shared/quality-gate-id'
import {
  QUALITY_GATE_LIMITS,
  type QualityGateDefinition
} from '../../../../shared/quality-gate-types'

export { qualityGateIdFromName }

/** The form's text of one gate; `id` is null until the gate is first saved. */
export type QualityGateDraft = {
  id: string | null
  name: string
  command: string
  required: boolean
  timeoutSeconds: string
}

export type QualityGateDraftErrors = {
  name?: 'empty' | 'too-long' | 'duplicate'
  command?: 'empty' | 'too-long'
  timeoutSeconds?: 'invalid'
}

export function newQualityGateDraft(): QualityGateDraft {
  return {
    id: null,
    name: '',
    command: '',
    required: true,
    timeoutSeconds: String(QUALITY_GATE_LIMITS.defaultTimeoutSeconds)
  }
}

export function draftFromQualityGate(gate: QualityGateDefinition): QualityGateDraft {
  return { ...gate, timeoutSeconds: String(gate.timeoutSeconds) }
}

function parseTimeoutSeconds(text: string): number | null {
  const value = /^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN
  return value >= QUALITY_GATE_LIMITS.minTimeoutSeconds &&
    value <= QUALITY_GATE_LIMITS.maxTimeoutSeconds
    ? value
    : null
}

export function validateQualityGateDraft(
  draft: QualityGateDraft,
  gates: readonly QualityGateDefinition[]
): QualityGateDraftErrors {
  const errors: QualityGateDraftErrors = {}
  const name = draft.name.trim()
  if (!name) {
    errors.name = 'empty'
  } else if (name.length > QUALITY_GATE_LIMITS.maxNameLength) {
    errors.name = 'too-long'
  } else if (
    // Why: `orca gates run <name>` needs a name to pick out one gate.
    gates.some((gate) => gate.id !== draft.id && gate.name.toLowerCase() === name.toLowerCase())
  ) {
    errors.name = 'duplicate'
  }
  if (!draft.command.trim()) {
    errors.command = 'empty'
  } else if (draft.command.length > QUALITY_GATE_LIMITS.maxCommandLength) {
    errors.command = 'too-long'
  }
  if (parseTimeoutSeconds(draft.timeoutSeconds) === null) {
    errors.timeoutSeconds = 'invalid'
  }
  return errors
}

/** The list with a valid draft added at the end or put in place of the gate it edits. */
export function applyQualityGateDraft(
  gates: readonly QualityGateDefinition[],
  draft: QualityGateDraft
): QualityGateDefinition[] {
  const timeoutSeconds = parseTimeoutSeconds(draft.timeoutSeconds)
  if (timeoutSeconds === null) {
    return [...gates]
  }
  const saved: QualityGateDefinition = {
    id: draft.id ?? qualityGateIdFromName(draft.name, new Set(gates.map((gate) => gate.id))),
    name: draft.name.trim(),
    command: draft.command.trim(),
    required: draft.required,
    timeoutSeconds
  }
  return draft.id === null
    ? [...gates, saved]
    : gates.map((gate) => (gate.id === draft.id ? saved : gate))
}

export function moveQualityGate(
  gates: readonly QualityGateDefinition[],
  gateId: string,
  direction: -1 | 1
): QualityGateDefinition[] {
  const from = gates.findIndex((gate) => gate.id === gateId)
  const to = from + direction
  if (from === -1 || to < 0 || to >= gates.length) {
    return [...gates]
  }
  const next = [...gates]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

export function removeQualityGate(
  gates: readonly QualityGateDefinition[],
  gateId: string
): QualityGateDefinition[] {
  return gates.filter((gate) => gate.id !== gateId)
}
