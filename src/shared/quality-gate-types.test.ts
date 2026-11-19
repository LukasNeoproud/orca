import { describe, expect, it } from 'vitest'
import {
  QUALITY_GATE_LIMITS,
  deriveQualityGateFreshness,
  normalizeQualityGateDefinitions,
  qualityGateRunLiveness,
  type QualityGateSourceState
} from './quality-gate-types'

const gate = { id: 'lint', name: 'Lint', command: 'echo ok', required: true, timeoutSeconds: 60 }

describe('normalizeQualityGateDefinitions', () => {
  it('keeps a well-formed list in order', () => {
    const second = { ...gate, id: 'test', name: 'Tests', required: false }
    expect(normalizeQualityGateDefinitions([gate, second])).toEqual([gate, second])
  })

  it('says a value that is not a list was no list, so the writer keeps what it has', () => {
    expect(normalizeQualityGateDefinitions(undefined)).toBeUndefined()
    expect(normalizeQualityGateDefinitions({ 0: gate })).toBeUndefined()
    expect(normalizeQualityGateDefinitions('echo ok')).toBeUndefined()
  })

  it('drops entries without a usable id, name or command', () => {
    expect(
      normalizeQualityGateDefinitions([
        null,
        'echo',
        { ...gate, id: '' },
        { ...gate, id: 'has space' },
        { ...gate, name: '   ' },
        { ...gate, command: '' },
        { ...gate, command: 'echo \0' },
        { ...gate, name: 'x'.repeat(QUALITY_GATE_LIMITS.maxNameLength + 1) },
        { ...gate, command: 'x'.repeat(QUALITY_GATE_LIMITS.maxCommandLength + 1) }
      ])
    ).toEqual([])
  })

  it('keeps the first of two gates with one id and stops at the limit', () => {
    expect(normalizeQualityGateDefinitions([gate, { ...gate, name: 'Other' }])).toEqual([gate])
    const many = Array.from({ length: QUALITY_GATE_LIMITS.maxGates + 5 }, (_, index) => ({
      ...gate,
      id: `g${index}`
    }))
    expect(normalizeQualityGateDefinitions(many)).toHaveLength(QUALITY_GATE_LIMITS.maxGates)
  })

  it('trims text, defaults to required and clamps the time limit', () => {
    expect(
      normalizeQualityGateDefinitions([
        { id: 'a', name: ' A ', command: ' echo a \n', timeoutSeconds: 1 },
        { id: 'b', name: 'B', command: 'echo b', required: false, timeoutSeconds: 1e9 },
        { id: 'c', name: 'C', command: 'echo c', timeoutSeconds: 'soon' }
      ])
    ).toEqual([
      {
        id: 'a',
        name: 'A',
        command: 'echo a',
        required: true,
        timeoutSeconds: QUALITY_GATE_LIMITS.minTimeoutSeconds
      },
      {
        id: 'b',
        name: 'B',
        command: 'echo b',
        required: false,
        timeoutSeconds: QUALITY_GATE_LIMITS.maxTimeoutSeconds
      },
      {
        id: 'c',
        name: 'C',
        command: 'echo c',
        required: true,
        timeoutSeconds: QUALITY_GATE_LIMITS.defaultTimeoutSeconds
      }
    ])
  })
})

describe('qualityGateRunLiveness', () => {
  it('uses the host verdict vocabulary', () => {
    expect(qualityGateRunLiveness('queued')).toBe('live')
    expect(qualityGateRunLiveness('running')).toBe('live')
    expect(qualityGateRunLiveness('unverifiable')).toBe('unverifiable')
    for (const status of ['passed', 'failed', 'timed-out', 'not-started', 'cancelled'] as const) {
      expect(qualityGateRunLiveness(status)).toBe('exited')
    }
  })
})

describe('deriveQualityGateFreshness', () => {
  const clean: QualityGateSourceState = { head: 'aaa', clean: true, fingerprint: 'f0' }
  const run = { gate: { ...gate }, source: clean }

  it('is current while the commit, the tree and the command are the ones that ran', () => {
    expect(deriveQualityGateFreshness(run, clean, gate)).toEqual({ state: 'current' })
  })

  it('is stale after another commit', () => {
    expect(deriveQualityGateFreshness(run, { ...clean, head: 'bbb' }, gate)).toEqual({
      state: 'stale',
      reasons: ['head-changed']
    })
  })

  it('is stale after a file was edited, also when the tree was already dirty', () => {
    const edited = { head: 'aaa', clean: false, fingerprint: 'f1' }
    expect(deriveQualityGateFreshness(run, edited, gate)).toEqual({
      state: 'stale',
      reasons: ['tree-changed']
    })
    expect(
      deriveQualityGateFreshness({ ...run, source: edited }, { ...edited, fingerprint: 'f2' }, gate)
    ).toEqual({ state: 'stale', reasons: ['tree-changed'] })
  })

  it('is stale once the command was edited or the gate removed', () => {
    expect(deriveQualityGateFreshness(run, clean, { command: 'echo other' })).toEqual({
      state: 'stale',
      reasons: ['gate-changed']
    })
    expect(deriveQualityGateFreshness(run, clean, null)).toEqual({
      state: 'stale',
      reasons: ['gate-changed']
    })
  })

  it('lists every reason', () => {
    expect(
      deriveQualityGateFreshness(run, { head: 'bbb', clean: false, fingerprint: 'f9' }, null)
    ).toEqual({ state: 'stale', reasons: ['head-changed', 'tree-changed', 'gate-changed'] })
  })

  it('is unlinked for a workspace without git', () => {
    const none = { head: null, clean: null, fingerprint: null }
    expect(deriveQualityGateFreshness({ ...run, source: none }, none, gate)).toEqual({
      state: 'unlinked'
    })
  })

  it('is unknown when the tree could not be read then or now', () => {
    const unread = { head: 'aaa', clean: null, fingerprint: null }
    expect(deriveQualityGateFreshness({ ...run, source: unread }, clean, gate)).toEqual({
      state: 'unknown'
    })
    expect(deriveQualityGateFreshness(run, unread, gate)).toEqual({ state: 'unknown' })
    expect(deriveQualityGateFreshness({ ...run, source: null }, clean, gate)).toEqual({
      state: 'unknown'
    })
  })
})
