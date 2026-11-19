import { describe, expect, it } from 'vitest'
import {
  buildAzureDevOpsFeedbackAgentPrompt,
  openAzureDevOpsFeedbackThreads,
  type AzureDevOpsFeedbackThread
} from './azure-devops-feedback-prompt'

const pullRequest = {
  key: 'dev.azure.com/contoso+repo+7',
  pullRequestId: 7,
  title: 'Add login',
  repository: 'App',
  sourceBranch: 'feature/login',
  targetBranch: 'main',
  status: 'active' as const,
  sourceCommit: 'sha7',
  targetCommit: 'base7'
}

function comment(id: number, content: string, isSystem = false) {
  return {
    id,
    parentCommentId: 0,
    author: { displayName: isSystem ? 'Azure DevOps' : 'Alice', uniqueName: null },
    content,
    publishedAt: null,
    isSystem
  }
}

const inlineThread: AzureDevOpsFeedbackThread = {
  id: 12,
  status: 'active',
  filePath: 'src/login.ts',
  anchor: { side: 'right', startLine: 3, endLine: 5 },
  comments: [comment(1, 'Validate the  token\nbefore use.'), comment(2, 'Agreed')]
}
const generalThread: AzureDevOpsFeedbackThread = {
  id: 13,
  status: 'pending',
  filePath: null,
  anchor: null,
  comments: [comment(3, 'Please add tests.')]
}

function prompt(access: 'mcp' | 'pi-tools' | 'cli', patch: { instruction?: string } = {}) {
  return buildAzureDevOpsFeedbackAgentPrompt({
    pullRequest,
    threads: [inlineThread, generalThread],
    tools: { cli: 'orca', access },
    language: 'cs',
    instruction: patch.instruction ?? ''
  })
}

describe('buildAzureDevOpsFeedbackAgentPrompt', () => {
  it('lists the chosen threads with their location and first comment', () => {
    const text = prompt('mcp')
    expect(text).toContain(
      '- Thread #12 (src/login.ts, lines 3-5), Alice: "Validate the token before use." (+1 reply)'
    )
    expect(text).toContain('- Thread #13 (general comment), Alice: "Please add tests."')
  })

  it('says when the commented code was rewritten or removed since the comment', () => {
    const text = buildAzureDevOpsFeedbackAgentPrompt({
      pullRequest,
      threads: [
        {
          ...inlineThread,
          anchor: { side: 'right', startLine: 7, endLine: 7 },
          originalAnchor: { side: 'right', startLine: 4, endLine: 4 },
          iterationId: 1,
          outdated: true
        },
        {
          ...inlineThread,
          id: 14,
          anchor: null,
          originalAnchor: { side: 'right', startLine: 3, endLine: 5 },
          iterationId: 2,
          outdated: true
        }
      ],
      tools: { cli: 'orca', access: 'cli' },
      language: 'en',
      instruction: ''
    })
    expect(text).toContain(
      '- Thread #12 (src/login.ts, line 7, rewritten since the comment on line 4 of iteration 1)'
    )
    expect(text).toContain(
      '- Thread #14 (src/login.ts, the commented lines are gone, was lines 3-5 of iteration 2)'
    )
  })

  it('works on the author branch, never committing, pushing or publishing', () => {
    const text = prompt('mcp')
    expect(text).toContain('source branch `feature/login` checked out')
    expect(text).toContain('`git log --oneline HEAD..origin/feature/login`')
    expect(text).toContain('`git diff origin/main...HEAD`')
    expect(text).toContain('Do not commit, push, publish or vote')
  })

  it('asks for one reply draft per thread with a proposed status', () => {
    const mcp = prompt('mcp')
    expect(mcp).toContain('`ado_create_draft` with kind `reply`')
    expect(mcp).toContain('`fixed` when your change addresses it')
    expect(prompt('cli')).toContain(
      'Answer the threads only with Orca reply drafts. `orca ado draft create --pr dev.azure.com/contoso+repo+7 --kind reply --thread <id> --thread-status <status> --body-file -`'
    )
  })

  it('carries the reply language and the trusted user instruction', () => {
    expect(prompt('mcp')).toContain('Write the reply drafts in Czech')
    expect(prompt('mcp')).not.toContain('Instruction from the user')
    expect(prompt('mcp', { instruction: '  keep the API  ' })).toContain(
      'Instruction from the user (trusted): keep the API'
    )
  })

  it('clips long first comments', () => {
    const long = buildAzureDevOpsFeedbackAgentPrompt({
      pullRequest,
      threads: [{ ...generalThread, comments: [comment(4, 'x'.repeat(500))] }],
      tools: { cli: 'orca', access: 'cli' },
      language: 'en',
      instruction: ''
    })
    expect(long).toContain(`"${'x'.repeat(240)}…"`)
    expect(long).toContain('Write the reply drafts in English.')
  })
})

describe('openAzureDevOpsFeedbackThreads', () => {
  it('keeps open threads that a person wrote in', () => {
    const resolved = { ...inlineThread, id: 14, status: 'fixed' as const }
    const systemOnly = {
      ...generalThread,
      id: 15,
      status: 'active' as const,
      comments: [comment(5, 'Policy updated', true)]
    }
    expect(
      openAzureDevOpsFeedbackThreads([inlineThread, generalThread, resolved, systemOnly]).map(
        (thread) => thread.id
      )
    ).toEqual([12, 13])
  })
})
