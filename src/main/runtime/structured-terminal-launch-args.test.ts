import { describe, expect, it } from 'vitest'
import { structuredTerminalLaunchArgs } from './structured-terminal-launch-args'

const args = (command: string, platform: NodeJS.Platform = 'darwin') =>
  structuredTerminalLaunchArgs({ agent: 'codex', command, providerSessionId: 'thread-1', platform })

describe('configuration of an adopted terminal agent', () => {
  it('uses the manual child configuration instead of adding Orca launch defaults', () => {
    expect(args('/opt/codex/bin/codex')).toEqual([])
    expect(
      args('codex --sandbox read-only --ask-for-approval on-request -m gpt-5.6 --effort high')
    ).toEqual([
      '--sandbox',
      'read-only',
      '--ask-for-approval',
      'on-request',
      '-m',
      'gpt-5.6',
      '-c',
      'model_reasoning_effort=high'
    ])
  })

  it.each([
    'codex --model gpt-5.6 "Fix the failing refresh test"',
    'codex --model gpt-5.6 Fix the failing refresh test',
    'codex resume thread-1 --model gpt-5.6 "Fix the failing refresh test"',
    'codex --model gpt-5.6 resume thread-1 Fix the failing refresh test'
  ])('discards the already delivered prompt in %s', (command) => {
    expect(args(command)).toEqual(['--model', 'gpt-5.6'])
  })

  it.each(['codex resume old-thread', 'codex resume', 'codex resume --last', 'codex resume --all'])(
    'accepts the original selector after interactive /resume: %s',
    (command) => {
      expect(args(command)).toEqual([])
    }
  )

  it('does not mistake option values for resume commands or prompts', () => {
    expect(
      args(
        'codex -p resume -c approval_policy=never --config \'sandbox_mode="workspace-write"\' resume thread-1 Done'
      )
    ).toEqual([
      '-p',
      'resume',
      '-c',
      'approval_policy=never',
      '--config',
      'sandbox_mode="workspace-write"'
    ])
  })

  it('recognizes a quoted Windows native executable and keeps its configuration', () => {
    expect(
      args('"C:\\Program Files\\Codex\\codex.exe" resume thread-1 -m gpt-5.6', 'win32')
    ).toEqual(['-m', 'gpt-5.6'])
  })

  it.each([
    'codex exec Fix it',
    'codex --remote ws://remote',
    'codex --sandbox',
    'codex Fix it --sandbox danger-full-access',
    'codex resume thread-1 --unknown foo'
  ])('refuses ambiguous or incompatible semantics in %s', (command) => {
    expect(() => args(command)).toThrow(/cannot be preserved/)
  })

  it('preserves supported Claude options while removing only the proven resume target', () => {
    expect(
      structuredTerminalLaunchArgs({
        agent: 'claude',
        command: 'claude --resume session-1 --model sonnet --permission-mode acceptEdits',
        providerSessionId: 'session-1'
      })
    ).toEqual(['--model', 'sonnet', '--permission-mode', 'acceptEdits'])
  })
})
