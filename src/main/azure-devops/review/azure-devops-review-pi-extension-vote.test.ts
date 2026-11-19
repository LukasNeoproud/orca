import { describe, expect, it } from 'vitest'
import { AZURE_DEVOPS_REVIEW_TOOLS } from '../../../shared/azure-devops-review-tools'
import { buildAzureDevOpsReviewPiExtensionSource } from './azure-devops-review-pi-extension-source'

describe('Pi review extension', () => {
  // The tool list itself is pinned in src/cli/azure-devops-review-agent-surfaces.test.ts.
  it('declares the shared review tools and reaches Orca only through orca ado mcp', () => {
    const source = buildAzureDevOpsReviewPiExtensionSource('orca')

    expect(source).toContain(JSON.stringify(AZURE_DEVOPS_REVIEW_TOOLS))
    expect(source).toContain("['ado', 'mcp']")
    expect(source).not.toMatch(/publishDrafts|azureDevOpsReview\.|"vote"/)
  })
})
