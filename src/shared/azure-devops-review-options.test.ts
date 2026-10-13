import { describe, expect, it } from 'vitest'
import {
  azureDevOpsReviewOptionLines,
  azureDevOpsReviewPermissionArg,
  DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS,
  normalizeAzureDevOpsReviewOptions
} from './azure-devops-review-options'

describe('normalizeAzureDevOpsReviewOptions', () => {
  it('falls back to a Czech static review for unknown input', () => {
    expect(normalizeAzureDevOpsReviewOptions(null)).toEqual(DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS)
    expect(
      normalizeAzureDevOpsReviewOptions({ language: 'de', depth: 'deploy', checks: 'lint' })
    ).toEqual(DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS)
  })

  it('keeps known checks in a stable order and drops executing ones from a static review', () => {
    expect(
      normalizeAzureDevOpsReviewOptions({
        depth: 'build-and-test',
        checks: ['security', 'unknown', 'lint']
      }).checks
    ).toEqual(['lint', 'security'])
    expect(
      normalizeAzureDevOpsReviewOptions({ depth: 'static', checks: ['lint', 'security'] }).checks
    ).toEqual(['security'])
  })

  it('opens in the terminal unless the chat was chosen', () => {
    expect(normalizeAzureDevOpsReviewOptions({}).surface).toBe('terminal')
    expect(normalizeAzureDevOpsReviewOptions({ surface: 'chat' }).surface).toBe('chat')
    expect(normalizeAzureDevOpsReviewOptions({ surface: 'popup' }).surface).toBe('terminal')
  })

  it('trims and bounds the reviewer instructions', () => {
    const options = normalizeAzureDevOpsReviewOptions({ instructions: `  ${'x'.repeat(5000)} ` })
    expect(options.instructions).toHaveLength(4000)
  })
})

describe('azureDevOpsReviewOptionLines', () => {
  it('forbids running code in a static review', () => {
    const lines = azureDevOpsReviewOptionLines(DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS).join('\n')
    expect(lines).toContain('in Czech')
    expect(lines).toContain('Do not install dependencies, build, run tests')
    expect(lines).not.toContain('leave tracked files unchanged')
  })

  it('runs the chosen checks and keeps tracked files intact when building', () => {
    const lines = azureDevOpsReviewOptionLines({
      language: 'en',
      depth: 'build-and-test',
      checks: ['full-test-suite', 'dependency-audit'],
      instructions: 'Start Docker first.',
      surface: 'terminal',
      permissions: 'auto'
    }).join('\n')
    expect(lines).toContain('in English')
    expect(lines).toContain('run the tests that cover the changed code')
    expect(lines).toContain('Run the full test suite')
    expect(lines).toContain('known vulnerabilities')
    expect(lines).toContain('leave tracked files unchanged')
    expect(lines).toContain('Start Docker first.')
  })
})

describe('azureDevOpsReviewPermissionArg', () => {
  it('asks each terminal agent for its own automatic approvals', () => {
    expect(azureDevOpsReviewPermissionArg('claude', { permissions: 'auto' }, false)).toBe(
      '--permission-mode auto'
    )
    expect(azureDevOpsReviewPermissionArg('codex', { permissions: 'auto' }, false)).toBe(
      '--approve-for-me'
    )
    expect(azureDevOpsReviewPermissionArg('gemini', { permissions: 'auto' }, false)).toBeNull()
  })

  it('adds nothing when Agent Permissions already bypasses or the user keeps it', () => {
    expect(azureDevOpsReviewPermissionArg('claude', { permissions: 'auto' }, true)).toBeNull()
    expect(azureDevOpsReviewPermissionArg('claude', { permissions: 'settings' }, false)).toBeNull()
  })
})
