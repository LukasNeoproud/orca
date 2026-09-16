import { describe, expect, it } from 'vitest'
import {
  decideWorkerStartMode,
  downgradeWorkerStartModeForHost,
  type WorkerStartModeReceipt
} from './orchestration-worker-start-mode'

const STRUCTURED_DEFAULT = {
  experimentalNativeChat: true,
  openAgentTabsInChatByDefault: true,
  experimentalStructuredNativeChat: true
}

function decide(
  overrides: {
    params?: Parameters<typeof decideWorkerStartMode>[0]['params']
    settings?: Parameters<typeof decideWorkerStartMode>[0]['settings']
  } = {}
): WorkerStartModeReceipt {
  return decideWorkerStartMode({
    params: { agent: 'claude', ...overrides.params },
    settings: overrides.settings === undefined ? STRUCTURED_DEFAULT : overrides.settings
  })
}

describe('worker start mode is independent of its default display', () => {
  it.each(['claude', 'codex'] as const)('starts a terminal %s with Chat UI enabled', (agent) => {
    expect(decide({ params: { agent } })).toMatchObject({
      mode: 'terminal',
      preferred: 'terminal',
      reason: 'user_default'
    })
  })

  it.each([
    { experimentalNativeChat: false },
    { openAgentTabsInChatByDefault: false },
    { experimentalStructuredNativeChat: false },
    { agentCmdOverrides: { claude: 'claude-wrapper' } }
  ])('keeps a terminal worker with settings %o', (settings) => {
    expect(decide({ settings: { ...STRUCTURED_DEFAULT, ...settings } }).mode).toBe('terminal')
  })

  it.each([
    { on: 'server-1' },
    { terminal: 'term_1' },
    { worktree: 'new-child' },
    { worktree: 'new-top-level' },
    { model: 'opus' },
    { effort: 'high' },
    { agent: 'cursor' },
    { agent: undefined }
  ])('preserves terminal placement and customization %o', (params) => {
    expect(decide({ params })).toMatchObject({ mode: 'terminal', preferred: 'terminal' })
  })

  it('uses terminal mode when settings are unavailable', () => {
    expect(decide({ settings: null }).mode).toBe('terminal')
  })
})

function legacyStructuredReceipt(): WorkerStartModeReceipt {
  return {
    mode: 'structured',
    preferred: 'structured',
    reason: 'user_default',
    detail: 'Existing structured launch'
  }
}

describe('the executing host settles what the client cannot', () => {
  it.each([
    ['wsl', 'wsl_execution_runtime'],
    ['remote', 'remote_execution_host'],
    ['agent', 'structured_unsupported_on_host']
  ] as const)('downgrades on a %s refusal', (reason, expected) => {
    expect(
      downgradeWorkerStartModeForHost(legacyStructuredReceipt(), { supported: false, reason })
    ).toMatchObject({
      mode: 'terminal',
      preferred: 'structured',
      reason: expected
    })
  })

  it('downgrades on a refusal that names no reason', () => {
    expect(
      downgradeWorkerStartModeForHost(legacyStructuredReceipt(), { supported: false }).reason
    ).toBe('structured_unsupported_on_host')
  })

  it('leaves a supported structured start and an already-terminal receipt alone', () => {
    expect(
      downgradeWorkerStartModeForHost(legacyStructuredReceipt(), { supported: true }).mode
    ).toBe('structured')
    const terminal = decide({ settings: null })
    expect(downgradeWorkerStartModeForHost(terminal, { supported: false, reason: 'wsl' })).toBe(
      terminal
    )
  })
})
