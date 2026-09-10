import { describe, expect, it } from 'vitest'
import { buildAgentResumeStartupPlan } from '../../shared/tui-agent-startup'
import { quoteStartupArg } from '../../shared/tui-agent-startup-shell'
import { resolveCodexStructuredTuiLaunchArgs } from './codex-structured-tui-options'

const base = { cwd: '/workspace', shell: 'posix' as const }

describe('Codex structured TUI options', () => {
  it('preserves pinned arguments when neither new control is selected', () => {
    const launchArgs = ['--search', '--profile', 'review']
    expect(resolveCodexStructuredTuiLaunchArgs({ ...base, launchArgs })).toEqual(launchArgs)
    expect(resolveCodexStructuredTuiLaunchArgs(base)).toBeUndefined()
  })

  it.each(['priority', 'default', 'flex', 'fast'])(
    'carries explicit %s without a selected model',
    (serviceTier) => {
      const args = resolveCodexStructuredTuiLaunchArgs({
        ...base,
        launchArgs: [
          '--search',
          '--config=service_tier="previous"',
          '-c',
          'model_reasoning_effort=high'
        ],
        options: { serviceTier }
      })
      expect(args).toEqual([
        '--search',
        '-c',
        'model_reasoning_effort=high',
        '-c',
        `service_tier="${serviceTier === 'fast' ? 'priority' : serviceTier}"`
      ])
    }
  )

  it.each([
    ['read-only', 'read-only', 'on-request'],
    ['workspace-write', 'workspace-write', 'on-request'],
    ['full-access', 'danger-full-access', 'never']
  ])('replaces conflicting startup grants for %s', (permissions, sandbox, approval) => {
    const args = resolveCodexStructuredTuiLaunchArgs({
      ...base,
      launchArgs: [
        '--search',
        '-sdanger-full-access',
        '--ask-for-approval=never',
        '--yolo',
        '--full-auto',
        '--dangerously-bypass-approvals-and-sandbox',
        '--approve-for-me',
        '--add-dir',
        '/other',
        '-capproval_policy=never',
        '--config=sandbox_mode="danger-full-access"',
        '-c',
        'approvals_reviewer="guardian_subagent"',
        '-c=sandbox_workspace_write.network_access=true',
        '-c',
        'sandbox_workspace_write={writable_roots=["/other"]}'
      ],
      options: { permissions }
    })!
    expect(args).toEqual([
      '--search',
      '--sandbox',
      sandbox,
      '--ask-for-approval',
      approval,
      '-c',
      'approvals_reviewer="user"',
      '-c',
      'sandbox_workspace_write={writable_roots=[],network_access=false,exclude_tmpdir_env_var=false,exclude_slash_tmp=false}'
    ])
  })

  it('preserves unrelated settings and post-terminator text', () => {
    expect(
      resolveCodexStructuredTuiLaunchArgs({
        ...base,
        launchArgs: ['-c', 'model="custom"', '--', '--sandbox', 'danger-full-access'],
        options: { serviceTier: 'priority' }
      })
    ).toEqual([
      '-c',
      'model="custom"',
      '-c',
      'service_tier="priority"',
      '--',
      '--sandbox',
      'danger-full-access'
    ])
  })

  it.each([
    ['--profile', 'named'],
    ['--config=default_permissions="custom"'],
    ['-c', 'permissions.custom.filesystem="write"'],
    ['--cd=/other']
  ])('refuses unrepresentable policy overrides %j', (...launchArgs) => {
    expect(() =>
      resolveCodexStructuredTuiLaunchArgs({
        ...base,
        launchArgs,
        options: { permissions: 'read-only' }
      })
    ).toThrow('custom permission profiles or working-directory overrides')
  })

  it.each([
    'codex --yolo',
    'codex -c service_tier="priority"',
    'sh -lc "codex --yolo"',
    'codex --',
    'codex "initial prompt"'
  ])('refuses conflicting custom command %s before launch', (commandOverride) => {
    expect(() =>
      resolveCodexStructuredTuiLaunchArgs({
        ...base,
        launchArgs: [],
        options: { permissions: 'read-only', serviceTier: 'default' },
        commandOverride
      })
    ).toThrow('Cannot preserve Codex chat options')
  })

  it('refuses unknown option values and missing pinned arguments', () => {
    expect(() =>
      resolveCodexStructuredTuiLaunchArgs({
        ...base,
        launchArgs: [],
        options: { serviceTier: 'turbo' }
      })
    ).toThrow('unknown service tier')
    expect(() =>
      resolveCodexStructuredTuiLaunchArgs({
        ...base,
        options: { permissions: 'read-only' }
      })
    ).toThrow('no pinned CLI arguments')
  })

  it.each(['posix', 'powershell', 'cmd'] as const)(
    'uses the existing resume builder and quoting on %s',
    (shell) => {
      const args = resolveCodexStructuredTuiLaunchArgs({
        cwd: shell === 'posix' ? '/workspace' : 'C:\\workspace',
        shell,
        launchArgs: ['--search'],
        options: { permissions: 'workspace-write', serviceTier: 'default' }
      })!
      const startup = buildAgentResumeStartupPlan({
        agent: 'codex',
        providerSession: { key: 'session_id', id: 'thread-1' },
        cmdOverrides: {},
        platform: shell === 'posix' ? 'linux' : 'win32',
        shell,
        agentArgs: args.map((arg) => quoteStartupArg(arg, shell)).join(' ')
      })
      expect(startup?.launchCommand).toContain('resume')
      expect(startup?.launchCommand).toContain('thread-1')
      expect(startup?.launchCommand).toContain('workspace-write')
      expect(startup?.launchCommand).toContain('service_tier=')
    }
  )
})
