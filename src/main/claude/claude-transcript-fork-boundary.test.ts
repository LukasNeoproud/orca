import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveClaudeTranscriptForkBoundary } from './claude-transcript-fork-boundary'

const directories: string[] = []
const SESSION_ID = '819cf9f8-e43c-4ad7-b50f-54aa158a726a'

async function transcript(rows: Record<string, unknown>[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-claude-fork-'))
  directories.push(directory)
  const filePath = join(directory, 'session.jsonl')
  await writeFile(
    filePath,
    rows.map((row) => JSON.stringify({ sessionId: SESSION_ID, ...row })).join('\n')
  )
  return filePath
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('resolveClaudeTranscriptForkBoundary', () => {
  it('includes trailing tool results from the selected response and excludes the next prompt', async () => {
    const transcriptPath = await transcript([
      { uuid: 'user-1', parentUuid: null, type: 'user', message: { content: 'question' } },
      { uuid: 'assistant-1', parentUuid: 'user-1', type: 'assistant' },
      {
        uuid: 'tool-1',
        parentUuid: 'assistant-1',
        type: 'user',
        parent_tool_use_id: 'tool-call-1',
        message: { content: [{ type: 'tool_result', content: 'done' }] }
      },
      { uuid: 'user-2', parentUuid: 'tool-1', type: 'user', message: { content: 'later' } }
    ])

    await expect(
      resolveClaudeTranscriptForkBoundary({
        transcriptPath,
        providerSessionId: SESSION_ID,
        selectedUuid: 'assistant-1',
        leafUuid: 'user-2'
      })
    ).resolves.toBe('tool-1')
  })

  it('rejects an assistant item that was not the final response before the next prompt', async () => {
    const transcriptPath = await transcript([
      { uuid: 'user-1', parentUuid: null, type: 'user', message: { content: 'question' } },
      { uuid: 'assistant-1', parentUuid: 'user-1', type: 'assistant' },
      { uuid: 'assistant-2', parentUuid: 'assistant-1', type: 'assistant' },
      { uuid: 'user-2', parentUuid: 'assistant-2', type: 'user', message: { content: 'later' } }
    ])

    await expect(
      resolveClaudeTranscriptForkBoundary({
        transcriptPath,
        providerSessionId: SESSION_ID,
        selectedUuid: 'assistant-1',
        leafUuid: 'user-2'
      })
    ).rejects.toThrow('agent_session_branch_invalid_anchor')
  })
})
