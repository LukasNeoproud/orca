import { describe, expect, it } from 'vitest'
import { buildAzureDevOpsDraftReworkPrompt } from './azure-devops-draft-rework-prompt'

const pullRequest = { key: 'org+repo+12', pullRequestId: 12, title: 'Fix', repository: 'repo' }

describe('buildAzureDevOpsDraftReworkPrompt', () => {
  it('lists each draft with its location, body and instruction', () => {
    const prompt = buildAzureDevOpsDraftReworkPrompt({
      pullRequest,
      cli: 'orca',
      generalInstruction: '  Check thread safety. ',
      items: [
        {
          draft: {
            id: 'd1',
            kind: 'inline',
            filePath: 'src/a.ts',
            anchor: { side: 'right', startLine: 4, endLine: 6 },
            threadId: null,
            body: 'Race here?'
          },
          instruction: 'Verify against the lock in b.ts'
        },
        {
          draft: {
            id: 'd2',
            kind: 'reply',
            filePath: null,
            anchor: null,
            threadId: 9,
            body: 'Agreed.'
          },
          instruction: ''
        }
      ]
    })
    expect(prompt).toContain('Rework 2 Orca drafts on Azure DevOps pull request !12 "Fix"')
    expect(prompt).toContain('pullRequestKey `org+repo+12`')
    expect(prompt).toContain(
      'Instruction for all drafts below (trusted, from the user): Check thread safety.'
    )
    expect(prompt).toContain(
      'Draft d1 (src/a.ts, lines 4-6):\n<<<\nRace here?\n>>>\nInstruction for this draft: Verify against the lock in b.ts'
    )
    expect(prompt).toContain('Draft d2 (reply to thread #9):\n<<<\nAgreed.\n>>>\n\nWhen done')
    expect(prompt).toContain('`orca ado draft update <id> --body-file -`')
  })

  it('omits the general instruction when there is none', () => {
    const prompt = buildAzureDevOpsDraftReworkPrompt({
      pullRequest,
      cli: 'orca',
      generalInstruction: ' ',
      items: [
        {
          draft: {
            id: 'd1',
            kind: 'general',
            filePath: null,
            anchor: null,
            threadId: null,
            body: 'Nice.'
          },
          instruction: 'Shorter'
        }
      ]
    })
    expect(prompt).toContain('Rework one Orca draft')
    expect(prompt).not.toContain('Instruction for all drafts')
  })
})
