import { describe, expect, it } from 'vitest'
import {
  buildAzureDevOpsDraftCreateParams,
  buildAzureDevOpsDraftPatch,
  parseAzureDevOpsListStatus
} from './azure-devops-review-requests'

describe('buildAzureDevOpsDraftCreateParams', () => {
  it('builds an agent-authored inline draft', () => {
    expect(
      buildAzureDevOpsDraftCreateParams({
        pr: 'k',
        kind: 'inline',
        body: 'Fix',
        file: 'a.ts',
        line: 3,
        agentLabel: 'claude'
      })
    ).toEqual({
      pullRequestKey: 'k',
      kind: 'inline',
      body: 'Fix',
      filePath: 'a.ts',
      anchor: { side: 'right', startLine: 3, endLine: 3 },
      author: { kind: 'agent', label: 'claude' }
    })
  })

  it('rejects incomplete drafts', () => {
    expect(() =>
      buildAzureDevOpsDraftCreateParams({ pr: 'k', kind: 'inline', body: 'x', file: 'a' })
    ).toThrow()
    expect(() => buildAzureDevOpsDraftCreateParams({ pr: 'k', kind: 'reply', body: 'x' })).toThrow()
    expect(() => buildAzureDevOpsDraftCreateParams({ pr: 'k', kind: 'vote', body: 'x' })).toThrow()
    expect(() =>
      buildAzureDevOpsDraftCreateParams({
        pr: 'k',
        kind: 'inline',
        body: 'x',
        file: 'a',
        line: 5,
        endLine: 2
      })
    ).toThrow()
  })
})

describe('buildAzureDevOpsDraftPatch', () => {
  it('requires at least one change', () => {
    expect(() => buildAzureDevOpsDraftPatch({})).toThrow(/Nothing to update/)
    expect(buildAzureDevOpsDraftPatch({ rebase: true })).toEqual({ rebaseToLatest: true })
  })
})

describe('parseAzureDevOpsListStatus', () => {
  it('defaults to active and validates values', () => {
    expect(parseAzureDevOpsListStatus(undefined)).toBe('active')
    expect(parseAzureDevOpsListStatus('all')).toBe('all')
    expect(() => parseAzureDevOpsListStatus('open')).toThrow()
  })
})
