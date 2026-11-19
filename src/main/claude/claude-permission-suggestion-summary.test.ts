import { describe, expect, it } from 'vitest'
import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk'
import { claudeRememberedAllowOption } from './claude-permission-suggestion-summary'

describe('claudeRememberedAllowOption', () => {
  it('puts what the CLI proposes to remember into words', () => {
    expect(
      claudeRememberedAllowOption([
        { type: 'addDirectories', directories: ['/repo/docs'], destination: 'session' },
        { type: 'setMode', mode: 'acceptEdits', destination: 'session' }
      ])
    ).toEqual({
      id: 'allowForSession',
      label: 'Allow for this session',
      description: 'access to /repo/docs; switch to acceptEdits mode — for this session'
    })
  })

  it('offers removals and types the SDK does not declare unexplained', () => {
    // As the CLI sends them: unvalidated JSON, which may name a type newer than the SDK.
    const suggestions: PermissionUpdate[] = JSON.parse(
      JSON.stringify([
        {
          type: 'removeRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'session'
        },
        { type: 'removeDirectories', directories: ['/tmp'], destination: 'session' },
        { type: 'futureUpdate', destination: 'session' }
      ])
    )

    expect(claudeRememberedAllowOption(suggestions)).toEqual({
      id: 'allowForSession',
      label: 'Allow for this session'
    })
  })
})
