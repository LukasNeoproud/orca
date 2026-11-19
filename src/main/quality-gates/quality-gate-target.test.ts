import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityGateDefinition } from '../../shared/quality-gate-types'
import { SshHostNotServedError } from '../providers/ssh-host-not-served-error'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { resolveQualityGateTarget } from './quality-gate-target'

const lint: QualityGateDefinition = {
  id: 'lint',
  name: 'Lint',
  command: 'echo lint',
  required: true,
  timeoutSeconds: 60
}

describe('resolveQualityGateTarget', () => {
  let root: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-gate-target-')))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function runtimeFor(options: {
    repo?: Record<string, unknown> | null
    workspace?: Record<string, unknown>
    projectRuntime?: unknown
  }): OrcaRuntimeService {
    const workspace = { id: 'repo::/work', repoId: 'repo', path: root, ...options.workspace }
    const repo =
      options.repo === null
        ? []
        : [{ id: 'repo', path: root, qualityGates: [lint], ...options.repo }]
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only the three members given here.
    return {
      showManagedTerminalWorkspace: vi.fn(async () => workspace),
      listRepos: () => repo,
      resolveProjectRuntimeForWorktree: () => options.projectRuntime
    } as unknown as OrcaRuntimeService
  }

  it('resolves a local git worktree to its root and the gates of the settings', async () => {
    const runtime = runtimeFor({ workspace: { hostId: 'local' } })
    expect(await resolveQualityGateTarget(runtime, 'id:repo::/work')).toEqual({
      repoId: 'repo',
      worktreeId: 'repo::/work',
      worktreePath: root,
      gates: [lint],
      feedbackLoop: { enabled: false, maxRounds: 3 },
      launch: { kind: 'native', cwd: root },
      source: { path: root, git: true }
    })
    expect(runtime.showManagedTerminalWorkspace).toHaveBeenCalledWith('id:repo::/work')
  })

  it('ties a folder repository to no commit but still runs its gates', async () => {
    const target = await resolveQualityGateTarget(
      runtimeFor({ repo: { kind: 'folder' }, workspace: { hostId: 'local' } }),
      'id:repo::/work'
    )
    expect(target.gates).toEqual([lint])
    expect(target.source).toEqual({ path: root, git: false })
  })

  it('has no gates for a folder workspace outside any repository', async () => {
    const target = await resolveQualityGateTarget(
      runtimeFor({ repo: null, workspace: { id: 'folder:group-1', repoId: '', hostId: 'local' } }),
      'id:folder:group-1'
    )
    expect(target).toMatchObject({
      repoId: '',
      gates: [],
      feedbackLoop: { enabled: false, maxRounds: 3 },
      launch: { kind: 'native', cwd: root },
      source: { path: root, git: false }
    })
  })

  it('refuses an SSH worktree this process does not serve', async () => {
    await expect(
      resolveQualityGateTarget(
        runtimeFor({ repo: { executionHostId: 'ssh:box' } }),
        'id:repo::/work'
      )
    ).rejects.toThrow(SshHostNotServedError)
  })

  it('refuses a worktree that another Orca host owns', async () => {
    await expect(
      resolveQualityGateTarget(
        runtimeFor({ repo: { executionHostId: 'runtime:server' } }),
        'id:repo::/work'
      )
    ).rejects.toThrow('another Orca host')
  })

  it('refuses a worktree whose host cannot be resolved', async () => {
    await expect(
      resolveQualityGateTarget(
        runtimeFor({ repo: null, workspace: { hostId: undefined } }),
        'id:repo::/work'
      )
    ).rejects.toThrow('could not be resolved')
  })

  it('drops a malformed gate row instead of running it', async () => {
    const target = await resolveQualityGateTarget(
      runtimeFor({
        repo: { qualityGates: [lint, { id: 'broken', name: 'Broken' }, 'echo x'] },
        workspace: { hostId: 'local' }
      }),
      'id:repo::/work'
    )
    expect(target.gates).toEqual([lint])
  })

  it('never reads gates from the worktree: not from orca.yaml, not from any file in it', async () => {
    const evil = 'echo pwned > pwned.txt'
    writeFileSync(
      join(root, 'orca.yaml'),
      `scripts:\n  setup: echo hi\nqualityGates:\n  - id: evil\n    name: Evil\n    command: ${evil}\n`
    )
    mkdirSync(join(root, '.orca'))
    writeFileSync(
      join(root, '.orca', 'quality-gates.json'),
      JSON.stringify([{ id: 'evil', name: 'Evil', command: evil }])
    )
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { lint: evil } }))

    const withGates = await resolveQualityGateTarget(
      runtimeFor({ workspace: { hostId: 'local' } }),
      'id:repo::/work'
    )
    expect(withGates.gates).toEqual([lint])

    const without = await resolveQualityGateTarget(
      runtimeFor({ repo: { qualityGates: undefined }, workspace: { hostId: 'local' } }),
      'id:repo::/work'
    )
    expect(without.gates).toEqual([])
  })
})
