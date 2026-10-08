import { describe, expect, it } from 'vitest'
import {
  azureDevOpsReviewCliCommand,
  buildAzureDevOpsReviewAgentPrompt
} from './azure-devops-review-prompt'
import type { AzureDevOpsReviewPullRequest } from './azure-devops-review-types'

describe('azureDevOpsReviewCliCommand', () => {
  it('points dev builds at orca-dev and packaged builds at the platform CLI', () => {
    expect(azureDevOpsReviewCliCommand('darwin', true)).toBe('orca-dev')
    expect(azureDevOpsReviewCliCommand('win32', true)).toBe('orca-dev.cmd')
    expect(azureDevOpsReviewCliCommand('darwin', false)).toBe('orca')
    expect(azureDevOpsReviewCliCommand('linux', false)).toBe('orca-ide')
  })
})

describe('buildAzureDevOpsReviewAgentPrompt', () => {
  it('uses the given CLI for every Orca command', () => {
    const prompt = buildAzureDevOpsReviewAgentPrompt(
      {
        key: 'dev.azure.com/contoso+repo+7',
        pullRequestId: 7,
        title: 'Fix',
        repository: 'app',
        targetBranch: 'main'
      } as AzureDevOpsReviewPullRequest,
      'orca-dev'
    )
    expect(prompt).toContain('`orca-dev ado pr dev.azure.com/contoso+repo+7 --json`')
    expect(prompt).toContain('`orca-dev ado draft create`')
    expect(prompt).not.toMatch(/`orca ado/)
  })
})
