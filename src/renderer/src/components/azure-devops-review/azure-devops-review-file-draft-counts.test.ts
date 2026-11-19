import { describe, expect, it } from 'vitest'
import type { AzureDevOpsReviewDraft } from '../../../../shared/azure-devops-review-types'
import { countAzureDevOpsReviewFileDrafts } from './azure-devops-review-file-draft-counts'

type DraftFields = Pick<AzureDevOpsReviewDraft, 'filePath' | 'state' | 'author'>

const USER = { kind: 'user' } as const
const AGENT = { kind: 'agent', label: null } as const

function draft(
  filePath: string | null,
  author: DraftFields['author'] = USER,
  state: DraftFields['state'] = 'draft'
): DraftFields {
  return { filePath, author, state }
}

describe('countAzureDevOpsReviewFileDrafts', () => {
  it('counts unpublished drafts per file and the agent share separately', () => {
    const counts = countAzureDevOpsReviewFileDrafts([
      draft('src/a.ts'),
      draft('src/a.ts', AGENT),
      draft('src/a.ts', AGENT, 'failed'),
      draft('src/b.ts', AGENT)
    ])
    expect(Object.fromEntries(counts)).toEqual({
      'src/a.ts': { total: 3, agent: 2 },
      'src/b.ts': { total: 1, agent: 1 }
    })
  })

  it('skips published drafts and drafts without a file', () => {
    const counts = countAzureDevOpsReviewFileDrafts([
      draft('src/a.ts', USER, 'published'),
      draft('src/a.ts', AGENT, 'published'),
      draft(null),
      draft(null, AGENT)
    ])
    expect(counts.size).toBe(0)
  })
})
