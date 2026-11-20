import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  callMock,
  runtimeClientConstructorMock,
  serveOrcaAppMock,
  getDefaultUserDataPathMock,
  addEnvironmentFromPairingCodeMock,
  listEnvironmentsMock,
  spawnMock
} = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveOrcaAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data'),
  addEnvironmentFromPairingCodeMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('./runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('./index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

vi.mock('./runtime/environments', () => ({
  addEnvironmentFromPairingCode: addEnvironmentFromPairingCodeMock,
  listEnvironments: listEnvironmentsMock,
  removeEnvironment: vi.fn(),
  resolveEnvironment: vi.fn()
}))

vi.mock('child_process', async () => {
  const { createChildProcessModuleMock } = await import('./index-test-harness.js')
  return createChildProcessModuleMock(spawnMock)
})

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from './index'
import { useWorktreeAwarenessEnvironment } from './index-test-harness'
import { GATE_WORKTREE as worktree } from './quality-gate-cli-test-fixtures'
import { RuntimeClientError } from './runtime/types'
import { COMMAND_SPECS } from './specs'
import { okFixture } from './test-fixtures'

const gates = [
  { name: 'Lint', command: 'pnpm lint', rationale: 'oxlint is set up' },
  { gateId: 'test', name: 'Unit tests', command: 'pnpm test', required: false, timeoutSeconds: 900 }
]

/** A host that stores what it is sent, as `qualityGates.propose` answers. */
function mockHost() {
  callMock.mockImplementation(async (method: string, params: { gates: typeof gates }) => {
    if (method !== 'qualityGates.propose') {
      throw new Error(`unexpected ${method}`)
    }
    return okFixture('propose', {
      proposal: {
        id: 'p1',
        repoId: 'repo',
        worktreeId: 'repo::/tmp/api',
        proposedAt: 1_000,
        proposedBy: { kind: 'local-cli' },
        items: params.gates.map((gate, index) => ({
          required: true,
          timeoutSeconds: 600,
          ...gate,
          id: `item-${index + 1}`
        }))
      }
    })
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

const printed = (): string =>
  vi
    .mocked(console.log)
    .mock.calls.map((call) => call[0])
    .join('\n')

describe('gates propose', () => {
  useWorktreeAwarenessEnvironment({
    callMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock,
    addEnvironmentFromPairingCodeMock,
    listEnvironmentsMock,
    spawnMock
  })

  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orca-gates-propose-'))
  })

  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('sends the gates as given and says that nothing changed yet', async () => {
    mockHost()
    await main(
      [
        'gates',
        'propose',
        '--gates',
        JSON.stringify(gates),
        '--rationale',
        'Found in package.json',
        '--worktree',
        worktree
      ],
      '/tmp/api'
    )
    expect(callMock).toHaveBeenCalledWith('qualityGates.propose', {
      worktree,
      gates,
      rationale: 'Found in package.json'
    })
    expect(printed().split('\n')).toEqual([
      'Proposed 2 quality gate(s). Nothing changed yet and nothing runs from a proposal:',
      'add\tLint\trequired\t600s\tpnpm lint',
      'change test\tUnit tests\toptional\t900s\tpnpm test',
      'The user accepts or dismisses the proposal in the repository settings of the Orca app. Until then the gates in orca gates list stay in force.'
    ])
  })

  it('reads the gates from a file, as an array or with a rationale', async () => {
    mockHost()
    writeFileSync(join(dir, 'gates.json'), JSON.stringify(gates))
    await main(['gates', 'propose', '--file', 'gates.json', '--worktree', worktree], dir)
    expect(callMock).toHaveBeenLastCalledWith('qualityGates.propose', { worktree, gates })

    writeFileSync(join(dir, 'with-why.json'), JSON.stringify({ gates, rationale: 'From CI' }))
    await main(
      ['gates', 'propose', '--file', join(dir, 'with-why.json'), '--worktree', worktree],
      '/tmp/api'
    )
    expect(callMock).toHaveBeenLastCalledWith('qualityGates.propose', {
      worktree,
      gates,
      rationale: 'From CI'
    })
  })

  it('prints the stored proposal as JSON for a script', async () => {
    mockHost()
    await main(
      ['gates', 'propose', '--gates', JSON.stringify(gates), '--worktree', worktree, '--json'],
      '/tmp/api'
    )
    expect(JSON.parse(printed()).result.proposal).toMatchObject({
      id: 'p1',
      items: [
        { id: 'item-1', name: 'Lint' },
        { id: 'item-2', gateId: 'test' }
      ]
    })
  })

  it.each([
    ['neither --gates nor --file', []],
    ['both of them', ['--gates', '[]', '--file', 'gates.json']],
    ['text that is no JSON', ['--gates', 'pnpm lint']],
    ['JSON that is no list of gates', ['--gates', '{"name":"Lint"}']],
    ['an empty list', ['--gates', '[]']],
    ['a file that is not there', ['--file', 'missing.json']]
  ])('refuses %s before calling the host', async (_name, args) => {
    mockHost()
    await main(['gates', 'propose', ...args, '--worktree', worktree], dir)
    expect(callMock.mock.calls.map((call) => call[0])).not.toContain('qualityGates.propose')
    expect(console.error).toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('has no command or flag that accepts or dismisses a proposal, or names a repository', () => {
    const gateCommands = COMMAND_SPECS.filter((spec) => spec.path[0] === 'gates')
    expect(gateCommands.map((spec) => spec.path.join(' ')).sort()).toEqual([
      'gates cancel',
      'gates list',
      'gates loop',
      'gates propose',
      'gates run',
      'gates status'
    ])
    const flags = gateCommands.find((spec) => spec.path[1] === 'propose')?.allowedFlags ?? []
    for (const flag of ['accept', 'dismiss', 'resolve', 'apply', 'repo', 'proposal']) {
      expect(flags).not.toContain(flag)
    }
  })

  it('tells the user to update a host from before proposals, and passes on a refusal', async () => {
    mockHost()
    callMock.mockRejectedValue(new RuntimeClientError('method_not_found', 'Unknown method'))
    await main(['gates', 'propose', '--gates', JSON.stringify(gates), '--worktree', worktree], dir)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('does not take proposals of quality gates yet')
    )
    expect(process.exitCode).toBe(1)

    callMock.mockRejectedValue(
      new RuntimeClientError('invalid_argument', 'A quality gate named "Lint" already exists.')
    )
    await main(['gates', 'propose', '--gates', JSON.stringify(gates), '--worktree', worktree], dir)
    expect(console.error).toHaveBeenLastCalledWith(expect.stringContaining('already exists'))
  })
})
