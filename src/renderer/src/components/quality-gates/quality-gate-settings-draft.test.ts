import { describe, expect, it } from 'vitest'
import {
  QUALITY_GATE_LIMITS,
  normalizeQualityGateDefinitions,
  type QualityGateDefinition
} from '../../../../shared/quality-gate-types'
import {
  applyQualityGateDraft,
  draftFromQualityGate,
  moveQualityGate,
  newQualityGateDraft,
  qualityGateIdFromName,
  removeQualityGate,
  validateQualityGateDraft
} from './quality-gate-settings-draft'

const lint: QualityGateDefinition = {
  id: 'lint',
  name: 'Lint',
  command: 'echo lint',
  required: true,
  timeoutSeconds: 600
}
const tests: QualityGateDefinition = { ...lint, id: 'unit-tests', name: 'Unit tests' }
const build: QualityGateDefinition = { ...lint, id: 'build', name: 'Build' }

describe('quality gate settings draft', () => {
  it('starts a new gate as required with the default time limit', () => {
    expect(newQualityGateDraft()).toEqual({
      id: null,
      name: '',
      command: '',
      required: true,
      timeoutSeconds: String(QUALITY_GATE_LIMITS.defaultTimeoutSeconds)
    })
  })

  it('adds a gate at the end with an id made from its name', () => {
    const next = applyQualityGateDraft([lint], {
      ...newQualityGateDraft(),
      name: '  Unit tests ',
      command: ' pnpm test\n',
      required: false,
      timeoutSeconds: '90'
    })
    expect(next).toEqual([
      lint,
      {
        id: 'unit-tests',
        name: 'Unit tests',
        command: 'pnpm test',
        required: false,
        timeoutSeconds: 90
      }
    ])
    // What the form saves is what the host accepts unchanged.
    expect(normalizeQualityGateDefinitions(next)).toEqual(next)
  })

  it('edits a gate in place and keeps its id when it is renamed', () => {
    const next = applyQualityGateDraft([lint, tests], {
      ...draftFromQualityGate(tests),
      name: 'All tests',
      timeoutSeconds: '1200'
    })
    expect(next).toEqual([lint, { ...tests, name: 'All tests', timeoutSeconds: 1200 }])
  })

  it('makes ids that are unique and typable', () => {
    expect(qualityGateIdFromName('Lint & Format!', new Set())).toBe('lint-format')
    expect(qualityGateIdFromName('Lint', new Set(['lint', 'lint-2']))).toBe('lint-3')
    expect(qualityGateIdFromName('検査', new Set())).toBe('gate')
    expect(qualityGateIdFromName('x'.repeat(200), new Set())).toHaveLength(40)
  })

  it('reorders and removes gates', () => {
    const gates = [lint, tests, build]
    expect(moveQualityGate(gates, 'build', -1).map((gate) => gate.id)).toEqual([
      'lint',
      'build',
      'unit-tests'
    ])
    expect(moveQualityGate(gates, 'lint', 1).map((gate) => gate.id)).toEqual([
      'unit-tests',
      'lint',
      'build'
    ])
    expect(moveQualityGate(gates, 'lint', -1)).toEqual(gates)
    expect(moveQualityGate(gates, 'build', 1)).toEqual(gates)
    expect(removeQualityGate(gates, 'unit-tests')).toEqual([lint, build])
  })

  it('names what is wrong with a draft', () => {
    const valid = { ...newQualityGateDraft(), name: 'Build', command: 'make' }
    expect(validateQualityGateDraft(valid, [lint])).toEqual({})
    expect(validateQualityGateDraft({ ...valid, name: ' ' }, [])).toEqual({ name: 'empty' })
    expect(validateQualityGateDraft({ ...valid, name: 'x'.repeat(81) }, [])).toEqual({
      name: 'too-long'
    })
    expect(validateQualityGateDraft({ ...valid, name: 'lint' }, [lint])).toEqual({
      name: 'duplicate'
    })
    expect(validateQualityGateDraft({ ...valid, command: '\n' }, [])).toEqual({ command: 'empty' })
    expect(validateQualityGateDraft({ ...valid, command: 'x'.repeat(4001) }, [])).toEqual({
      command: 'too-long'
    })
    for (const timeoutSeconds of ['', '4', '14401', '1.5', 'ten', '-30']) {
      expect(validateQualityGateDraft({ ...valid, timeoutSeconds }, [])).toEqual({
        timeoutSeconds: 'invalid'
      })
    }
  })

  it('lets a gate keep its own name while it is edited', () => {
    expect(validateQualityGateDraft(draftFromQualityGate(lint), [lint, tests])).toEqual({})
  })

  it('leaves the list alone when the time limit is not a number', () => {
    expect(
      applyQualityGateDraft([lint], { ...newQualityGateDraft(), timeoutSeconds: 'x' })
    ).toEqual([lint])
  })
})
