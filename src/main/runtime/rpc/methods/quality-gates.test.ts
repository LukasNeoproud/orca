import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RUNTIME_CAPABILITIES } from '../../../../shared/protocol-version'
import { QUALITY_GATES_RUNTIME_CAPABILITY } from '../../../../shared/host-feature-runtime-capabilities'
import type {
  QualityGateDefinition,
  QualityGateRunOutput,
  QualityGateRunStartResult,
  QualityGateStatusResult
} from '../../../../shared/quality-gate-types'
import { runQualityGateCommand } from '../../../quality-gates/quality-gate-command-run'
import { _setQualityGateServiceForTests } from '../../../quality-gates/quality-gate-host'
import { createQualityGateRunStore } from '../../../quality-gates/quality-gate-run-store'
import { createQualityGateService } from '../../../quality-gates/quality-gate-service'
import { readQualityGateSourceState } from '../../../quality-gates/quality-gate-source-state'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import type { RpcResponse } from '../core'
import type { RpcCallerIdentity } from '../rpc-caller-identity'
import { ALL_RPC_METHODS } from './index'
import { QUALITY_GATE_METHODS } from './quality-gates'

const lint: QualityGateDefinition = {
  id: 'lint',
  name: 'Lint',
  command: 'pwd; echo lint ok',
  required: true,
  timeoutSeconds: 30
}
const failing: QualityGateDefinition = { ...lint, id: 'test', name: 'Tests', command: 'exit 4' }

describe.skipIf(process.platform === 'win32')('qualityGates RPC', () => {
  let root: string
  let worktree: string
  let repoRow: Record<string, unknown>
  let workspaceHostId: string | undefined
  const updateRepo = vi.fn()

  function runtime(): OrcaRuntimeService {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the gate methods and repo.update read only the members given here.
    return {
      getRuntimeId: () => 'test-runtime',
      showManagedTerminalWorkspace: async () => ({
        id: 'repo::/work',
        repoId: 'repo',
        path: worktree,
        hostId: workspaceHostId
      }),
      listRepos: () => [repoRow],
      resolveProjectRuntimeForWorktree: () => undefined,
      updateRepo
    } as unknown as OrcaRuntimeService
  }

  function dispatcher(methods = ALL_RPC_METHODS): RpcDispatcher {
    return new RpcDispatcher({ runtime: runtime(), methods })
  }

  /** No transport options is the runtime socket: what `orca`, its MCP servers and agents use. */
  function call(
    method: string,
    params: unknown,
    caller?: RpcCallerIdentity,
    host = dispatcher()
  ): Promise<RpcResponse> {
    return host.dispatch(
      { id: 'req', authToken: 'token', method, params },
      caller ? { caller } : undefined
    )
  }

  async function result<T>(response: Promise<RpcResponse>): Promise<T> {
    const settled = await response
    if (!settled.ok) {
      throw new Error(`${settled.error.code}: ${settled.error.message}`)
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: each caller names the result type of the method it called.
    return settled.result as T
  }

  async function settledStatus(): Promise<QualityGateStatusResult> {
    let status = await result<QualityGateStatusResult>(
      call('qualityGates.status', { worktree: 'id:repo::/work' })
    )
    await expect
      .poll(
        async () => {
          status = await result<QualityGateStatusResult>(
            call('qualityGates.status', { worktree: 'id:repo::/work' })
          )
          return status.gates.every((entry) => entry.latestRun?.liveness !== 'live')
        },
        { timeout: 20_000 }
      )
      .toBe(true)
    return status
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-gate-rpc-')))
    worktree = join(root, 'worktree')
    mkdirSync(worktree)
    repoRow = { id: 'repo', path: worktree, kind: 'folder', qualityGates: [lint, failing] }
    workspaceHostId = 'local'
    updateRepo.mockReset()
    updateRepo.mockImplementation(async (_repo, updates) => ({ ...repoRow, ...updates }))
    _setQualityGateServiceForTests(
      createQualityGateService({
        store: createQualityGateRunStore({ filePath: join(root, 'data', 'runs.json') }),
        hostInstanceId: 'host-a',
        runCommand: runQualityGateCommand,
        readSource: readQualityGateSourceState,
        runnerDirectory: join(root, 'data', 'runners'),
        now: Date.now,
        newRunId: (() => {
          let next = 0
          return () => `run-${++next}`
        })()
      })
    )
  })

  afterEach(() => {
    _setQualityGateServiceForTests(null)
    rmSync(root, { recursive: true, force: true })
  })

  it('advertises the capability a client checks before calling an older host', () => {
    expect(RUNTIME_CAPABILITIES).toContain(QUALITY_GATES_RUNTIME_CAPABILITY)
  })

  it('runs the gates of the settings from the runtime socket, in the worktree root', async () => {
    const started = await result<QualityGateRunStartResult>(
      call('qualityGates.run', { worktree: 'id:repo::/work' })
    )
    expect(started.runs.map(({ run, started: fresh }) => [run.gateId, fresh])).toEqual([
      ['lint', true],
      ['test', true]
    ])

    const status = await settledStatus()
    expect(status.gates.map((entry) => entry.latestRun)).toMatchObject([
      { gateId: 'lint', status: 'passed', exitCode: 0, startedBy: { kind: 'local-cli' } },
      { gateId: 'test', status: 'failed', exitCode: 4 }
    ])
    // A folder repository has no git: the run is tied to no commit.
    expect(status.gates[0].latestRun).toMatchObject({
      source: { head: null, clean: null },
      freshness: { state: 'unlinked' }
    })

    const output = await result<QualityGateRunOutput>(
      call('qualityGates.output', { worktree: 'id:repo::/work', runId: started.runs[0].run.id })
    )
    expect(output.stdout).toBe(`${worktree}\nlint ok\n`)
  })

  it('records a paired device and the desktop app as who started a run', async () => {
    const fromPhone = await result<QualityGateRunStartResult>(
      call(
        'qualityGates.run',
        { worktree: 'id:repo::/work', gateIds: ['lint'] },
        { kind: 'paired-device', deviceId: 'phone-1' }
      )
    )
    expect(fromPhone.runs[0].run.startedBy).toEqual({ kind: 'paired-device', deviceId: 'phone-1' })
    await settledStatus()
  })

  it('refuses to run for a workspace another host owns instead of running it here', async () => {
    repoRow = { ...repoRow, executionHostId: 'ssh:box' }
    workspaceHostId = undefined
    const overSsh = await call('qualityGates.run', { worktree: 'id:repo::/work' })
    expect(overSsh.ok).toBe(false)

    repoRow = { ...repoRow, executionHostId: 'runtime:server' }
    const paired = await call('qualityGates.run', { worktree: 'id:repo::/work' })
    expect(paired).toMatchObject({ ok: false })
    expect(paired.ok ? '' : paired.error.message).toContain('another Orca host')
    expect(readdirSync(root)).toEqual(['worktree'])
  })

  it('answers a client of an older host with method_not_found, which reads as unsupported', async () => {
    const olderHost = dispatcher(
      ALL_RPC_METHODS.filter((method) => !method.name.startsWith('qualityGates.'))
    )
    const response = await call(
      'qualityGates.status',
      { worktree: 'id:repo::/work' },
      undefined,
      olderHost
    )
    expect(response).toMatchObject({ ok: false, error: { code: 'method_not_found' } })
  })

  describe('defining a gate', () => {
    const evil = { id: 'evil', name: 'Evil', command: 'echo pwned > pwned.txt', required: true }

    it('exposes run, read, cancel, change-signal and loop-switch methods only', () => {
      expect(QUALITY_GATE_METHODS.map((method) => method.name).sort()).toEqual([
        'qualityGates.cancel',
        'qualityGates.list',
        'qualityGates.output',
        'qualityGates.run',
        'qualityGates.setFeedbackLoop',
        'qualityGates.status',
        'qualityGates.subscribe',
        'qualityGates.unsubscribe'
      ])
      expect(
        ALL_RPC_METHODS.map((method) => method.name).filter((name) => /quality/i.test(name))
      ).toHaveLength(QUALITY_GATE_METHODS.length)
    })

    it('ignores a command or a definition smuggled into a run request', async () => {
      await result<QualityGateRunStartResult>(
        call('qualityGates.run', {
          worktree: 'id:repo::/work',
          gateIds: ['lint'],
          command: evil.command,
          gates: [evil],
          qualityGates: [evil],
          gate: evil
        })
      )
      await settledStatus()
      expect(readdirSync(worktree)).toEqual([])
    })

    it('refuses a gate id the settings do not hold', async () => {
      const response = await call('qualityGates.run', {
        worktree: 'id:repo::/work',
        gateIds: ['evil']
      })
      expect(response.ok).toBe(false)
    })

    it.each([
      ['the runtime socket', undefined],
      ['the desktop app', { kind: 'desktop' } as const],
      ['a paired device', { kind: 'paired-device', deviceId: 'phone-1' } as const]
    ])('drops gates from repo.update sent by %s', async (_name, caller) => {
      const response = await call(
        'repo.update',
        { repo: 'id:repo', updates: { displayName: 'Renamed', qualityGates: [evil] } },
        caller
      )
      expect(response.ok).toBe(true)
      expect(updateRepo).toHaveBeenCalledTimes(1)
      expect(updateRepo.mock.calls[0][1]).toEqual({ displayName: 'Renamed' })
      expect(JSON.stringify(response)).not.toContain('pwned')
    })

    it('has no RPC schema or CLI source that names the gates field', () => {
      const offenders: string[] = []
      const scan = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name)
          if (entry.isDirectory()) {
            scan(path)
          } else if (
            /\.tsx?$/.test(entry.name) &&
            !/\.test\.tsx?$/.test(entry.name) &&
            // `qualityGates.<method>` is a method name; anything else is the Repo field.
            /qualityGates(?!\.[a-z])/.test(readFileSync(path, 'utf-8'))
          ) {
            offenders.push(path)
          }
        }
      }
      const source = join(__dirname, '..', '..', '..', '..')
      scan(join(source, 'shared', 'rpc-contract'))
      scan(join(source, 'cli'))
      scan(join(source, 'main', 'runtime'))
      expect(offenders).toEqual([])
    })
  })

  describe('gates declared inside the repository', () => {
    beforeEach(() => {
      writeFileSync(
        join(worktree, 'orca.yaml'),
        [
          'scripts:',
          '  setup: echo setup',
          'qualityGates:',
          '  - id: evil',
          '    name: Evil',
          '    command: echo pwned > pwned.txt',
          'gates:',
          '  evil: echo pwned > pwned.txt',
          ''
        ].join('\n')
      )
      mkdirSync(join(worktree, '.orca'))
      writeFileSync(
        join(worktree, '.orca', 'quality-gates.json'),
        JSON.stringify([{ id: 'evil', name: 'Evil', command: 'echo pwned > pwned.txt' }])
      )
    })

    it('lists and runs only what the settings hold', async () => {
      const listed = await result<{ gates: QualityGateDefinition[] }>(
        call('qualityGates.list', { worktree: 'id:repo::/work' })
      )
      expect(listed.gates).toEqual([lint, failing])

      await result(call('qualityGates.run', { worktree: 'id:repo::/work' }))
      await settledStatus()
      expect(readdirSync(worktree).sort()).toEqual(['.orca', 'orca.yaml'])
    })

    it('has nothing to run when the settings hold no gate', async () => {
      repoRow = { id: 'repo', path: worktree, kind: 'folder' }
      const listed = await result<{ gates: QualityGateDefinition[] }>(
        call('qualityGates.list', { worktree: 'id:repo::/work' })
      )
      expect(listed.gates).toEqual([])
      const started = await result<QualityGateRunStartResult>(
        call('qualityGates.run', { worktree: 'id:repo::/work' })
      )
      expect(started.runs).toEqual([])
      expect(readdirSync(worktree).sort()).toEqual(['.orca', 'orca.yaml'])
    })
  })
})
